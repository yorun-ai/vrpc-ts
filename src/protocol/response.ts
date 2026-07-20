import { VrpcInvokeError } from "../contracts/errors";
import {
  ParsedVrpcResponse,
  VrpcCborCodec,
  VrpcResponseLike,
  VrpcWireSchema,
} from "../contracts/types";
import {
  assertValidVrpcServerHeader,
  mediaTypeOf,
  VRPC_CBOR_CONTENT_TYPE,
  VRPC_JSON_CONTENT_TYPE,
} from "./headers";
import { fromCborWireValue, normalizeCborValue } from "./wire";

type VrpcSuccessPayload<TResponse> = {
  result: TResponse;
  error: null;
};

type VrpcErrorPayloadEnvelope = {
  result: null;
  error?: unknown;
};

function readEnvelopeError(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  return (payload as VrpcErrorPayloadEnvelope).error ?? payload;
}

function readEnvelopeResult(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return (payload as { result?: unknown }).result;
}

function requireResponseHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value) {
    throw new Error(`Invalid vRPC response: missing ${name} header.`);
  }
  return value;
}

function readDecodedEnvelopeField(payload: unknown, field: "result" | "error") {
  if (payload instanceof Map) {
    return payload.get(field);
  }
  if (payload && typeof payload === "object") {
    return (payload as Record<string, unknown>)[field];
  }
  return undefined;
}

export async function decodeVrpcResponsePayload(
  response: Response,
  cborCodec: VrpcCborCodec | undefined,
  resultSchema: VrpcWireSchema | undefined,
) {
  requireResponseHeader(response.headers, "vrpc-status");
  assertValidVrpcServerHeader(response.headers.get("vrpc-server"));

  const contentType = mediaTypeOf(requireResponseHeader(response.headers, "content-type"));
  if (contentType === VRPC_JSON_CONTENT_TYPE) {
    const text = await response.text();
    if (!text) {
      throw new Error("Invalid vRPC response: empty response body.");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid vRPC response: JSON body cannot be parsed.");
    }
  }

  if (contentType !== VRPC_CBOR_CONTENT_TYPE) {
    throw new Error(`Invalid vRPC response content-type: ${contentType || "empty"}.`);
  }
  if (!resultSchema) {
    throw new Error("Invalid vRPC response: unexpected CBOR body for a JSON method.");
  }
  if (!cborCodec) {
    throw new Error("A cborCodec is required to decode a CBOR vRPC response.");
  }

  const decoded = await cborCodec.decode(new Uint8Array(await response.arrayBuffer()));
  const result = readDecodedEnvelopeField(decoded, "result");
  const error = readDecodedEnvelopeField(decoded, "error");
  return {
    result: fromCborWireValue(result, resultSchema),
    error: normalizeCborValue(error),
  };
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

  if (response.ok && vrpcStatus === "OK") {
    return {
      response,
      parsed: {
        ok: true,
        status: response.status,
        statusText,
        vrpcStatus: "OK",
        headers: response.headers,
        url,
        method,
        payload,
        result: (payload as VrpcSuccessPayload<TResponse>).result,
        error: null,
      },
    };
  }

  return {
    response,
    parsed: {
      ok: false,
      status: response.status,
      statusText,
      vrpcStatus,
      headers: response.headers,
      url,
      method,
      payload,
      result: readEnvelopeResult(payload),
      error: readEnvelopeError(payload),
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
