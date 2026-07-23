import { describe, expect, it } from "vitest";

import {
  HTTP_ABORT_ERROR_CODE,
  HTTP_TIMEOUT_ERROR_CODE,
  HTTP_TRANSPORT_ERROR_CODE,
  HttpAbortError,
  HttpTimeoutError,
  HttpTransportError,
  isVrpcError,
} from "../src/contracts/errors";
import { createFetchTransport } from "../src/transports/fetch-transport";

describe("fetch transport", () => {
  it("should return response bytes without decoding them", async () => {
    const transport = createFetchTransport((async () => {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as typeof fetch);

    await expect(
      transport.request({
        url: "https://example.com/bytes",
        init: {},
        method: "GET",
        headers: {},
      }),
    ).resolves.toMatchObject({ body: new Uint8Array([1, 2, 3]) });
  });

  it("should preserve null body semantics for 204 and HEAD responses", async () => {
    const transport = createFetchTransport((async (_url, init) => {
      return new Response(null, { status: init?.method === "HEAD" ? 200 : 204 });
    }) as typeof fetch);

    await expect(
      transport.request({
        url: "https://example.com/no-content",
        init: { method: "DELETE" },
        method: "DELETE",
        headers: {},
      }),
    ).resolves.toMatchObject({ status: 204, body: null });

    await expect(
      transport.request({
        url: "https://example.com/head",
        init: { method: "HEAD" },
        method: "HEAD",
        headers: {},
      }),
    ).resolves.toMatchObject({ status: 200, body: null });
  });

  it("should enforce timeoutMs", async () => {
    const transport = createFetchTransport(((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        if (!init?.signal) {
          reject(new Error("missing signal"));
          return;
        }
        init.signal.addEventListener(
          "abort",
          () => {
            reject(new DOMException("aborted", "AbortError"));
          },
          { once: true },
        );
        setTimeout(() => {
          resolve(new Response("{}", { status: 200, headers: { "vrpc-status": "OK" } }));
        }, 50);
      });
    }) as typeof fetch);

    const requestPromise = transport.request({
      url: "https://example.com/test",
      init: {},
      method: "POST",
      headers: {},
      body: "{}",
      timeoutMs: 10,
    });

    await expect(requestPromise).rejects.toBeInstanceOf(HttpTimeoutError);
    await expect(requestPromise).rejects.toMatchObject({
      name: "HttpTimeoutError",
      code: HTTP_TIMEOUT_ERROR_CODE,
      timeoutMs: 10,
      message: "request timeout after 10ms",
      kind: "timeout",
      method: "POST",
      url: "https://example.com/test",
    });
  });

  it("should normalize caller cancellation without a custom reason", async () => {
    const controller = new AbortController();
    const transport = createFetchTransport(((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as typeof fetch);

    const requestPromise = transport.request({
      url: "https://example.com/cancel",
      init: { signal: controller.signal },
      method: "GET",
      headers: {},
    });
    controller.abort();

    await expect(requestPromise).rejects.toBeInstanceOf(HttpAbortError);
    try {
      await requestPromise;
    } catch (error) {
      expect(isVrpcError(error)).toBe(true);
      expect(error).toMatchObject({
        name: "HttpAbortError",
        code: HTTP_ABORT_ERROR_CODE,
        kind: "abort",
        method: "GET",
        url: "https://example.com/cancel",
      });
      expect((error as HttpAbortError).reason).toBe(controller.signal.reason);
      expect((error as HttpAbortError).cause).toBe(controller.signal.reason);
    }
  });

  it("should normalize caller cancellation with a custom reason", async () => {
    const controller = new AbortController();
    const reason = new Error("dialog closed");
    const transport = createFetchTransport(((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as typeof fetch);

    const requestPromise = transport.request({
      url: "https://example.com/cancel",
      init: { signal: controller.signal },
      method: "GET",
      headers: {},
    });
    controller.abort(reason);

    await expect(requestPromise).rejects.toMatchObject({
      name: "HttpAbortError",
      code: HTTP_ABORT_ERROR_CODE,
      reason,
      cause: reason,
    });
  });

  it("should keep caller cancellation distinct when a timeout is also configured", async () => {
    const controller = new AbortController();
    const transport = createFetchTransport(((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as typeof fetch);

    const requestPromise = transport.request({
      url: "https://example.com/cancel",
      init: { signal: controller.signal },
      method: "GET",
      headers: {},
      timeoutMs: 100,
    });
    controller.abort();

    await expect(requestPromise).rejects.toMatchObject({
      name: "HttpAbortError",
      kind: "abort",
    });
  });

  it("should normalize fetch failures and preserve the original cause", async () => {
    const cause = new TypeError("fetch failed");
    const transport = createFetchTransport((async () => {
      throw cause;
    }) as typeof fetch);

    const requestPromise = transport.request({
      url: "https://example.com/network",
      init: {},
      method: "GET",
      headers: {},
    });

    await expect(requestPromise).rejects.toBeInstanceOf(HttpTransportError);
    await expect(requestPromise).rejects.toMatchObject({
      name: "HttpTransportError",
      code: HTTP_TRANSPORT_ERROR_CODE,
      kind: "transport",
      cause,
      method: "GET",
      url: "https://example.com/network",
    });
  });

  it("should not classify timeouts as caller cancellation", () => {
    const error = new HttpTimeoutError(100);
    expect(isVrpcError(error)).toBe(true);
    expect(error.kind).toBe("timeout");
  });
});
