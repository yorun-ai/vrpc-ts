import { describe, expect, it } from "vitest";

import { HttpAbortError, HttpTransportError, isHttpError } from "../src/contracts/errors";
import { createHttpClient } from "../src/core/create-http-client";

describe("transport error normalization", () => {
  it("should wrap unknown custom transport failures and preserve cause", async () => {
    const cause = new TypeError("adapter failed");
    const client = createHttpClient({
      prefixUrl: "https://example.com",
      transport: {
        request: async () => {
          throw cause;
        },
      },
    });

    try {
      await client.request({ path: "users" });
      throw new Error("expected request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpTransportError);
      expect(isHttpError(error)).toBe(true);
      expect(error).toMatchObject({
        kind: "transport",
        cause,
        method: "GET",
        url: "https://example.com/users",
      });
    }
  });

  it("should normalize compatible adapter cancellation before onError", async () => {
    const adapterError = { code: "ERR_CANCELED", message: "canceled" };
    const observed: unknown[] = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com",
      interceptors: [
        {
          onError: (error) => {
            observed.push(error);
          },
        },
      ],
      transport: {
        request: async () => {
          throw adapterError;
        },
      },
    });

    await expect(client.request({ path: "users" })).rejects.toBeInstanceOf(HttpAbortError);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      kind: "abort",
      cause: adapterError,
    });
  });
});
