# Upgrading to 0.11.0

This release adds `@yorun-ai/vrpc/protocol` for runtimes that own their network I/O. Existing root, `/client` and `/http` entrypoints keep their behavior. The wire protocol and skelc-generated service factories are unchanged.

## Why this upgrade exists

In 0.10.0, replacing the network transport does not remove the client's dependency on Fetch objects. The core still creates `Headers` and `Response`, and the existing protocol helpers accept or construct those objects too. A miniapp using `Taro.request` therefore still needs browser-object compatibility just to reuse protocol rules.

The new entry separates protocol processing from those browser objects. It constructs plain header records, encodes JSON/CBOR requests, validates response metadata and bodies, and resolves vRPC status using adapter-provided body readers. The browser helpers share the underlying protocol logic, keeping one source for wire behavior. The new entry installs no globals, performs no network I/O and requires no DOM or Node type library.

## What changes in the package

- New `./protocol` entry with ESM, CommonJS and matching declarations.
- Plain-data header/response helpers, existing pure encoding/path/ID helpers, and the separate `VrpcResponseError` contract. See the [API reference](../reference/README.md#runtime-independent-protocol-entry).
- No Taro runtime dependency, Taro client factory, new generated-client interface or replacement for `VrpcClient`.
- No new behavior in `createVrpcClient`, `createHttpClient`, the existing browser helpers or their error guards.

Existing browser consumers only need the version update; their imports, client creation, `use()` hooks, response objects and error handling do not need migration.

## Opting in from Taro

The [Taro guide](./taro.md) includes a complete application-owned client/transport example. This wrapper uses the new protocol entry and keeps the generated SDK unchanged. It intentionally changes the Taro response-hook and error contract to avoid creating Fetch objects:

| Existing Taro wrapper behavior                          | Data-based wrapper behavior                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Response hooks registered with `use({ afterResponse })` | Local `useData({ afterResponse })` or the wrapper's constructor data interceptors.                      |
| `response.json()` / `response.clone()`                  | Read the already decoded `response.payload` / `response.result`.                                        |
| `response.headers.get("vrpc-status")`                   | `response.headers["vrpc-status"]`.                                                                      |
| Browser `VrpcInvokeError` / `VrpcProtocolError`         | `VrpcResponseError` from `/protocol`, checked with `instanceof`.                                        |
| `isVrpcError` for every failure                         | Use `VrpcResponseError` for protocol/business failures; keep `isVrpcError` for native lifecycle errors. |
| Application-owned Fetch response conversion             | Remove the conversion module and its direct polyfill dependency.                                        |

The local `use()` still registers request/error hooks. Attempting to register a browser Response callback throws a clear migration error before installing any part of that registration. The runtime package does not change its existing `use()` behavior, and no dummy method or forced client cast is needed.

Copy and maintain the adapter in the application. Configure the API URL, identity, authentication, UTF-8 decoding and optional CBOR codec there. Do not edit skelc or generated SDK files.

## Keep the official H5 dependency

The application adapter no longer needs to import or construct objects from `whatwg-fetch`. However, official `@tarojs/taro-h5@4.3.3` still depends on and imports that package. Leave this upstream dependency unchanged; it will remain in a Taro H5 lockfile. This release does not remove it from Taro's dependency tree or alter Taro's browser support.

UTF-8 decoding support and optional caller cancellation support are separate platform concerns. Removing a Fetch polyfill does not automatically provide `TextDecoder` or `AbortController` in a miniapp runtime.

## Upgrade verification

After 0.11.0 is published, replace local test tarballs with the exact registry version and regenerate the application lockfile. Verify frozen installation and type checking against the unchanged generated SDK, then check hooks and errors on success, business failure, malformed responses, cancellation and timeout. Build and exercise H5 and each native target independently. Protocol/package tests and local simulator checks do not replace device testing or platform release validation.
