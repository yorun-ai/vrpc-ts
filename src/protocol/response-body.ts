import type { VrpcCborCodec, VrpcWireSchema } from "../contracts/types";
import {
  assertValidVrpcServerHeader,
  mediaTypeOf,
  VRPC_JSON_CONTENT_TYPE,
  VRPC_CBOR_CONTENT_TYPE,
} from "./headers";
import { fromCborWireValue, normalizeCborValue } from "./wire";

export type VrpcBodyReader = {
  headers: { get(name: string): string | null };
  text(): string | Promise<string>;
  arrayBuffer(): ArrayBuffer | Promise<ArrayBuffer>;
};

function requireResponseHeader(response: VrpcBodyReader, name: string) {
  const value = response.headers.get(name);
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

export async function decodeVrpcBody(
  response: VrpcBodyReader,
  cborCodec: VrpcCborCodec | undefined,
  resultSchema: VrpcWireSchema | undefined,
) {
  requireResponseHeader(response, "vrpc-status");
  assertValidVrpcServerHeader(response.headers.get("vrpc-server"));

  const contentType = mediaTypeOf(requireResponseHeader(response, "content-type"));
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
