import { describe, expect, it } from "vitest";

import { createHttpClient } from "../src/core/create-http-client";
import { createVrpcClient } from "../src/core/create-vrpc-client";
import { vrpcResponseHeaders } from "./helpers";

describe("credentials forwarding", () => {
  it("should default vRPC credentials to omit when not provided", async () => {
    const captured: RequestInit[] = [];
    const fetchImpl: typeof fetch = (async (_url, init) => {
      captured.push(init || {});
      return new Response('{"result":{},"error":null}', {
        status: 200,
        headers: vrpcResponseHeaders(),
      });
    }) as typeof fetch;

    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      fetchImpl,
      clientInfo: {
        clientName: "test.client",
        clientVersion: "1.0.0",
        clientInstanceId: "11111111-1111-4111-8111-111111111111",
      },
    });

    await client.invoke({
      serviceName: "zion.UserApiService",
      methodName: "getUser",
      params: {},
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.credentials).toBe("omit");
  });

  it("should forward vRPC credentials from client options to fetch", async () => {
    const captured: RequestInit[] = [];
    const fetchImpl: typeof fetch = (async (_url, init) => {
      captured.push(init || {});
      return new Response('{"result":{},"error":null}', {
        status: 200,
        headers: vrpcResponseHeaders(),
      });
    }) as typeof fetch;

    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      requestInit: { credentials: "include" },
      fetchImpl,
      clientInfo: {
        clientName: "test.client",
        clientVersion: "1.0.0",
        clientInstanceId: "11111111-1111-4111-8111-111111111111",
      },
    });

    await client.invoke({
      serviceName: "zion.UserApiService",
      methodName: "getUser",
      params: {},
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.credentials).toBe("include");
  });

  it("should forward vRPC credentials from request options to fetch", async () => {
    const captured: RequestInit[] = [];
    const fetchImpl: typeof fetch = (async (_url, init) => {
      captured.push(init || {});
      return new Response('{"result":{},"error":null}', {
        status: 200,
        headers: vrpcResponseHeaders(),
      });
    }) as typeof fetch;

    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      fetchImpl,
      clientInfo: {
        clientName: "test.client",
        clientVersion: "1.0.0",
        clientInstanceId: "11111111-1111-4111-8111-111111111111",
      },
    });

    await client.invoke({
      serviceName: "zion.UserApiService",
      methodName: "getUser",
      params: {},
      options: {
        requestInit: { credentials: "include" },
      },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.credentials).toBe("include");
  });

  it("should default generic HTTP credentials to omit when not provided", async () => {
    const captured: RequestInit[] = [];
    const fetchImpl: typeof fetch = (async (_url, init) => {
      captured.push(init || {});
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;

    const client = createHttpClient({
      prefixUrl: "https://example.com",
      fetchImpl,
    });

    await client.request({
      path: "/users/me",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.credentials).toBe("omit");
  });
});
