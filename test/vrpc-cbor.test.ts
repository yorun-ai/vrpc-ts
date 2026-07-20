import { describe, expect, it } from "vitest";

import { VrpcCborCodec, VrpcTransportRequest, VrpcWireSchema } from "../src/contracts/types";
import { createVrpcClient } from "../src/core/create-vrpc-client";
import { textBody, vrpcResponseHeaders } from "./helpers";

const clientInfo = {
  clientName: "test.client",
  clientVersion: "1.0.0",
  clientInstanceId: "11111111-1111-4111-8111-111111111111",
};

const binaryMapSchema: VrpcWireSchema = {
  kind: "object",
  fields: () => ({
    blob: { kind: "binary" },
    entries: {
      kind: "map",
      key: "int",
      value: {
        kind: "object",
        fields: {
          payload: { kind: "binary" },
        },
      },
    },
  }),
};

describe("vRPC CBOR", () => {
  it("should reject a wire method without a configured codec before transport", async () => {
    let transportCalled = false;
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      transport: {
        request: async () => {
          transportCalled = true;
          throw new Error("transport should not run");
        },
      },
    });

    await expect(
      client.invoke({
        serviceName: "file.FileService",
        methodName: "upload",
        params: { blob: new Uint8Array([1]) },
        options: {
          wire: { arguments: binaryMapSchema },
        },
      }),
    ).rejects.toThrow(
      "CBOR is required for file.FileService/upload, but no cborCodec was configured. Pass cborCodec to createVrpcClient().",
    );
    expect(transportCalled).toBe(false);
  });

  it("should reject an empty wire spec", async () => {
    const codec: VrpcCborCodec = {
      encode: () => new Uint8Array(),
      decode: () => ({}),
    };
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      cborCodec: codec,
      transport: {
        request: async () => {
          throw new Error("transport should not run");
        },
      },
    });

    await expect(
      client.invoke({
        serviceName: "file.FileService",
        methodName: "invalid",
        params: {},
        options: { wire: {} },
      }),
    ).rejects.toThrow("wire is empty");
  });

  it("should encode CBOR arguments and preserve a JSON response", async () => {
    let encodedValue: unknown;
    const requests: VrpcTransportRequest[] = [];
    const codec: VrpcCborCodec = {
      encode: (value) => {
        encodedValue = value;
        return new Uint8Array([1, 2, 3]);
      },
      decode: () => {
        throw new Error("decode should not run for a JSON response");
      },
    };
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      cborCodec: codec,
      transport: {
        request: async (request) => {
          requests.push(request);
          return {
            status: 200,
            headers: vrpcResponseHeaders(),
            body: textBody('{"result":{"ok":true},"error":null}'),
            url: request.url,
          };
        },
      },
    });

    await expect(
      client.invoke<{ ok: boolean }>({
        serviceName: "file.FileService",
        methodName: "upload",
        params: {
          blob: new Uint8Array([4, 5]),
          entries: {
            7: { payload: new Uint8Array([6]) },
          },
        },
        options: {
          wire: { arguments: binaryMapSchema },
        },
      }),
    ).resolves.toEqual({ ok: true });

    const encodedParams = (encodedValue as { params: Record<string, unknown> }).params;
    expect(encodedParams.blob).toEqual(new Uint8Array([4, 5]));
    expect(encodedParams.entries).toBeInstanceOf(Map);
    expect(Array.from((encodedParams.entries as Map<number, unknown>).keys())).toEqual([7]);
    expect(new Headers(requests[0]?.headers).get("content-type")).toBe("application/vrpc+cbor");
    expect(new Headers(requests[0]?.headers).get("accept")).toBe("application/vrpc+json");
    expect(requests[0]?.body).toBeInstanceOf(ArrayBuffer);
    expect((requests[0] as unknown as Record<string, unknown>).wire).toBeUndefined();
  });

  it("should decode a CBOR result and restore integer-key records", async () => {
    let encodeCalled = false;
    const codec: VrpcCborCodec = {
      encode: () => {
        encodeCalled = true;
        return new Uint8Array();
      },
      decode: (bytes) => {
        expect(bytes).toEqual(new Uint8Array([9, 8, 7]));
        return new Map<string, unknown>([
          [
            "result",
            new Map<string, unknown>([
              ["blob", new Uint8Array([1, 2])],
              [
                "entries",
                new Map<number, unknown>([[3, new Map([["payload", new Uint8Array([4])]])]]),
              ],
            ]),
          ],
          ["error", null],
        ]);
      },
    };
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      cborCodec: codec,
      transport: {
        request: async (request) => {
          const headers = new Headers(request.headers);
          expect(headers.get("content-type")).toBe("application/vrpc+json");
          expect(headers.get("accept")).toBe("application/vrpc+cbor, application/vrpc+json");
          expect(request.body).toBe('{"params":{"id":1}}');
          return {
            status: 200,
            headers: vrpcResponseHeaders("OK", "application/vrpc+cbor"),
            body: new Uint8Array([9, 8, 7]),
            url: request.url,
          };
        },
      },
    });

    const result = await client.invoke<{
      blob: Uint8Array;
      entries: Record<number, { payload: Uint8Array }>;
    }>({
      serviceName: "file.FileService",
      methodName: "download",
      params: { id: 1 },
      options: {
        wire: { result: binaryMapSchema },
      },
    });

    expect(encodeCalled).toBe(false);
    expect(result).toEqual({
      blob: new Uint8Array([1, 2]),
      entries: {
        3: { payload: new Uint8Array([4]) },
      },
    });
  });

  it("should use CBOR in both directions when arguments and result wire are present", async () => {
    const codec: VrpcCborCodec = {
      encode: () => new Uint8Array([1]),
      decode: () => ({
        result: {
          blob: new Uint8Array([2]),
          entries: new Map(),
        },
        error: null,
      }),
    };
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      cborCodec: codec,
      transport: {
        request: async (request) => {
          const headers = new Headers(request.headers);
          expect(headers.get("content-type")).toBe("application/vrpc+cbor");
          expect(headers.get("accept")).toBe("application/vrpc+cbor, application/vrpc+json");
          return {
            status: 200,
            headers: vrpcResponseHeaders("OK", "application/vrpc+cbor"),
            body: new Uint8Array([2]),
            url: request.url,
          };
        },
      },
    });

    await expect(
      client.invoke({
        serviceName: "file.FileService",
        methodName: "copy",
        params: { blob: new Uint8Array([1]), entries: {} },
        options: {
          wire: {
            arguments: binaryMapSchema,
            result: binaryMapSchema,
          },
        },
      }),
    ).resolves.toEqual({ blob: new Uint8Array([2]), entries: {} });
  });
});
