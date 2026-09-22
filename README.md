# @yorun-ai/vrpc

[![license](https://img.shields.io/github/license/yorun-ai/vrpc-ts)](https://github.com/yorun-ai/vrpc-ts/blob/main/LICENSE)
[![version](https://img.shields.io/npm/v/%40yorun-ai%2Fvrpc?label=version&logo=npm)](https://www.npmjs.com/package/@yorun-ai/vrpc)
[![CI](https://github.com/yorun-ai/vrpc-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yorun-ai/vrpc-ts/actions/workflows/ci.yml)

**English** | [简体中文](README.zh-CN.md)

A lightweight TypeScript client runtime for Vine vRPC and generic HTTP requests.

Repository: [github.com/yorun-ai/vrpc-ts](https://github.com/yorun-ai/vrpc-ts)

## What is this?

The package exposes two clients that share one request runtime:

- **vRPC client** — calls Vine vRPC methods over HTTP. It builds the vRPC path
  and envelope, generates `vrpc-trace`, `vrpc-client`, and `vrpc-options`
  headers, negotiates JSON or CBOR, and normalizes the vRPC response.
- **Generic HTTP client** — calls ordinary HTTP APIs with shared configuration,
  interceptors, timeouts, cancellation, and normalized errors. It knows nothing
  about the vRPC protocol.

Choose the vRPC client when your server is a Vine vRPC service. Choose the
generic HTTP client for everything else. Both are Fetch-based and browser-first,
and both run in any JavaScript runtime that provides `fetch`.

## Features

- TypeScript-first API with published types for every entry point.
- Browser Fetch-based transport, replaceable with a custom transport.
- Two clients: Vine vRPC and generic HTTP.
- Client-level defaults with per-request overrides.
- Interceptors for request, response, and error lifecycle hooks.
- Normalized, classified errors and `AbortSignal` cancellation.
- Optional CBOR integration through a user-provided codec, with no bundled
  codec dependency.
- ESM and CommonJS builds, plus browser ES module CDN usage.

## Installation

```bash
pnpm add @yorun-ai/vrpc
```

```bash
npm install @yorun-ai/vrpc
```

## Quick start

### 1. Invoke a vRPC method

```ts
import { createVrpcClient, getClientInstanceId } from "@yorun-ai/vrpc";

const client = createVrpcClient({
  prefixUrl: "https://api.example.com/invoke",
  clientInfo: {
    clientName: "demo.browser",
    clientVersion: "1.0.0",
    clientInstanceId: getClientInstanceId(),
  },
});

const profile = await client.invoke<{ id: number; name: string }>({
  serviceName: "user.UserService",
  methodName: "getProfile",
  params: { userId: 1 },
});
```

The final URL is `<prefixUrl>/<serviceName>/<methodName>`. Methods without
arguments accept `params: null` or `params: {}`.

### 2. Call a plain HTTP API

```ts
import { createHttpClient } from "@yorun-ai/vrpc/http";

const http = createHttpClient({
  prefixUrl: "https://api.example.com",
  timeoutMs: 5_000,
});

const profile = await http.request<{ id: number }>({ path: "/users/me" });

await http.request({
  path: "/users",
  method: "POST",
  json: { name: "Vine" },
});
```

Use `json` for a JSON body and `body` for raw `BodyInit` values such as
`FormData`.

### 3. Handle errors

```ts
import { isVrpcError } from "@yorun-ai/vrpc";

try {
  await client.invoke({
    serviceName: "user.UserService",
    methodName: "getProfile",
    params: { userId: 1 },
  });
} catch (error) {
  if (isVrpcError(error) && error.kind === "invoke") {
    // Server rejected the invocation.
    console.error(error.vrpcStatus, error.code, error.reason);
  }
}
```

The generic HTTP client provides the equivalent `isHttpError` guard.

## Browser CDN

Use the published ES module builds when you want to try a client without
installing a package or configuring a bundler:

```html
<script type="module">
  import { createVrpcClient } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.2/+esm";

  // ...
</script>
```

The package ships ES modules only. There is no global build, so a classic
`<script src="...">` tag cannot be used; the tag must have `type="module"`.

See [Browser CDN usage](docs/guides/cdn.md) for complete HTML examples, the
generic HTTP entry, version pinning, and troubleshooting.

## Entry points

| Import                  | Contents                                                      |
| ----------------------- | ------------------------------------------------------------- |
| `@yorun-ai/vrpc`        | vRPC client, protocol helpers, transport, errors, and types.  |
| `@yorun-ai/vrpc/client` | Explicit vRPC entry; identical to the package root.           |
| `@yorun-ai/vrpc/http`   | Generic HTTP client, Fetch transport, HTTP errors, and types. |

## Configuration at a glance

Both clients accept `prefixUrl`, `headers`, `timeoutMs`, `requestInit`,
`suppressGlobalToast`, `fetchImpl`, `transport`, and `interceptors`. The vRPC
client additionally requires `clientInfo` and accepts `traceMode` and
`cborCodec`. Per-request `options` override client defaults, and
`context.options` always contains the merged result.

The vRPC client adds two request options: `trace` replaces the generated
`vrpc-trace` header, and `wire` selects JSON or CBOR for a single call. A wire
schema is never serialized into the HTTP body, and it requires a `cborCodec`.

## Advanced capabilities

- **Interceptors** — `beforeRequest`, `afterResponse`, and `onError` hooks
  registered with `client.use()`. `onError` runs before the request promise
  rejects and does not swallow the failure.
- **Cancellation** — pass an `AbortSignal` through `requestInit.signal`.
  Cancellation rejects with `kind: "abort"`. Timeouts stay `kind: "timeout"`.
- **Tracing** — `traceMode: "portal"` (default) generates a trace id;
  `traceMode: "direct"` also generates a span. It never changes routing or
  `prefixUrl`.
- **CBOR** — provide a `cborCodec` and a per-call `wire` schema when arguments
  or results contain `Binary`.
- **Custom transport** — implement `VrpcTransport` or `HttpTransport` to
  replace Fetch with another I/O layer.
- **`suppressGlobalToast`** — application-defined error UI policy metadata.
  The package never displays UI, skips `onError`, or consumes the rejection.

The [Usage guide](docs/guides/usage.md) covers each capability with runnable
examples.

## Documentation

### User guides

- [Usage](docs/guides/usage.md) — client configuration, request options,
  interceptors, errors, cancellation, CBOR, and custom transports.
- [Browser CDN](docs/guides/cdn.md) — CDN loading modes and complete HTML
  examples.
- [Axios integration](docs/guides/axios.md) — custom Axios transport and JSON
  protocol helpers.

### Reference and maintainers

- [API Reference](docs/reference/README.md) — public exports, types,
  configuration options, defaults, and errors.
- [Architecture](docs/maintainers/architecture.md) — module boundaries and
  request flow.
- [vRPC protocol](docs/maintainers/protocol.md) — paths, envelopes, headers,
  content negotiation, wire schemas, and generated-client requirements.
- [Releasing](docs/maintainers/releasing.md) — version management and npm
  publishing.
- [Contributing](CONTRIBUTING.md) — development, testing, documentation, and
  pull-request workflow.

The root README and `docs/guides/` are for package users. `docs/maintainers/`
is for repository maintainers and integrators implementing transports or code
generation.

## Stability

The package is in the `0.x` release line. It is ready for use, but versions
below `1.0.0` do not guarantee a stable public API. A breaking change may be
released in a new `0.x` minor version and will include migration guidance.
Version `1.0.0` will mark the stable API commitment.

## License

This project is licensed under the [Apache License 2.0](./LICENSE).
