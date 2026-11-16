// Application-owned example. This file is not a package runtime export.
import type Taro from "@tarojs/taro";
import "fast-text-encoding";
import { HttpAbortError, HttpTimeoutError, HttpTransportError } from "@yorun-ai/vrpc/client";
import { normalizeVrpcHeaderRecord } from "@yorun-ai/vrpc/protocol";

export type TaroTransportRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body?: string | ArrayBuffer;
  timeoutMs?: number;
  signal?: AbortSignal | null;
};

export type TaroTransportResponse = {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: Uint8Array | null;
  url: string;
};

export function createTaroTransport(request: typeof Taro.request) {
  return {
    request(input: TaroTransportRequest): Promise<TaroTransportResponse> {
      const meta = { url: input.url, method: input.method };
      const signal = input.signal;
      if (signal?.aborted)
        return Promise.reject(new HttpAbortError(meta, { reason: signal.reason }));
      return new Promise((resolve, reject) => {
        let task: ReturnType<typeof Taro.request> | undefined;
        const abort = () => task?.abort();
        const cleanup = () => signal?.removeEventListener("abort", abort);
        try {
          task = request<ArrayBuffer>({
            url: input.url,
            method: input.method as "POST",
            header: input.headers,
            data: input.body as string | ArrayBuffer | undefined,
            dataType: "其他",
            responseType: "arraybuffer",
            timeout: input.timeoutMs ?? 60000,
            success(response) {
              cleanup();
              resolve({
                status: response.statusCode,
                headers: normalizeVrpcHeaderRecord(response.header as Record<string, string>),
                body: [204, 205, 304].includes(response.statusCode)
                  ? null
                  : new Uint8Array(response.data),
                url: input.url,
              });
            },
            fail(cause) {
              cleanup();
              if (signal?.aborted)
                reject(new HttpAbortError(meta, { cause, reason: signal.reason }));
              else if (cause.errMsg?.includes("timeout"))
                reject(new HttpTimeoutError(input.timeoutMs ?? 60000, meta, { cause }));
              else reject(new HttpTransportError(meta, { cause }));
            },
          });
        } catch (cause) {
          cleanup();
          reject(new HttpTransportError(meta, { cause }));
          return;
        }
        // Taro also rejects its returned Promise when invoking fail. The
        // callbacks above own our result; consume that parallel rejection.
        void task.catch?.(() => {});
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      });
    },
  };
}
