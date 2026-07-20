import { describe, expect, it } from "vitest";

import { VrpcInvokeError } from "../src/contracts/errors";
import { createVrpcClient } from "../src/core/create-vrpc-client";
import { textBody, vrpcResponseHeaders } from "./helpers";

const clientInfo = {
  clientName: "test.client",
  clientVersion: "1.0.0",
  clientInstanceId: "11111111-1111-4111-8111-111111111111",
};

describe("client interceptors", () => {
  it("should run beforeRequest then afterResponse", async () => {
    const calls: string[] = [];
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      clientInfo,
      transport: {
        request: async () => {
          calls.push("transport");
          return {
            status: 200,
            statusText: "OK",
            headers: vrpcResponseHeaders(),
            body: textBody('{"result":{"ok":true},"error":null}'),
            url: "https://example.com/srv/method",
          };
        },
      },
      interceptors: [
        {
          beforeRequest: () => {
            calls.push("before");
          },
          afterResponse: () => {
            calls.push("after");
          },
          onError: () => {
            calls.push("error");
          },
        },
      ],
    });

    const result = await client.invoke<{ ok: boolean }>({
      serviceName: "srv",
      methodName: "method",
      params: { a: 1 },
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["before", "transport", "after"]);
  });

  it("should resolve suppressGlobalToast without leaking it into transport payload", async () => {
    const suppressGlobalToasts: Array<boolean | undefined> = [];
    const transportRequests: Array<Record<string, unknown>> = [];
    const client = createVrpcClient({
      prefixUrl: "https://example.com",
      suppressGlobalToast: true,
      clientInfo,
      transport: {
        request: async (request) => {
          transportRequests.push(request as unknown as Record<string, unknown>);
          return {
            status: 401,
            statusText: "Unauthorized",
            headers: vrpcResponseHeaders("UNAUTHORIZED"),
            body: textBody(
              JSON.stringify({
                result: null,
                error: { code: "UNAUTHORIZED", message: "unauthorized" },
              }),
            ),
            url: request.url,
          };
        },
      },
      interceptors: [
        {
          onError: (error, context) => {
            suppressGlobalToasts.push(context.options.suppressGlobalToast);
            expect(error).toBeInstanceOf(VrpcInvokeError);
          },
        },
      ],
    });

    await expect(
      client.invoke({
        serviceName: "srv",
        methodName: "method",
        params: { a: 1 },
        options: {
          suppressGlobalToast: false,
        },
      }),
    ).rejects.toBeInstanceOf(VrpcInvokeError);

    expect(suppressGlobalToasts).toEqual([false]);
    expect(transportRequests).toHaveLength(1);
    expect(transportRequests[0]?.suppressGlobalToast).toBeUndefined();
    expect(transportRequests[0]?.options).toBeUndefined();
  });
});
