import { describe, expect, it } from "vitest";

import { VrpcInvokeError, VrpcProtocolError, isVrpcError } from "../src/contracts/errors";
import { createVrpcClient } from "../src/core/create-vrpc-client";
import { textBody, vrpcResponseHeaders } from "./helpers";

const clientInfo = {
  clientName: "test.client",
  clientVersion: "1.0.0",
  clientInstanceId: "11111111-1111-4111-8111-111111111111",
};

describe("vRPC error normalization", () => {
  it("should keep vrpc-status authoritative when an error body cannot be decoded", async () => {
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      transport: {
        request: async (request) => ({
          status: 500,
          statusText: "Internal Server Error",
          headers: vrpcResponseHeaders("INTERNAL"),
          body: textBody("not-json"),
          url: request.url,
        }),
      },
    });

    try {
      await client.invoke({ serviceName: "srv", methodName: "method", params: {} });
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(VrpcInvokeError);
      expect(isVrpcError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: "invoke",
        status: 500,
        vrpcStatus: "INTERNAL",
        payload: null,
        method: "POST",
        url: "https://example.com/srv/method",
      });
      expect((error as VrpcInvokeError).cause).toBeInstanceOf(VrpcProtocolError);
    }
  });

  it("should expose malformed successful responses as protocol errors", async () => {
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      transport: {
        request: async (request) => ({
          status: 200,
          headers: vrpcResponseHeaders("OK"),
          body: textBody("not-json"),
          url: request.url,
        }),
      },
    });

    await expect(
      client.invoke({ serviceName: "srv", methodName: "method", params: {} }),
    ).rejects.toMatchObject({
      name: "VrpcProtocolError",
      kind: "protocol",
      status: 200,
      vrpcStatus: "OK",
      method: "POST",
      url: "https://example.com/srv/method",
    });
  });

  it("should preserve HTTP metadata when vrpc-status is missing", async () => {
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      transport: {
        request: async (request) => ({
          status: 502,
          statusText: "Bad Gateway",
          headers: new Headers({ "content-type": "text/html" }),
          body: textBody("bad gateway"),
          url: request.url,
        }),
      },
    });

    await expect(
      client.invoke({ serviceName: "srv", methodName: "method", params: {} }),
    ).rejects.toMatchObject({
      name: "VrpcProtocolError",
      kind: "protocol",
      status: 502,
      vrpcStatus: null,
      method: "POST",
      url: "https://example.com/srv/method",
    });
  });

  it("should continue to trust an OK status without validating the envelope", async () => {
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      transport: {
        request: async (request) => ({
          status: 200,
          headers: vrpcResponseHeaders("OK"),
          body: textBody("{}"),
          url: request.url,
        }),
      },
    });

    await expect(
      client.invoke({ serviceName: "srv", methodName: "method", params: {} }),
    ).resolves.toBeUndefined();
  });
});
