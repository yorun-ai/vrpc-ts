# vRPC Protocol

This document defines the vRPC wire contract implemented by `@yorun-ai/vrpc`. It is intended for runtime maintainers, transport authors, and code-generator maintainers. For application usage, see the [usage guide](../guides/usage.md).

## Request routing and envelope

Every invocation uses `POST`. The request path is formed from the encoded service and method names:

```text
<prefixUrl>/<encodeURIComponent(serviceName)>/<encodeURIComponent(methodName)>
```

JSON requests use this envelope. An argument-free method may supply either `null` or `{}`; the runtime serializes a missing value as `null`.

```json
{
  "params": {
    "userId": 1
  }
}
```

`options.wire` is client-only metadata and must never be serialized into the envelope or copied into a transport request.

## Response envelope and status

A successful response has a result and a null error:

```json
{
  "result": {
    "name": "Ada"
  },
  "error": null
}
```

An error response has a null result and may carry a structured error:

```json
{
  "result": null,
  "error": {
    "message": "user not found"
  }
}
```

The client treats a response as successful only when the HTTP status is successful and `vrpc-status` is `OK`. `vrpc-status` is the authoritative vRPC outcome; the body `error` supplies auxiliary `type`, `code`, `reason`, `message`, and `detail` fields. The runtime does not infer success from body fields or require `result` and `error` to form a strictly validated mutually exclusive envelope.

Other responses are unwrapped as `VrpcInvokeError`. If a response already carries a failing `vrpc-status` but its body or auxiliary protocol metadata cannot be decoded, it remains a `VrpcInvokeError` with `payload: null`, while the decoding failure is preserved as `cause`. Every response must contain valid `content-type`, `vrpc-status`, and `vrpc-server` headers; a JSON body must be non-empty and parseable. A missing `vrpc-status`, or an otherwise undecodable successful response, produces `VrpcProtocolError` with the HTTP response metadata intact.

### Error message construction

`VrpcInvokeError.message` deliberately combines the auxiliary body fields `message` and `detail`. When `message` is a non-empty string and trimmed `detail` is non-empty, the runtime produces:

```text
<message>
<detail>
```

The newline keeps the primary human-readable summary separate from the additional diagnostic or explanatory text while preserving both in ordinary logs, error boundaries, and UI fallbacks that display only `Error.message`. This behavior also preserves compatibility for applications that already surface the combined message.

The combined text is presentation data, not a classification contract. Applications must use `vrpc-status` for the protocol outcome and `code` plus `reason` for business branching; they must not parse `message` or `detail`. If the body has no usable `message`, the runtime falls back to the HTTP status-based error message.

## Content negotiation

`VrpcMethodWireSpec` is sparse:

```ts
type VrpcMethodWireSpec = {
  arguments?: VrpcWireSchema;
  result?: VrpcWireSchema;
};
```

Property presence selects CBOR independently in each direction:

| Wire metadata    | Request `content-type`  | Response `accept`                              |
| ---------------- | ----------------------- | ---------------------------------------------- |
| None             | `application/vrpc+json` | `application/vrpc+json`                        |
| `wire.arguments` | `application/vrpc+cbor` | `application/vrpc+json`                        |
| `wire.result`    | `application/vrpc+json` | `application/vrpc+cbor, application/vrpc+json` |
| Both properties  | `application/vrpc+cbor` | `application/vrpc+cbor, application/vrpc+json` |

If either property is present, the client requires a `cborCodec` before invoking the transport. A CBOR response is accepted only when `wire.result` is present. The codec must encode to `Uint8Array`; it may decode an envelope as either a JavaScript object or a `Map`.

## Protocol headers

| Header         | Value and rule                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `content-type` | The request media type selected above.                                                                                           |
| `accept`       | The response media types selected above.                                                                                         |
| `vrpc-client`  | `name=<name>,version=<semver>,instanceId=<uuid>`.                                                                                |
| `vrpc-trace`   | `id=<32 lowercase hex>` and optional `span=<16 lowercase hex>`. Portal mode allows an id-only trace; direct mode creates a span. |
| `vrpc-options` | `timeout=<positive integer>ms`; omitted when no timeout is configured.                                                           |
| `vrpc-server`  | Required response identity with the same name, version, and instance-id shape as `vrpc-client`.                                  |
| `vrpc-status`  | Required response status; `OK` is the success value.                                                                             |

Client names use lower-case dot-separated identifiers. Versions must be valid SemVer and instance IDs must be UUIDs. The runtime validates client information, traces, and timeouts before sending the request.

Application headers cannot override `accept`, `content-type`, or any header whose name starts with `vrpc-`.

## Wire schema conversion

`VrpcWireSchema` describes values that require shape preservation across generated TypeScript, JavaScript, and CBOR:

- `value`: no shape conversion.
- `binary`: normalize to `Uint8Array`.
- `list`: recursively convert array items.
- `map`: recursively convert values; integer-keyed records become `Map<number, T>` for CBOR and return to `Record<number, T>` after decoding.
- `object`: recursively convert declared fields while preserving other fields. Its field map may be a thunk to support recursive types.
- `nullable`: records nullability for generated contracts. The conversion functions preserve `null` and `undefined` for every schema and do not validate this flag.

String-keyed maps remain ordinary objects. Error values decoded from CBOR are normalized recursively from maps into objects, but binary values remain `Uint8Array`.

## Generated TypeScript contract

Generated TypeScript follows these rules:

- Values in `methods` are strings.
- A service without Binary methods omits `wire`.
- Only methods containing Binary have a `wire.<method>` entry and referenced schemas.
- Each method includes only the `arguments` or `result` side that contains Binary.
- `ArgumentsContainsBinaryType` and `ResultContainsBinaryType` are not emitted in TypeScript.
- Binary uses `Uint8Array`; Map uses `Record`.
- CBOR method wrappers use `{ ...options, wire: Spec.wire.method }`, so generated wire metadata overrides a caller field with the same name.
- Ordinary method wrappers pass options through unchanged.
- Argument-free method wrappers use `params: null`; the runtime also accepts `{}`.

Example:

```ts
export const FileServiceSpec = {
  serviceName: "file.FileService",
  methods: {
    ping: "ping",
    upload: "upload",
  },
  wire: {
    upload: {
      arguments: uploadArgumentsSchema,
    },
  },
} as const;
```

## Changing the protocol

Protocol changes affect more than this package. Review all producers and consumers, including Vine server behavior, `skelc` generation, runtime parsing, custom transports, and generated clients. Update protocol tests and this document in the same change.
