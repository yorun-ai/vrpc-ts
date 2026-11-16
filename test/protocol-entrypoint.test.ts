import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildVrpcHeaderRecord,
  buildVrpcPath,
  buildVrpcRequestBody,
  encodeVrpcRequestBody,
  decodeVrpcResponse,
  decodeVrpcResponseData,
  parseVrpcResponseData,
  mergeVrpcApplicationHeaders,
  normalizeVrpcHeaderRecord,
  generateClientInstanceId,
  generateVrpcId,
  VrpcResponseError,
  type VrpcResponseSource,
  type VrpcWireSchema,
} from "../src/entrypoints/protocol";

const clientInfo = {
  clientName: "miniapp",
  clientVersion: "1.0.0",
  clientInstanceId: "11111111-1111-4111-8111-111111111111",
};
function response(overrides: Partial<VrpcResponseSource> = {}): VrpcResponseSource {
  return {
    status: 200,
    url: "https://example.com/invoke/base.ItemApi/listItems",
    headers: {
      "Content-Type": "application/vrpc+json",
      "Vrpc-Status": "OK",
      "VRPC-SERVER": "name=server,version=1.0.0,instanceId=22222222-2222-4222-8222-222222222222",
    },
    text: () => '{"result":{"text":"中文🙂"},"error":null}',
    arrayBuffer: () => new Uint8Array([1, 2]).buffer,
    ...overrides,
  };
}

describe("protocol without browser globals", () => {
  beforeEach(() => {
    for (const name of [
      "fetch",
      "Headers",
      "Response",
      "Request",
      "XMLHttpRequest",
      "Blob",
      "FormData",
      "TextDecoder",
      "TextEncoder",
    ]) {
      vi.stubGlobal(name, undefined);
    }
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds validated records, paths, identities and envelopes without side effects", () => {
    const headers = buildVrpcHeaderRecord({
      clientInfo,
      trace: { id: generateVrpcId() },
      timeoutMs: 1234,
    });
    expect(headers).toMatchObject({
      "content-type": "application/vrpc+json",
      accept: "application/vrpc+json",
      "vrpc-options": "timeout=1234ms",
    });
    expect(headers["vrpc-trace"]).toMatch(/^id=[a-f0-9]{32}$/);
    expect(generateClientInstanceId()).toMatch(/^[a-f0-9-]{36}$/);
    expect(buildVrpcPath("base.ItemApi", "详情/中文")).toBe(
      "base.ItemApi/%E8%AF%A6%E6%83%85%2F%E4%B8%AD%E6%96%87",
    );
    expect(buildVrpcRequestBody(null)).toBe('{"params":null}');
    expect(() => buildVrpcHeaderRecord({ clientInfo, trace: { id: "bad" } })).toThrow("trace");
    expect(globalThis.Headers).toBeUndefined();
    expect(globalThis.Response).toBeUndefined();
    expect(globalThis.fetch).toBeUndefined();
  });

  it("merges case-insensitive application headers and rejects protocol overrides/injection", () => {
    expect(mergeVrpcApplicationHeaders({ Authorization: "old" }, { authorization: "new" })).toEqual(
      { authorization: "new" },
    );
    expect(normalizeVrpcHeaderRecord({ "X-Multi": ["one", "two"], "x-multi": "three" })).toEqual({
      "x-multi": "one, two, three",
    });
    expect(() => mergeVrpcApplicationHeaders({ "VRPC-Trace": "bad" })).toThrow(
      "cannot be overridden",
    );
    expect(() => normalizeVrpcHeaderRecord({ authorization: "a\r\nx: bad" })).toThrow(TypeError);
    expect(() => normalizeVrpcHeaderRecord({ "invalid name": "x" })).toThrow(TypeError);
    const source = JSON.parse('{"__proto__":"data"}') as Record<string, string>;
    const headers = normalizeVrpcHeaderRecord(source);
    expect(Object.getPrototypeOf(headers)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(headers, "__proto__")?.value).toBe("data");
  });

  it("decodes Unicode JSON through adapter-provided body readers", async () => {
    await expect(decodeVrpcResponse(response())).resolves.toEqual({ text: "中文🙂" });
    await expect(
      decodeVrpcResponse(response({ text: () => '{"result":null,"error":null}' })),
    ).resolves.toBeNull();
  });

  it("returns a decoded failure before unwrapping for compatible response hooks", async () => {
    const input = response({
      headers: { ...response().headers, "Vrpc-Status": "DENIED" },
      text: () => '{"result":null,"error":{"code":"NO_ACCESS"}}',
    });
    await expect(decodeVrpcResponseData(input)).resolves.toMatchObject({
      ok: false,
      vrpcStatus: "DENIED",
      error: { code: "NO_ACCESS" },
    });
    await expect(decodeVrpcResponse(input)).rejects.toMatchObject({
      kind: "invoke",
      code: "NO_ACCESS",
    });
  });

  it("reports business fields while keeping protocol metadata as plain data", async () => {
    const input = response({
      status: 401,
      headers: { ...response().headers, "Vrpc-Status": "DENIED" },
      text: () =>
        '{"result":null,"error":{"code":"NO_ACCESS","message":"无权限","reason":"login","detail":"请登录"}}',
    });
    await expect(decodeVrpcResponse(input)).rejects.toMatchObject({
      name: "VrpcResponseError",
      kind: "invoke",
      status: 401,
      vrpcStatus: "DENIED",
      code: "NO_ACCESS",
      reason: "login",
      detail: "请登录",
      message: "无权限\n请登录",
      responseHeaders: { "vrpc-status": "DENIED" },
    });
  });

  it.each([
    { text: () => "" },
    { text: () => "not json" },
    { text: () => "null" },
    { headers: { ...response().headers, "Vrpc-Status": "" } },
    { headers: { ...response().headers, "VRPC-SERVER": "bad" } },
    { headers: { ...response().headers, "Content-Type": "text/html" } },
  ])("classifies a malformed success as a protocol error: %j", async (overrides) => {
    await expect(decodeVrpcResponse(response(overrides))).rejects.toMatchObject({
      kind: "protocol",
      code: "VRPC_PROTOCOL_ERROR",
      status: 200,
    });
  });

  it("retains a failed status when the body cannot be decoded", async () => {
    await expect(
      decodeVrpcResponse(
        response({ status: 503, headers: { "vrpc-status": "UNAVAILABLE" }, text: () => "bad" }),
      ),
    ).rejects.toMatchObject({
      kind: "invoke",
      status: 503,
      vrpcStatus: "UNAVAILABLE",
      payload: null,
      cause: expect.any(Error),
    });
  });

  it("uses shared CBOR wire conversion for byte arrays and integer-key maps", async () => {
    const schema: VrpcWireSchema = {
      kind: "object",
      fields: { data: { kind: "map", key: "int", value: { kind: "binary" } } },
    };
    const encode = vi.fn(() => new Uint8Array([9, 8]));
    const decode = vi.fn(
      () =>
        new Map<string, unknown>([
          ["result", new Map([["data", new Map([[7, new Uint8Array([1, 2])]])]])],
          ["error", null],
        ]),
    );
    expect(
      new Uint8Array(
        (await encodeVrpcRequestBody({ data: { 7: new Uint8Array([1, 2]) } }, schema, {
          encode,
          decode,
        })) as ArrayBuffer,
      ),
    ).toEqual(new Uint8Array([9, 8]));
    expect(encode).toHaveBeenCalledWith({
      params: { data: new Map([[7, new Uint8Array([1, 2])]]) },
    });
    const input = response({
      headers: { ...response().headers, "Content-Type": "application/vrpc+cbor" },
    });
    await expect(
      decodeVrpcResponse(input, { cborCodec: { encode, decode }, resultSchema: schema }),
    ).resolves.toEqual({ data: { 7: new Uint8Array([1, 2]) } });
    expect(decode).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    await expect(decodeVrpcResponse(input)).rejects.toBeInstanceOf(VrpcResponseError);
  });

  it("keeps parsed outcomes non-throwing for already decoded business failures", () => {
    const result = parseVrpcResponseData(
      { status: 200, headers: { "vrpc-status": "DENIED" } },
      { result: null, error: { code: "NO_ACCESS" } },
    );
    expect(result).toMatchObject({ ok: false, vrpcStatus: "DENIED", error: { code: "NO_ACCESS" } });
  });
});
