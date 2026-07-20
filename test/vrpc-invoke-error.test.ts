import { describe, expect, it } from "vitest";

import { VrpcInvokeError } from "../src/contracts/errors";

describe("VrpcInvokeError", () => {
  it("should append payload.detail to payload.message", () => {
    const response = new Response('{"message":"ignored"}', {
      status: 500,
      headers: {
        "vrpc-status": "INTERNAL",
      },
    });

    const error = new VrpcInvokeError(response, {
      type: "OPERATION",
      code: "INTERNAL_ERROR",
      message: "server failed",
      reason: "data-locked",
      detail: "row lock timeout",
    });

    expect(error.message).toBe("server failed\nrow lock timeout");
    expect(error.type).toBe("OPERATION");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.reason).toBe("data-locked");
    expect(error.detail).toBe("row lock timeout");
    expect(error.status).toBe(500);
    expect(error.vrpcStatus).toBe("INTERNAL");
  });

  it("should preserve empty detail from backend payloads", () => {
    const response = new Response("{}", {
      status: 409,
      headers: {
        "vrpc-status": "OPERATION_FAILED",
      },
    });

    const error = new VrpcInvokeError(response, {
      code: "OPERATION_FAILED",
      message: "operation failed",
      reason: "data-locked",
      detail: "",
    });

    expect(error.code).toBe("OPERATION_FAILED");
    expect(error.message).toBe("operation failed");
    expect(error.reason).toBe("data-locked");
    expect(error.detail).toBe("");
  });

  it("should fallback to transport diagnostic when payload has no message", () => {
    const response = new Response("{}", {
      status: 400,
      headers: {
        "vrpc-status": "BAD_REQUEST",
      },
    });

    const error = new VrpcInvokeError(response, { code: "BAD_REQUEST" });

    expect(error.message).toBe("request failed (status=400)");
  });
});
