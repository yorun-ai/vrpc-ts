import {
  HttpAbortError,
  HttpTimeoutError,
  HttpTransportError,
  isAbortErrorLike,
  isHttpError,
} from "../contracts/errors";
import { HttpTransport } from "../contracts/types";
import { shouldTreatResponseAsBodyless } from "../core/http-utils";

type AbortSource = "caller" | "timeout";

function withTimeoutSignal(
  timeoutMs: number | undefined,
  callerSignal: AbortSignal | null | undefined,
  requestMeta: { url: string; method: string },
): {
  signal: AbortSignal | undefined;
  cleanup: () => void;
  getAbortSource: () => AbortSource | undefined;
  getTimeoutError: () => HttpTimeoutError | undefined;
} {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      signal: callerSignal || undefined,
      cleanup: () => {},
      getAbortSource: () => (callerSignal?.aborted ? "caller" : undefined),
      getTimeoutError: () => undefined,
    };
  }

  const controller = new AbortController();
  let abortSource: AbortSource | undefined;
  let timeoutError: HttpTimeoutError | undefined;
  const timer = setTimeout(() => {
    if (controller.signal.aborted) {
      return;
    }
    abortSource = "timeout";
    timeoutError = new HttpTimeoutError(timeoutMs, requestMeta);
    controller.abort(timeoutError);
  }, timeoutMs);
  const clear = () => clearTimeout(timer);

  if (!callerSignal) {
    return {
      signal: controller.signal,
      cleanup: clear,
      getAbortSource: () => abortSource,
      getTimeoutError: () => timeoutError,
    };
  }

  const relayAbort = () => {
    if (controller.signal.aborted) {
      return;
    }
    abortSource = "caller";
    controller.abort(callerSignal.reason);
  };
  if (callerSignal.aborted) {
    relayAbort();
  } else {
    callerSignal.addEventListener("abort", relayAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clear();
      callerSignal.removeEventListener("abort", relayAbort);
    },
    getAbortSource: () => abortSource,
    getTimeoutError: () => timeoutError,
  };
}

export function createFetchTransport(fetchImpl?: typeof fetch): HttpTransport {
  const request = fetchImpl || globalThis.fetch;
  if (!request) {
    throw new Error("fetch is not available in current runtime.");
  }

  return {
    request: async (input) => {
      const requestMeta = { url: input.url, method: input.method };
      const callerSignal = input.init.signal || input.signal;
      const { signal, cleanup, getAbortSource, getTimeoutError } = withTimeoutSignal(
        input.timeoutMs,
        callerSignal,
        requestMeta,
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
      } catch (cause) {
        const abortSource = getAbortSource();
        if (abortSource === "timeout") {
          const timeoutError = getTimeoutError();
          if (cause === timeoutError && timeoutError) {
            throw timeoutError;
          }
          throw new HttpTimeoutError(input.timeoutMs as number, requestMeta, { cause });
        }
        if (abortSource === "caller") {
          throw new HttpAbortError(requestMeta, {
            cause,
            reason: callerSignal?.reason,
          });
        }
        if (isHttpError(cause)) {
          throw cause;
        }
        if (isAbortErrorLike(cause)) {
          throw new HttpAbortError(requestMeta, { cause });
        }
        throw new HttpTransportError(requestMeta, { cause });
      } finally {
        cleanup();
      }
    },
  };
}
