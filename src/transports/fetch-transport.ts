import { HttpTimeoutError } from "../contracts/errors";
import { HttpTransport } from "../contracts/types";
import { shouldTreatResponseAsBodyless } from "../core/http-utils";

function createTimeoutError(timeoutMs: number) {
  return new HttpTimeoutError(timeoutMs);
}

function withTimeoutSignal(
  timeoutMs: number | undefined,
  signal: AbortSignal | null | undefined,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal: signal || undefined, cleanup: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(createTimeoutError(timeoutMs)), timeoutMs);
  const clear = () => clearTimeout(timer);

  if (!signal) {
    return { signal: controller.signal, cleanup: clear };
  }

  if (signal.aborted) {
    controller.abort((signal as { reason?: unknown }).reason);
    return { signal: controller.signal, cleanup: clear };
  }

  const relayAbort = () => controller.abort((signal as { reason?: unknown }).reason);
  signal.addEventListener("abort", relayAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clear();
      signal.removeEventListener("abort", relayAbort);
    },
  };
}

export function createFetchTransport(fetchImpl?: typeof fetch): HttpTransport {
  const request = fetchImpl || globalThis.fetch;
  if (!request) {
    throw new Error("fetch is not available in current runtime.");
  }

  return {
    request: async (input) => {
      const { signal, cleanup } = withTimeoutSignal(
        input.timeoutMs,
        input.init.signal || input.signal,
      );
      try {
        const response = await request(input.url, {
          ...input.init,
          method: input.method,
          headers: input.headers,
          body: input.body,
          signal,
          credentials: input.init.credentials ?? "omit",
        });
        const body = shouldTreatResponseAsBodyless(input.method, response.status)
          ? null
          : new Uint8Array(await response.arrayBuffer());
        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body,
          url: response.url || input.url,
        };
      } finally {
        cleanup();
      }
    },
  };
}
