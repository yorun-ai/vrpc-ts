# @yorun-ai/vrpc

[![npm version](https://img.shields.io/npm/v/%40yorun-ai%2Fvrpc?label=version&logo=npm&style=flat-square)](https://www.npmjs.com/package/@yorun-ai/vrpc)
[![CI](https://img.shields.io/github/actions/workflow/status/yorun-ai/vrpc-ts/ci.yml?branch=main&label=CI&logo=github&style=flat-square)](https://github.com/yorun-ai/vrpc-ts/actions/workflows/ci.yml)
[![install size](https://img.shields.io/badge/dynamic/json?url=https://packagephobia.com/v2/api.json?p=%40yorun-ai%2Fvrpc&query=$.install.pretty&label=install%20size&style=flat-square)](https://packagephobia.com/result?p=%40yorun-ai%2Fvrpc)
[![npm downloads](https://img.shields.io/npm/dm/%40yorun-ai%2Fvrpc?logo=npm&style=flat-square)](https://www.npmjs.com/package/@yorun-ai/vrpc)
[![npm types](https://img.shields.io/npm/types/%40yorun-ai%2Fvrpc?style=flat-square)](https://www.npmjs.com/package/@yorun-ai/vrpc)
[![license](https://img.shields.io/github/license/yorun-ai/vrpc-ts?style=flat-square)](https://github.com/yorun-ai/vrpc-ts/blob/main/LICENSE)

[English](README.md) | **简体中文**

用于 [Vine](https://github.com/yorun-ai/vine) vRPC 与通用 HTTP 请求的轻量 TypeScript 客户端运行时。

## 这是什么？

本包对外提供两种 client，它们共享同一套请求运行时：

- **vRPC client**：通过 HTTP 调用 Vine vRPC method。它会构造 vRPC path 与
  envelope，生成 `vrpc-trace`、`vrpc-client`、`vrpc-options` Header，协商 JSON
  或 CBOR，并规范化 vRPC 响应。
- **通用 HTTP client**：调用普通 HTTP API，提供统一配置、interceptor、timeout、
  取消与规范化错误。它不感知 vRPC 协议。

服务端是 Vine vRPC service 时使用 vRPC client，其他场景使用通用 HTTP client。
两者都基于 Fetch，以浏览器为优先目标，并可在任何提供 `fetch` 的 JavaScript 运行时中运行。

## 特性

- TypeScript 优先的 API，每个入口都发布类型声明。
- 基于浏览器 Fetch 的 transport，可替换为自定义 transport。
- 同时提供 Vine vRPC 与通用 HTTP 两种 client。
- client 级默认值与单次请求覆盖。
- 支持请求、响应、错误生命周期的 interceptor。
- 规范化且可分类的错误，以及 `AbortSignal` 取消。
- 通过用户提供的 codec 可选集成 CBOR，不内置任何 codec 依赖。
- 提供 ESM 与 CommonJS 构建，并支持浏览器 ES module CDN 用法。

## 安装

```bash
pnpm add @yorun-ai/vrpc
```

```bash
npm install @yorun-ai/vrpc
```

## 快速开始

### 1. 调用一个 vRPC method

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

最终 URL 为 `<prefixUrl>/<serviceName>/<methodName>`。无参 method 可以传
`params: null` 或 `params: {}`。

### 2. 调用普通 HTTP API

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

JSON 请求体使用 `json`，`FormData` 等原始 `BodyInit` 使用 `body`。

### 3. 处理错误

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
    // 服务端拒绝了本次调用。
    console.error(error.vrpcStatus, error.code, error.reason);
  }
}
```

通用 HTTP client 提供等价的 `isHttpError`。

## 浏览器 CDN

不想安装依赖或配置打包工具时，可以直接使用发布的 ES module 构建：

```html
<script type="module">
  import { createVrpcClient } from "https://cdn.jsdelivr.net/npm/@yorun-ai/vrpc@0.9.2/+esm";

  // ...
</script>
```

本包只发布 ES module，没有 global 构建，因此不能使用经典
`<script src="...">` 标签，标签必须带 `type="module"`。

完整 HTML 示例、通用 HTTP 入口、版本固定与常见问题见
[Browser CDN 使用指南](docs/guides/cdn.md)。

## 入口

| Import                  | 内容                                                 |
| ----------------------- | ---------------------------------------------------- |
| `@yorun-ai/vrpc`        | vRPC client、协议 helper、transport、错误与类型。    |
| `@yorun-ai/vrpc/client` | 显式 vRPC 入口，与包根入口一致。                     |
| `@yorun-ai/vrpc/http`   | 通用 HTTP client、Fetch transport、HTTP 错误与类型。 |

## 配置概览

两种 client 都接受 `prefixUrl`、`headers`、`timeoutMs`、`requestInit`、
`suppressGlobalToast`、`fetchImpl`、`transport` 和 `interceptors`。vRPC client
额外要求 `clientInfo`，并接受 `traceMode` 与 `cborCodec`。单次请求的 `options`
会覆盖 client 默认值，`context.options` 始终是合并后的结果。

vRPC client 还提供两个请求选项：`trace` 覆盖自动生成的 `vrpc-trace` Header，
`wire` 为单次调用选择 JSON 或 CBOR。wire schema 永远不会被序列化进 HTTP body，
但使用它必须配置 `cborCodec`。

## 进阶能力

- **Interceptor**：通过 `client.use()` 注册 `beforeRequest`、`afterResponse`
  和 `onError`。`onError` 在请求 Promise reject 之前执行，且不会吞掉错误。
- **取消请求**：通过 `requestInit.signal` 传入 `AbortSignal`。取消会 reject
  一个 `kind` 为 `"abort"` 的错误；超时保持 `kind: "timeout"`。
- **Trace**：`traceMode: "portal"`（默认）只生成 trace id，
  `traceMode: "direct"` 还会生成 span。它不会改变路由或 `prefixUrl`。
- **CBOR**：当 arguments 或 result 含 `Binary` 时，提供 `cborCodec` 与单次调用的
  `wire` schema。
- **自定义 transport**：实现 `VrpcTransport` 或 `HttpTransport`，用其他 I/O 层
  替换 Fetch。
- **`suppressGlobalToast`**：应用自定义错误 UI 的策略元数据。包本身不会展示 UI、
  不会跳过 `onError`，也不会吞掉 reject。

每项能力的具体示例见 [Usage 指南](docs/guides/usage.md)。

## 文档

### 使用指南

- [Usage（English）](docs/guides/usage.md)：client 配置、请求选项、interceptor、
  错误、取消、CBOR 与自定义 transport。
- [Browser CDN（English）](docs/guides/cdn.md)：CDN 加载方式与完整 HTML 示例。
- [Axios integration（English）](docs/guides/axios.md)：自定义 Axios transport 与
  JSON 协议 helper。

### Reference 与维护者文档

- [API Reference（English）](docs/reference/README.md)：公开导出、类型、配置项、
  默认值与错误。
- [Architecture（English）](docs/maintainers/architecture.md)：模块边界与请求数据流。
- [vRPC protocol（English）](docs/maintainers/protocol.md)：path、envelope、Header、
  内容协商、wire schema 与生成 client 的要求。
- [Releasing（English）](docs/maintainers/releasing.md)：版本管理与 npm 发布流程。
- [Contributing（English）](CONTRIBUTING.md)：开发、测试、文档与 PR 流程。

根 README 与 `docs/guides/` 面向包使用者；`docs/maintainers/` 面向仓库维护者，
以及需要实现 transport 或 codegen 的接入方。

## 稳定性

本包处于 `0.x` 发布阶段，已经可以使用，但 `1.0.0` 之前暂不承诺公开 API 稳定。
不兼容的变更可以随新的 `0.x` minor 版本发布，并会提供迁移说明；`1.0.0` 将作为
稳定 API 承诺的起点。

## License

本项目使用 [Apache License 2.0](./LICENSE)。
