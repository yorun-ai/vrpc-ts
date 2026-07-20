import { describe, expect, it } from "vitest";

import {
  HTTP_TIMEOUT_ERROR_CODE,
  HttpInvokeError,
  HttpTimeoutError,
} from "../src/contracts/errors";
import { createHttpClient } from "../src/core/create-http-client";
import { textBody } from "./helpers";

describe("http client", () => {
  it("should default to GET and join prefixUrl with path", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      transport: {
        request: async (request) => {
          calls.push({ url: request.url, method: request.method });
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    const result = await client.request<{ ok: boolean }>({ path: "/users/me" });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ url: "https://example.com/api/users/me", method: "GET" }]);
  });

  it("should serialize query params and keep existing path query", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      transport: {
        request: async (request) => {
          calls.push({ url: request.url, method: request.method });
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    await client.request({
      path: "/users/me?from=profile",
      method: "GET",
      query: {
        lang: "zh-CN",
        page: 2,
        enabled: true,
        tags: ["a", "b"],
        ignored: undefined,
      },
    });

    expect(calls).toEqual([
      {
        url: "https://example.com/api/users/me?from=profile&lang=zh-CN&page=2&enabled=true&tags=a&tags=b",
        method: "GET",
      },
    ]);
  });

  it("should keep original url when query is an empty object", async () => {
    const calls: string[] = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      transport: {
        request: async (request) => {
          calls.push(request.url);
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    await client.request({
      path: "/users/me?from=profile",
      method: "GET",
      query: {},
    });

    expect(calls).toEqual(["https://example.com/api/users/me?from=profile"]);
  });

  it("should skip null and undefined query values but keep empty string", async () => {
    const calls: string[] = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      transport: {
        request: async (request) => {
          calls.push(request.url);
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    await client.request({
      path: "/users/me",
      method: "GET",
      query: {
        keyword: "",
        nullable: null,
        missing: undefined,
        emptyList: [],
      },
    });

    expect(calls).toEqual(["https://example.com/api/users/me?keyword="]);
  });

  it("should append URLSearchParams query values", async () => {
    const calls: string[] = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      transport: {
        request: async (request) => {
          calls.push(request.url);
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    const query = new URLSearchParams();
    query.append("keyword", "");
    query.append("tags", "a");
    query.append("tags", "b");

    await client.request({
      path: "/users/me?from=profile",
      method: "GET",
      query,
    });

    expect(calls).toEqual(["https://example.com/api/users/me?from=profile&keyword=&tags=a&tags=b"]);
  });

  it("should support query params when prefixUrl is relative", async () => {
    const calls: string[] = [];
    const client = createHttpClient({
      prefixUrl: "/api",
      transport: {
        request: async (request) => {
          calls.push(request.url);
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    await expect(
      client.request({
        path: "/workspace/files",
        query: { path: "/tmp/demo" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(calls).toEqual(["/api/workspace/files?path=%2Ftmp%2Fdemo"]);
  });

  it("should serialize json body and set application/json", async () => {
    const captured: RequestInit[] = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: (async (_url, init) => {
        captured.push(init || {});
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as typeof fetch,
    });

    await client.request({
      path: "users",
      method: "POST",
      json: { name: "kapta" },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.body).toBe('{"name":"kapta"}');
    expect(new Headers(captured[0]?.headers).get("content-type")).toBe("application/json");
  });

  it("should keep raw body unchanged", async () => {
    const calls: Array<{ body: BodyInit | null | undefined; headers: Headers }> = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      transport: {
        request: async (request) => {
          calls.push({ body: request.body, headers: new Headers(request.headers) });
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    await client.request({
      path: "upload",
      method: "POST",
      body: "raw-body",
      options: {
        headers: { "content-type": "text/plain" },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toBe("raw-body");
    expect(calls[0]?.headers.get("content-type")).toBe("text/plain");
  });

  it("should expose resolved suppressGlobalToast without leaking it into transport payload", async () => {
    const suppressGlobalToasts: Array<boolean | undefined> = [];
    const requests: Array<Record<string, unknown>> = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      suppressGlobalToast: true,
      interceptors: [
        {
          beforeRequest: (context) => {
            suppressGlobalToasts.push(context.options.suppressGlobalToast);
          },
        },
      ],
      transport: {
        request: async (request) => {
          requests.push(request as unknown as Record<string, unknown>);
          return {
            status: 200,
            headers: new Headers(),
            body: textBody(JSON.stringify({ ok: true })),
            url: request.url,
          };
        },
      },
    });

    await client.request({
      path: "users/me",
      options: {
        suppressGlobalToast: false,
      },
    });

    expect(suppressGlobalToasts).toEqual([false]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.suppressGlobalToast).toBeUndefined();
    expect(requests[0]?.options).toBeUndefined();
  });

  it("should leave suppressGlobalToast undefined when request does not set it", async () => {
    const suppressGlobalToasts: Array<boolean | undefined> = [];
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      interceptors: [
        {
          beforeRequest: (context) => {
            suppressGlobalToasts.push(context.options.suppressGlobalToast);
          },
        },
      ],
      transport: {
        request: async (request) => ({
          status: 200,
          headers: new Headers(),
          body: textBody(JSON.stringify({ ok: true })),
          url: request.url,
        }),
      },
    });

    await client.request({
      path: "users/me",
    });

    expect(suppressGlobalToasts).toEqual([undefined]);
  });

  it("should enforce timeoutMs for generic requests", async () => {
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: ((_: string | URL | Request, init?: RequestInit) => {
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
            resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
          }, 50);
        });
      }) as typeof fetch,
      timeoutMs: 10,
    });

    const requestPromise = client.request({ path: "slow" });

    await expect(requestPromise).rejects.toBeInstanceOf(HttpTimeoutError);
    await expect(requestPromise).rejects.toMatchObject({
      name: "HttpTimeoutError",
      code: HTTP_TIMEOUT_ERROR_CODE,
      timeoutMs: 10,
      message: "request timeout after 10ms",
    });
  });

  it("should throw HttpInvokeError for non-2xx responses", async () => {
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: (async () => {
        return new Response(
          JSON.stringify({
            type: "AUTH",
            code: "UNAUTHORIZED",
            message: "unauthorized",
            reason: "session-expired",
            detail: "",
          }),
          {
            status: 401,
            statusText: "Unauthorized",
            headers: { "content-type": "application/json" },
          },
        );
      }) as typeof fetch,
    });

    await expect(client.request({ path: "private", method: "POST" })).rejects.toMatchObject({
      name: "HttpInvokeError",
      message: "unauthorized",
      type: "AUTH",
      code: "UNAUTHORIZED",
      reason: "session-expired",
      detail: "",
      status: 401,
      method: "POST",
      url: "https://example.com/api/private",
    });

    await expect(client.request({ path: "private", method: "POST" })).rejects.toBeInstanceOf(
      HttpInvokeError,
    );
  });

  it("should return null for empty response body", async () => {
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
    });

    await expect(client.request({ path: "empty" })).resolves.toBeNull();
  });

  it("should treat 204 no-content responses as null instead of throwing during response rebuild", async () => {
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: (async () => new Response(null, { status: 204 })) as typeof fetch,
    });

    await expect(client.request({ path: "empty-204", method: "DELETE" })).resolves.toBeNull();
  });

  it.each([205, 304])(
    "should preserve null-body status %s without response reconstruction errors",
    async (status) => {
      const client = createHttpClient({
        prefixUrl: "https://example.com/api",
        fetchImpl: (async () => new Response(null, { status })) as typeof fetch,
      });

      if (status === 304) {
        await expect(
          client.request({ path: `status-${status}`, method: "GET" }),
        ).rejects.toMatchObject({
          name: "HttpInvokeError",
          status,
          payload: null,
        });
        return;
      }

      await expect(
        client.request({ path: `status-${status}`, method: "POST" }),
      ).resolves.toBeNull();
    },
  );

  it("should return null for HEAD responses without body", async () => {
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
    });

    await expect(client.request({ path: "head", method: "HEAD" })).resolves.toBeNull();
  });

  it("should fallback to plain text when response is not json", async () => {
    const client = createHttpClient({
      prefixUrl: "https://example.com/api",
      fetchImpl: (async () => new Response("plain text", { status: 200 })) as typeof fetch,
    });

    await expect(client.request({ path: "text" })).resolves.toBe("plain text");
  });
});
