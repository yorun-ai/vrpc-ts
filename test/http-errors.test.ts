import { describe, expect, it } from "vitest";

import {
  HttpAbortError,
  HttpClientError,
  HttpInvokeError,
  HttpTimeoutError,
  HttpTransportError,
  VrpcInvokeError,
  VrpcProtocolError,
  isHttpError,
  isVrpcError,
} from "../src/contracts/errors";

describe("HTTP client errors", () => {
  it.each([new HttpAbortError(), new HttpTimeoutError(100), new HttpTransportError()])(
    "should identify shared errors through both client guards",
    (error) => {
      expect(error).toBeInstanceOf(HttpClientError);
      expect(isHttpError(error)).toBe(true);
      expect(isVrpcError(error)).toBe(true);
    },
  );

  it("should distinguish generic HTTP invoke errors from vRPC invoke errors", () => {
    const response = new Response(null, {
      status: 500,
      headers: { "vrpc-status": "INTERNAL" },
    });
    const httpError = new HttpInvokeError(response, null);
    const vrpcError = new VrpcInvokeError(response, null);

    expect(isHttpError(httpError)).toBe(true);
    expect(isVrpcError(httpError)).toBe(false);
    expect(isHttpError(vrpcError)).toBe(true);
    expect(isVrpcError(vrpcError)).toBe(true);
  });

  it("should keep protocol errors exclusive to the vRPC guard", () => {
    const error = new VrpcProtocolError(
      new Response(null, { status: 200, headers: { "vrpc-status": "OK" } }),
      "invalid response",
    );

    expect(isHttpError(error)).toBe(false);
    expect(isVrpcError(error)).toBe(true);
  });

  it.each([new Error("failed"), new TypeError("fetch failed"), null, undefined, "error"])(
    "should not treat ordinary values as package errors",
    (error) => {
      expect(isHttpError(error)).toBe(false);
      expect(isVrpcError(error)).toBe(false);
    },
  );

  it("should not identify a bare base error as a concrete client error", () => {
    const error = new HttpClientError("failed", "invoke");

    expect(isHttpError(error)).toBe(false);
    expect(isVrpcError(error)).toBe(false);
  });

  it("should narrow package errors by kind after the single guard", () => {
    const error: unknown = new VrpcInvokeError(
      new Response(null, {
        status: 500,
        headers: { "vrpc-status": "INTERNAL" },
      }),
      { code: "USER", reason: "NOT_FOUND" },
    );
    if (!isVrpcError(error)) {
      throw new Error("expected a package error");
    }

    switch (error.kind) {
      case "invoke":
        expect(error.vrpcStatus).toBe("INTERNAL");
        expect(error.code).toBe("USER");
        expect(error.reason).toBe("NOT_FOUND");
        break;
      default:
        throw new Error(`unexpected error kind: ${error.kind}`);
    }
  });
});
