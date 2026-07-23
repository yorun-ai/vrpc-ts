# Architecture

## Scope

`@yorun-ai/vrpc` provides two layers:

- Generic HTTP client core: request orchestration, interceptors, timeouts, errors, and transports.
- vRPC protocol layer: Vine paths, headers, JSON/CBOR envelopes, and `vrpc-status`.

## Layers

- `src/contracts/`: all public types and error contracts.
- `src/core/`: protocol-independent lifecycle and HTTP/vRPC client assembly, without runtime network I/O.
- `src/transports/`: network I/O, `AbortController`, and raw-byte responses.
- `src/protocol/`: Vine headers, paths, envelopes, wire-schema conversion, and response parsing.
- `src/entrypoints/`: public exports for `./client` and `./http`.

A transport response must preserve the original `Uint8Array | null`. The generic HTTP core parses JSON, text, or empty responses, while the vRPC core selects JSON or a user-provided CBOR codec according to `content-type`.

## Generic HTTP flow

1. Create options define defaults for headers, timeout, requestInit, and suppressGlobalToast. Timeout has no built-in default, so the built-in transport creates no local timer unless configured.
2. Per-request `request.options` override defaults. Headers are merged, requestInit is shallow-merged, and per-request scalar values take precedence.
3. Interceptors receive `{ url, init, request, options }`; `options` contains the merged configuration.
4. The transport sends the request and returns raw bytes.
5. The core reconstructs a `Response`, parses JSON, text, or an empty response, and throws `HttpInvokeError` for a non-success status.

Request options and interceptor-only fields must not enter `HttpTransportRequest`.

## Error model

Normalized transport, protocol, and invocation errors extend `HttpClientError` and carry a stable `kind`, request URL and method, plus the original error in `cause` when one exists. Request-construction and user-interceptor exceptions remain ordinary developer errors. The public entry points expose a single guard followed by kind-based classification:

- vRPC: `isVrpcError(error)`
- Generic HTTP: `isHttpError(error)`

`HttpError` is the discriminated union of caller abort, timeout, transport, and HTTP invoke errors. `VrpcError` adds vRPC invoke and protocol errors to the three shared lifecycle errors. In particular, a generic `HttpInvokeError` is not a `VrpcError`; after `isVrpcError`, `kind: "invoke"` narrows directly to `VrpcInvokeError`. Application code therefore does not need to mix `kind` checks with `instanceof` checks.

The built-in Fetch transport determines whether its composed signal was aborted by the caller or by the configured timeout. Caller cancellation becomes `HttpAbortError`; timeout becomes `HttpTimeoutError`; other Fetch failures become `HttpTransportError`. The core preserves known package errors and wraps unknown custom-transport failures as `HttpTransportError`. Native `AbortError` and common adapter cancellation shapes are normalized internally rather than exposed through an additional public cancellation guard.

Generic HTTP response parsing is deliberately lenient and independent of `content-type`: an empty body becomes `null`, valid JSON is decoded, and a body that is not valid JSON remains text. JSON syntax is therefore not an HTTP failure category. The transport owns body reading; a failure to obtain complete response bytes becomes `HttpTransportError`.

vRPC decoding remains strict about its media type and required protocol metadata. A malformed successful vRPC response becomes `VrpcProtocolError` and retains HTTP status, response headers, `vrpc-status` when present, and the decoding failure as `cause`.

For a failed vRPC response, `vrpc-status` remains authoritative and the body error remains auxiliary. If the body cannot be decoded but a failing `vrpc-status` is present, the client throws `VrpcInvokeError` with `payload: null` and preserves the decoding error in `cause`. It does not replace the invocation failure with a protocol error or validate `result` and `error` as a strict mutually exclusive envelope.

Caller cancellation still reaches `onError` and still rejects the request promise. Applications that want quiet cancellation should return early from their global error handler when `error.kind === "abort"`; the transport and core must not convert cancellation into a successful result.

`suppressGlobalToast` is interceptor-only application policy metadata. The runtime merges the client default with the per-request override and exposes the resolved value through `context.options`; it never performs UI work, skips `onError`, consumes the rejection, or copies the field into a transport request. A normally completed `onError` chain is followed by rejection of the request Promise, allowing a local `try/catch` to implement feature-specific recovery.

## Protocol boundary

The vRPC protocol layer owns path construction, request and response envelopes, content negotiation, protocol headers, wire-schema conversion, and protocol-level errors. `core` orchestrates those operations; `transports` only send HTTP requests and preserve raw response bytes.

The complete wire contract and the requirements for generated clients are documented in [vRPC protocol](protocol.md). Changes to that contract must be reviewed across the runtime, protocol tests, generated-code consumers, and documentation.

## Verification

Run after behavioral or public-contract changes:

```bash
pnpm type-check
pnpm test
pnpm build
pnpm test:package
pnpm fmt:check
pnpm lint
```
