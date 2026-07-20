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
