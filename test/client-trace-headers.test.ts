import { describe, expect, it } from "vitest";

import { VrpcTransport, VrpcTransportRequest } from "../src/contracts/types";
import { buildVrpcHeaders, createVrpcClient } from "../src/entrypoints/client";
import { textBody, vrpcResponseHeaders } from "./helpers";

function createMockTransport(calls: VrpcTransportRequest[]): VrpcTransport {
  return {
    request: async (request) => {
      calls.push(request);
      return {
        status: 200,
        headers: vrpcResponseHeaders(),
        body: textBody(JSON.stringify({ result: { ok: true }, error: null })),
        url: request.url,
      };
    },
    close: async () => {},
  };
}

const clientInfo = {
  clientName: "test.browser",
  clientVersion: "1.0.0",
  clientInstanceId: "11111111-1111-4111-8111-111111111111",
};

describe("createVrpcClient trace headers", () => {
  it("should send an id-only vrpc-trace in portal mode", async () => {
    const calls: VrpcTransportRequest[] = [];
    const client = createVrpcClient({
      prefixUrl: "http://localhost:7077",
      transport: createMockTransport(calls),
      clientInfo,
    });

    await client.invoke({
      serviceName: "ghost.GhostService",
      methodName: "getBootInfo",
      params: {},
    });

    const headers = new Headers(calls[0]?.headers);
    expect(headers.get("vrpc-trace")).toMatch(/^id=[0-9a-f]{32}$/);
    expect(headers.has("vrpc-id")).toBe(false);
    expect(headers.has("vrpc-span")).toBe(false);
  });

  it("should include a span in direct mode", async () => {
    const calls: VrpcTransportRequest[] = [];
    const client = createVrpcClient({
      prefixUrl: "http://localhost:7077",
      transport: createMockTransport(calls),
      traceMode: "direct",
      clientInfo,
    });

    await client.invoke({
      serviceName: "ghost.GhostService",
      methodName: "getBootInfo",
      params: {},
    });

    expect(new Headers(calls[0]?.headers).get("vrpc-trace")).toMatch(
      /^id=[0-9a-f]{32},span=[0-9a-f]{16}$/,
    );
  });

  it("should apply timeoutMs to the transport and vrpc-options header", async () => {
    const calls: VrpcTransportRequest[] = [];
    const client = createVrpcClient({
      prefixUrl: "http://localhost:7077",
      transport: createMockTransport(calls),
      timeoutMs: 2500,
      clientInfo,
    });

    await client.invoke({
      serviceName: "ghost.GhostService",
      methodName: "getBootInfo",
      params: {},
    });

    expect(calls[0]?.timeoutMs).toBe(2500);
    expect(new Headers(calls[0]?.headers).get("vrpc-options")).toBe("timeout=2500ms");
  });
});

describe("buildVrpcHeaders", () => {
  const explicitTraceId = "123e4567e89b12d3a456426614174000";

  it("should encode the latest Vine client, trace, and timeout headers", () => {
    const headers = buildVrpcHeaders({
      clientInfo,
      trace: { id: explicitTraceId, span: "1234567890abcdef" },
      timeoutMs: 2500,
    });

    expect(headers.get("vrpc-client")).toBe(
      "name=test.browser,version=1.0.0,instanceId=11111111-1111-4111-8111-111111111111",
    );
    expect(headers.get("vrpc-trace")).toBe(`id=${explicitTraceId},span=1234567890abcdef`);
    expect(headers.get("vrpc-options")).toBe("timeout=2500ms");
  });

  it("should select request and response content types independently", () => {
    const headers = buildVrpcHeaders({
      clientInfo,
      trace: { id: explicitTraceId },
      requestUsesCbor: true,
      responseUsesCbor: true,
    });

    expect(headers.get("content-type")).toBe("application/vrpc+cbor");
    expect(headers.get("accept")).toBe("application/vrpc+cbor, application/vrpc+json");
  });

  it("should reject reserved protocol header overrides", async () => {
    const client = createVrpcClient({
      prefixUrl: "http://localhost:7077",
      transport: createMockTransport([]),
      clientInfo,
    });

    await expect(
      client.invoke({
        serviceName: "ghost.GhostService",
        methodName: "getBootInfo",
        params: {},
        options: {
          headers: { "vrpc-trace": "id=123e4567e89b12d3a456426614174000" },
        },
      }),
    ).rejects.toThrow("vRPC protocol header cannot be overridden: vrpc-trace");
  });
});
