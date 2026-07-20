import { VrpcCborCodec, VrpcRequestParams, VrpcWireSchema } from "../contracts/types";
import { toCborWireValue } from "./wire";

export function buildVrpcPath(serviceName: string, methodName: string) {
  return `${encodeURIComponent(serviceName)}/${encodeURIComponent(methodName)}`;
}

export function buildVrpcRequestBody(params: VrpcRequestParams | null | undefined) {
  return JSON.stringify({ params: params ?? null });
}

export async function encodeVrpcRequestBody(
  params: VrpcRequestParams | null,
  schema: VrpcWireSchema | undefined,
  cborCodec: VrpcCborCodec | undefined,
): Promise<string | ArrayBuffer> {
  if (!schema) {
    return buildVrpcRequestBody(params);
  }
  if (!cborCodec) {
    throw new Error("A cborCodec is required to encode a CBOR vRPC request.");
  }

  const bytes = await cborCodec.encode({ params: toCborWireValue(params, schema) });
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("cborCodec.encode() must return a Uint8Array.");
  }
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return body.buffer;
}
