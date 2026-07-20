import { describe, expect, it } from "vitest";

import { VrpcInvokeError } from "../src/contracts/errors";
import { buildVrpcPath, buildVrpcRequestBody } from "../src/protocol/request";
import { parseVrpcResponse, unwrapVrpcResponse } from "../src/protocol/response";

describe("vrpc protocol helpers", () => {
  it("should build encoded vrpc paths", () => {
    expect(buildVrpcPath("user.UserService", "get profile/中文")).toBe(
      "user.UserService/get%20profile%2F%E4%B8%AD%E6%96%87",
    );
  });

  it("should wrap params into vrpc request body", () => {
    expect(buildVrpcRequestBody({ userId: 1 })).toBe('{"params":{"userId":1}}');
    expect(buildVrpcRequestBody({})).toBe('{"params":{}}');
    expect(buildVrpcRequestBody(null)).toBe('{"params":null}');
  });

  it("should unwrap result from successful vrpc responses", () => {
    const result = unwrapVrpcResponse<{ ok: boolean }>(
      {
        status: 200,
        headers: { "vrpc-status": "OK" },
        url: "https://example.com/user.UserService/getProfile",
      },
      {
        result: { ok: true },
        error: null,
      },
    );

    expect(result).toEqual({ ok: true });
  });

  it("should parse successful responses without throwing", () => {
    const parsed = parseVrpcResponse<{ ok: boolean }>(
      {
        status: 200,
        headers: { "vrpc-status": "OK" },
        url: "https://example.com/user.UserService/getProfile",
      },
      {
        result: { ok: true },
        error: null,
      },
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("expected parseVrpcResponse to produce an ok response");
    }
    expect(parsed.result).toEqual({ ok: true });
    expect(parsed.error).toBeNull();
    expect(parsed.vrpcStatus).toBe("OK");
  });

  it("should throw VrpcInvokeError for non-ok http responses", () => {
    expect(() =>
      unwrapVrpcResponse(
        {
          status: 401,
          statusText: "Unauthorized",
          headers: { "vrpc-status": "ERROR" },
          url: "https://example.com/user.UserService/getProfile",
        },
        {
          result: null,
          error: {
            code: "UNAUTHORIZED",
            message: "unauthorized",
          },
        },
      ),
    ).toThrowError(VrpcInvokeError);

    expect(() =>
      unwrapVrpcResponse(
        {
          status: 401,
          statusText: "Unauthorized",
          headers: { "vrpc-status": "ERROR" },
          url: "https://example.com/user.UserService/getProfile",
        },
        {
          result: null,
          error: {
            code: "UNAUTHORIZED",
            message: "unauthorized",
          },
        },
      ),
    ).toThrowError(/unauthorized/);
  });

  it("should use envelope error when vrpc-status is not OK", () => {
    try {
      unwrapVrpcResponse(
        {
          status: 200,
          headers: { "vrpc-status": "SERVICE_ERROR" },
          url: "https://example.com/user.UserService/getProfile",
          method: "POST",
        },
        {
          result: null,
          error: {
            type: "OPERATION",
            code: "SERVICE_ERROR",
            message: "service failed",
            reason: "data-locked",
            detail: "lock owner: user-1",
          },
        },
      );
      throw new Error("expected unwrapVrpcResponse to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(VrpcInvokeError);
      expect(error).toMatchObject({
        message: "service failed\nlock owner: user-1",
        code: "SERVICE_ERROR",
        reason: "data-locked",
        detail: "lock owner: user-1",
        status: 200,
        vrpcStatus: "SERVICE_ERROR",
        method: "POST",
        url: "https://example.com/user.UserService/getProfile",
      });
    }
  });

  it("should parse failed responses without throwing", () => {
    const parsed = parseVrpcResponse(
      {
        status: 400,
        statusText: "Bad Request",
        headers: { "vrpc-status": "BAD_REQUEST" },
        url: "https://example.com/user.UserService/getProfile",
        method: "POST",
      },
      {
        result: null,
        error: {
          type: "INPUT",
          code: "BAD_REQUEST",
          message: "invalid params",
          reason: "missing-name",
          detail: "name is required",
        },
      },
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected parseVrpcResponse to produce a failed response");
    }
    expect(parsed.error).toEqual({
      type: "INPUT",
      code: "BAD_REQUEST",
      message: "invalid params",
      reason: "missing-name",
      detail: "name is required",
    });
    expect(parsed.result).toBeNull();
    expect(parsed.payload).toEqual({
      result: null,
      error: {
        type: "INPUT",
        code: "BAD_REQUEST",
        message: "invalid params",
        reason: "missing-name",
        detail: "name is required",
      },
    });
    expect(parsed.vrpcStatus).toBe("BAD_REQUEST");
  });
});
