import { describe, expect, it } from "vitest";

import { createVrpcClient } from "../src/core/create-vrpc-client";
import { vrpcResponseHeaders } from "./helpers";

describe("invoke request", () => {
  it("should support object-style invoke arguments", async () => {
    const captured: RequestInit[] = [];
    const fetchImpl: typeof fetch = (async (_url, init) => {
      captured.push(init || {});
      return new Response(JSON.stringify({ result: { ok: true }, error: null }), {
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

    const result = await client.invoke<{ ok: boolean }>({
      serviceName: "zion.UserApiService",
      methodName: "getUser",
      params: {},
    });

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
  });

  it("should preserve null params for generated no-argument methods", async () => {
    const captured: RequestInit[] = [];
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      fetchImpl: (async (_url, init) => {
        captured.push(init || {});
        return new Response(JSON.stringify({ result: null, error: null }), {
          status: 200,
          headers: vrpcResponseHeaders(),
        });
      }) as typeof fetch,
      clientInfo: {
        clientName: "test.client",
        clientVersion: "1.0.0",
        clientInstanceId: "11111111-1111-4111-8111-111111111111",
      },
    });

    await client.invoke({
      serviceName: "zion.UserApiService",
      methodName: "ping",
      params: null,
    });

    expect(captured[0]?.body).toBe('{"params":null}');
  });
});
