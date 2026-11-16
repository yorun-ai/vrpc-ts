import {
  VrpcResponseError,
  type VrpcHeaderRecord,
  type VrpcResponseData,
  type VrpcResponseSource,
  type VrpcResponseResult,
  type VrpcDecodeOptions,
} from "../contracts/protocol";
import { isReservedVrpcHeader } from "./headers";
import { decodeVrpcBody } from "./response-body";

export function normalizeVrpcHeaderRecord(headers: VrpcResponseData["headers"]): VrpcHeaderRecord {
  const result: VrpcHeaderRecord = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (rawValue == null) continue;
    const name = rawName.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name))
      throw new TypeError(`Invalid header name: ${rawName}`);
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const item of values) {
      const raw = String(item);
      if (/[\r\n\0]/.test(raw)) throw new TypeError(`Invalid header value: ${rawName}`);
      const value = raw.trim();
      const previous = Object.prototype.hasOwnProperty.call(result, name)
        ? result[name]
        : undefined;
      Object.defineProperty(result, name, {
        value: previous === undefined ? value : `${previous}, ${value}`,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
}

// Application headers must be merged before the protocol headers are applied.
export function mergeVrpcApplicationHeaders(
  ...headers: Array<VrpcResponseData["headers"] | undefined>
): VrpcHeaderRecord {
  const result: VrpcHeaderRecord = {};
  for (const source of headers) {
    if (!source) continue;
    for (const [name, value] of Object.entries(normalizeVrpcHeaderRecord(source))) {
      if (isReservedVrpcHeader(name))
        throw new Error(`vRPC protocol header cannot be overridden: ${name}`);
      Object.defineProperty(result, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
}

export function resolveVrpcEnvelope<T>(
  status: number,
  vrpcStatus: string | null,
  payload: unknown,
) {
  if (status >= 200 && status < 300 && vrpcStatus === "OK") {
    return {
      ok: true as const,
      vrpcStatus: "OK" as const,
      result: (payload as { result: T }).result,
      error: null,
    };
  }
  const envelope =
    payload && typeof payload === "object"
      ? (payload as { result?: unknown; error?: unknown })
      : undefined;
  return {
    ok: false as const,
    vrpcStatus,
    result: envelope?.result,
    error: envelope?.error ?? payload,
  };
}

// Like the existing browser helper, this only unwraps an already decoded body.
// Use decodeVrpcResponse for full content-type/server/status validation.
export function parseVrpcResponseData<T = unknown>(
  response: VrpcResponseData,
  payload: unknown,
): VrpcResponseResult<T> {
  const headers = normalizeVrpcHeaderRecord(response.headers);
  const vrpcStatus = headers["vrpc-status"] ?? null;
  return {
    status: response.status,
    statusText: response.statusText ?? "",
    headers,
    url: response.url ?? "",
    method: response.method || "POST",
    payload,
    ...resolveVrpcEnvelope<T>(response.status, vrpcStatus, payload),
  };
}

export function unwrapVrpcResponseData<T = unknown>(
  response: VrpcResponseData,
  payload: unknown,
): T {
  const parsed = parseVrpcResponseData<T>(response, payload);
  if (!parsed.ok) throw new VrpcResponseError("invoke", parsed, parsed.error);
  return parsed.result;
}

// Complete protocol validation + unwrapping, with the same status precedence as
// createVrpcClient. The adapter owns I/O, body reading and text decoding.
export async function decodeVrpcResponseData<T = unknown>(
  response: VrpcResponseSource,
  options: VrpcDecodeOptions = {},
): Promise<VrpcResponseResult<T>> {
  const headers = normalizeVrpcHeaderRecord(response.headers);
  let payload: unknown;
  try {
    payload = await decodeVrpcBody(
      {
        headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        text: () => response.text(),
        arrayBuffer: () => response.arrayBuffer(),
      },
      options.cborCodec,
      options.resultSchema,
    );
    return parseVrpcResponseData<T>({ ...response, headers }, payload);
  } catch (cause) {
    if (cause instanceof VrpcResponseError) throw cause;
    const parsed = parseVrpcResponseData({ ...response, headers }, { result: null, error: null });
    const kind = parsed.vrpcStatus && !parsed.ok ? "invoke" : "protocol";
    throw new VrpcResponseError(kind, parsed, null, {
      cause,
      ...(kind === "protocol"
        ? { message: cause instanceof Error ? cause.message : "Invalid vRPC response." }
        : {}),
    });
  }
}

export async function decodeVrpcResponse<T = unknown>(
  response: VrpcResponseSource,
  options: VrpcDecodeOptions = {},
): Promise<T> {
  const result = await decodeVrpcResponseData<T>(response, options);
  if (!result.ok) throw new VrpcResponseError("invoke", result, result.error);
  return result.result;
}
