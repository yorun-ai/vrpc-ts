import { VrpcInvokeError, VrpcProtocolError } from "../contracts/errors";
import {
  ParsedVrpcResponse,
  VrpcCborCodec,
  VrpcResponseLike,
  VrpcWireSchema,
} from "../contracts/types";
import { resolveVrpcEnvelope } from "./data";
import { decodeVrpcBody } from "./response-body";

export async function decodeVrpcResponsePayload(
  response: Response,
  cborCodec: VrpcCborCodec | undefined,
  resultSchema: VrpcWireSchema | undefined,
) {
  try {
    return await decodeVrpcBody(response, cborCodec, resultSchema);
  } catch (cause) {
    if (cause instanceof VrpcProtocolError) {
      throw cause;
    }
    const message = cause instanceof Error ? cause.message : "Invalid vRPC response.";
    throw new VrpcProtocolError(response, message, {}, { cause });
  }
}

function normalizeResponseHeaders(headers: VrpcResponseLike["headers"]) {
  if (!headers) {
    return new Headers();
  }

  if (headers instanceof Headers) {
    return new Headers(headers);
  }

  if (Array.isArray(headers)) {
    return new Headers(headers.map(([key, value]) => [key, String(value)]));
  }

  const normalized = new Headers();
  for (const [key, rawValue] of Object.entries(headers)) {
    if (rawValue == null) {
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      normalized.append(key, String(value));
    }
  }
  return normalized;
}

function buildResponse(responseLike: VrpcResponseLike) {
  const response = new Response(null, {
    status: responseLike.status,
    statusText: responseLike.statusText,
    headers: normalizeResponseHeaders(responseLike.headers),
  });

  try {
    Object.defineProperty(response, "url", {
      value: responseLike.url || "",
      configurable: true,
    });
  } catch {}

  return response;
}

function resolveVrpcResponse<TResponse = unknown>(
  responseLike: VrpcResponseLike,
  payload: unknown,
): {
  response: Response;
  parsed: ParsedVrpcResponse<TResponse>;
} {
  const response = buildResponse(responseLike);
  const vrpcStatus = response.headers.get("vrpc-status");
  const statusText = response.statusText || "";
  const url = responseLike.url || response.url || "";
  const method = responseLike.method || "POST";

  return {
    response,
    parsed: {
      status: response.status,
      statusText,
      headers: response.headers,
      url,
      method,
      payload,
      ...resolveVrpcEnvelope<TResponse>(response.status, vrpcStatus, payload),
    },
  };
}

export function parseVrpcResponse<TResponse = unknown>(
  responseLike: VrpcResponseLike,
  payload: unknown,
): ParsedVrpcResponse<TResponse> {
  return resolveVrpcResponse<TResponse>(responseLike, payload).parsed;
}

export function unwrapVrpcResponse<TResponse = unknown>(
  responseLike: VrpcResponseLike,
  payload: unknown,
): TResponse {
  const { response, parsed } = resolveVrpcResponse<TResponse>(responseLike, payload);

  if (!parsed.ok) {
    throw new VrpcInvokeError(response, parsed.error, {
      url: parsed.url,
      method: parsed.method,
    });
  }

  return parsed.result;
}
