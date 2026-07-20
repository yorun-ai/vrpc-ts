import { describe, expect, it } from "vitest";

import { HTTP_TIMEOUT_ERROR_CODE, HttpTimeoutError } from "../src/contracts/errors";
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
            reject((init.signal as AbortSignal).reason || new Error("aborted"));
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
    });
  });
});
