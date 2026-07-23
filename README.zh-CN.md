# @yorun-ai/vrpc

[![license](https://img.shields.io/github/license/yorun-ai/vrpc-ts)](https://github.com/yorun-ai/vrpc-ts/blob/main/LICENSE)
[![version](https://img.shields.io/npm/v/%40yorun-ai%2Fvrpc?label=version&logo=npm&color=cb3837)](https://www.npmjs.com/package/@yorun-ai/vrpc)
[![CI](https://github.com/yorun-ai/vrpc-ts/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yorun-ai/vrpc-ts/actions/workflows/ci.yml)

[English](README.md) | **简体中文**

用于 Vine vRPC 与通用 HTTP 请求的客户端运行时。

项目仓库：[github.com/yorun-ai/vrpc-ts](https://github.com/yorun-ai/vrpc-ts)

## 稳定性

本包从 `0.9.0` 开始发布，已经可以使用，但 `1.0.0` 之前暂不承诺公开 API 稳定。不兼容的 API 变更可以随新的 `0.x` minor 版本发布，并会提供迁移说明；`1.0.0` 将作为稳定 API 承诺的起点。

## 安装

```bash
pnpm add @yorun-ai/vrpc
```

## 入口

- `@yorun-ai/vrpc` / `@yorun-ai/vrpc/client`：vRPC client、协议 helper、共享 transport 和类型。
- `@yorun-ai/vrpc/http`：通用 HTTP client。

## vRPC 快速开始

```ts
import { createVrpcClient, getClientInstanceId, isVrpcError } from "@yorun-ai/vrpc";

const client = createVrpcClient({
  prefixUrl: "https://api.example.com/invoke",
  timeoutMs: 15_000,
  suppressGlobalToast: false,
  clientInfo: {
    clientName: "demo.browser",
    clientVersion: "1.0.0",
    clientInstanceId: getClientInstanceId(),
  },
});

client.use({
  onError(error, context) {
    if (isVrpcError(error) && error.kind === "abort") {
      return;
    }
    if (context.options.suppressGlobalToast) {
      return;
    }
    console.error(error);
  },
});

const profile = await client.invoke<{ id: number; name: string }>({
  serviceName: "user.UserService",
  methodName: "getProfile",
  params: { userId: 1 },
  options: {
    timeoutMs: 3_000,
    suppressGlobalToast: true,
  },
});

// 无参 method 可以传 null 或空对象。
await client.invoke({
  serviceName: "user.UserService",
  methodName: "ping",
  params: null,
});

try {
  await client.invoke({
    serviceName: "user.UserService",
    methodName: "missing",
    params: {},
  });
} catch (error) {
  if (isVrpcError(error) && error.kind === "invoke") {
    console.error(error.status, error.vrpcStatus, error.code, error.reason);
  }
}
```

`traceMode` 只控制 runtime 自动生成的 `vrpc-trace` Header，不改变请求路由或 `prefixUrl`。经过 Vine Portal 时使用默认的 `"portal"` 模式，Header 只包含 id；应用直连 vRPC 服务时设置 `traceMode: "direct"`，runtime 同时生成 id 和 span。单次调用的 `options.trace` 会覆盖自动生成结果。

### 请求配置

```ts
type VrpcRequestOptions = {
  headers?: HeadersInit;
  timeoutMs?: number;
  requestInit?: Omit<RequestInit, "method" | "body" | "headers">;
  suppressGlobalToast?: boolean;
  trace?: { id: string; span?: string };
  wire?: VrpcMethodWireSpec;
};
```

- create 时的 `suppressGlobalToast` 是默认值，单次调用的 `true` 或 `false` 会覆盖它。
- `timeoutMs` 默认不启用；未配置时内置 transport 不创建本地 timeout，也不发送 `vrpc-options`。
- `wire` 只能用于单次调用，并且不会进入 HTTP payload。
- 无参 method 兼容 `params: null` 和 `params: {}`。
- 浏览器 transport 默认 `credentials: "omit"`；需要 cookie 时使用 `requestInit.credentials`。

## 自动 CBOR

runtime 不内置 CBOR 依赖。没有 `wire` 的 method 始终使用 JSON，也不需要 codec。生成的 client 会在 method 的 arguments 或 result 含 Binary 时附加稀疏 wire schema：

```ts
import type { VrpcCborCodec, VrpcWireSchema } from "@yorun-ai/vrpc";

const uploadArguments: VrpcWireSchema = {
  kind: "object",
  fields: {
    content: { kind: "binary" },
  },
};

const cborCodec: VrpcCborCodec = {
  encode: (value) => yourCborLibrary.encode(value),
  decode: (bytes) => yourCborLibrary.decode(bytes),
};

const client = createVrpcClient({
  prefixUrl: "https://api.example.com/invoke",
  clientInfo: {
    clientName: "demo.browser",
    clientVersion: "1.0.0",
    clientInstanceId: getClientInstanceId(),
  },
  cborCodec,
});

await client.invoke({
  serviceName: "file.FileService",
  methodName: "upload",
  params: { content: new Uint8Array([1, 2, 3]) },
  options: {
    wire: { arguments: uploadArguments },
  },
});
```

自动选择规则

- `wire.arguments`：请求 `content-type` 使用 `application/vrpc+cbor`。
- `wire.result`：`accept` 使用 `application/vrpc+cbor, application/vrpc+json`。
- 两者都没有：JSON。
- wire 存在但没有 `cborCodec`：在网络请求前抛出配置错误。

`VrpcWireSchema` 支持 Binary、nullable、list、object 和 `Map<Int|string, T>`。CBOR 中 Binary 保持原始 bytes；整数键 `Record` 转换为真正的整数键 CBOR Map。

## Vine Header

runtime 自动生成

```text
content-type: application/vrpc+json
accept: application/vrpc+json
vrpc-trace: id=<32hex>
vrpc-client: name=demo.browser,version=1.0.0,instanceId=<uuid>
vrpc-options: timeout=3000ms
```

自定义 `headers` 不能覆盖 `accept`、`content-type` 或任何 `vrpc-*` Header。显式配置 `timeoutMs` 时，它同时控制本地 `AbortController` 和 `vrpc-options`。

## 通用 HTTP client

```ts
import { createHttpClient } from "@yorun-ai/vrpc/http";

const http = createHttpClient({
  prefixUrl: "https://api.example.com",
  timeoutMs: 5_000,
});

const profile = await http.request<{ id: number }>({
  path: "/users/me",
  query: { withProfile: true },
  options: {
    requestInit: { credentials: "include" },
    suppressGlobalToast: true,
  },
});

await http.request({
  path: "/users",
  method: "POST",
  json: { name: "Vine" },
});
```

HTTP interceptor 通过 `context.options` 读取合并后的请求配置。`json` 和 `body` 互斥。通用 HTTP 响应采用与 `content-type` 无关的宽松解析策略：空 body 返回 `null`，合法 JSON 返回解码结果，其他 body 返回文本。

## 错误处理

业务只需要使用 `isVrpcError` 判断是否为 vRPC client 规范化错误，然后通过 `kind` 分类：

```ts
import { isVrpcError } from "@yorun-ai/vrpc";

function handleError(error: unknown) {
  if (!isVrpcError(error)) {
    console.error(error);
    return;
  }

  if (error.kind === "abort") {
    return;
  }

  if (error.kind === "invoke") {
    console.error(error.vrpcStatus, error.code, error.reason, error.message);
    return;
  }

  console.error(error.kind, error.message, error.cause);
}
```

vRPC 的错误 kind 包括 `abort`、`timeout`、`transport`、`invoke` 和 `protocol`。通用 HTTP 入口提供等价的 `isHttpError`，其错误 kind 包括 `abort`、`timeout`、`transport` 和 `invoke`。adapter 或 vRPC 解码产生的原始异常会保留在 `cause` 中。对于 vRPC invoke 错误，`code` 和 `reason` 仍然是服务端业务字段，非空 `detail` 仍会拼接到 `message`。

错误 class 会继续导出，供兼容代码和特定测试使用；业务错误策略通常只需要 guard 和 `kind`，无需再使用 `instanceof` 二次分类。

### 局部 `try/catch` 与 `suppressGlobalToast`

当功能模块自行负责错误 UI 时，使用局部 `try/catch`，并为该请求设置 `suppressGlobalToast: true`，让全局 interceptor 跳过兜底 toast：

```ts
async function loadProfile() {
  try {
    return await client.invoke({
      serviceName: "user.UserService",
      methodName: "getProfile",
      params: { userId: 1 },
      options: { suppressGlobalToast: true },
    });
  } catch (error) {
    if (!isVrpcError(error)) {
      throw error;
    }
    if (error.kind === "abort") {
      return;
    }
    if (error.kind === "invoke" && error.code === "USER" && error.reason === "NOT_FOUND") {
      showToast(error.message);
      return;
    }
    showToast("加载用户资料失败，请稍后重试");
  }
}
```

`suppressGlobalToast` 只是提供给应用 interceptor 的策略元数据，包本身不会操作 UI。它不会跳过 `onError`，也不会吞掉错误；执行顺序仍然是先运行 `onError`，随后 Promise reject 并进入局部 `catch`。单次请求的值会覆盖 client 级默认值。

## 取消请求

通过 `requestInit.signal` 传入 `AbortSignal`。取消请求会 reject 一个 `kind` 为 `"abort"` 的错误，不会被转换成成功的 `undefined` 结果。

```ts
import { isVrpcError } from "@yorun-ai/vrpc";

const controller = new AbortController();
const request = client.invoke({
  serviceName: "user.UserService",
  methodName: "getProfile",
  params: { userId: 1 },
  options: {
    requestInit: { signal: controller.signal },
  },
});

controller.abort();

try {
  await request;
} catch (error) {
  if (!(isVrpcError(error) && error.kind === "abort")) {
    throw error;
  }
}
```

如果取消请求不需要展示 UI 错误，只需在全局 `onError` interceptor 中统一忽略 `abort`。超时保持为 `kind: "timeout"`，不会被误判为用户主动取消。

## 协议 helper

```ts
import {
  buildVrpcHeaders,
  buildVrpcPath,
  buildVrpcRequestBody,
  generateVrpcId,
} from "@yorun-ai/vrpc";

const headers = buildVrpcHeaders({
  clientInfo: {
    clientName: "demo.browser",
    clientVersion: "1.0.0",
    clientInstanceId: getClientInstanceId(),
  },
  trace: { id: generateVrpcId() },
  timeoutMs: 3_000,
});

const path = buildVrpcPath("user.UserService", "getProfile");
const body = buildVrpcRequestBody({ userId: 1 });
```

## 文档

使用指南：

- [Usage（English）](./docs/guides/usage.md)：HTTP/vRPC client 配置与扩展点。
- [Axios integration（English）](./docs/guides/axios.md)：自定义 Axios transport 与 JSON 协议 helper。

维护者文档：

- [Architecture（English）](./docs/maintainers/architecture.md)：模块边界与请求数据流。
- [vRPC protocol（English）](./docs/maintainers/protocol.md)：path、envelope、Header、内容协商、wire schema 与生成 client 的要求。
- [Releasing（English）](./docs/maintainers/releasing.md)：版本管理与 npm 发布流程。

根 README 与 `docs/guides/` 面向包使用者；`docs/maintainers/` 面向仓库维护者，以及需要实现 transport 或 codegen 的接入方。公开导出、类型、默认值、Header、错误或请求行为变化时，必须同步更新面向使用者和维护者的文档。

## License

本项目使用 [Apache License 2.0](./LICENSE)。
