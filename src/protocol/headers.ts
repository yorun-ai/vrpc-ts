import { VrpcClientInfo, VrpcTrace } from "../contracts/types";

export const VRPC_JSON_CONTENT_TYPE = "application/vrpc+json";
export const VRPC_CBOR_CONTENT_TYPE = "application/vrpc+cbor";

const CLIENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const TRACE_SPAN_PATTERN = /^[0-9a-f]{16}$/;

export type BuildVrpcHeadersOptions = {
  clientInfo: VrpcClientInfo;
  trace: VrpcTrace;
  timeoutMs?: number;
  requestUsesCbor?: boolean;
  responseUsesCbor?: boolean;
};

function assertClientInfo(clientInfo: VrpcClientInfo, scope = "client") {
  if (!CLIENT_NAME_PATTERN.test(clientInfo.clientName)) {
    throw new Error(`Invalid vRPC ${scope} name: ${clientInfo.clientName}`);
  }
  if (!SEMVER_PATTERN.test(clientInfo.clientVersion)) {
    throw new Error(`Invalid vRPC ${scope} version: ${clientInfo.clientVersion}`);
  }
  if (!UUID_PATTERN.test(clientInfo.clientInstanceId)) {
    throw new Error(`Invalid vRPC ${scope} instanceId: ${clientInfo.clientInstanceId}`);
  }
}

function decodeDelimitedAppInfo(value: string): VrpcClientInfo | null {
  const fields: Record<string, string> = {};
  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      return null;
    }
    const key = entry.slice(0, separator).trim();
    const fieldValue = entry.slice(separator + 1).trim();
    if (!key || !fieldValue || key in fields) {
      return null;
    }
    fields[key] = fieldValue;
  }

  if (Object.keys(fields).length !== 3) {
    return null;
  }

  const name = fields.name;
  const version = fields.version;
  const instanceId = fields.instanceId;
  if (!name || !version || !instanceId) {
    return null;
  }
  return {
    clientName: name,
    clientVersion: version,
    clientInstanceId: instanceId,
  };
}

export function assertValidVrpcServerHeader(value: string | null) {
  if (!value) {
    throw new Error("Invalid vRPC response: missing vrpc-server header.");
  }

  const serverInfo = decodeDelimitedAppInfo(value);
  if (!serverInfo) {
    throw new Error("Invalid vRPC response: invalid vrpc-server header.");
  }

  try {
    assertClientInfo(serverInfo, "server");
  } catch {
    throw new Error("Invalid vRPC response: invalid vrpc-server header.");
  }
}

export function assertValidVrpcTrace(trace: VrpcTrace) {
  if (!TRACE_ID_PATTERN.test(trace.id)) {
    throw new Error(`Invalid vRPC trace id: ${trace.id}`);
  }
  if (trace.span !== undefined && !TRACE_SPAN_PATTERN.test(trace.span)) {
    throw new Error(`Invalid vRPC trace span: ${trace.span}`);
  }
}

export function assertValidVrpcTimeout(timeoutMs: number | undefined) {
  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new Error(`Invalid vRPC timeoutMs: ${timeoutMs}`);
  }
}

export function isReservedVrpcHeader(name: string) {
  const normalized = name.toLowerCase();
  return normalized === "accept" || normalized === "content-type" || normalized.startsWith("vrpc-");
}

export function assertNoReservedVrpcHeaders(...values: Array<HeadersInit | undefined>) {
  for (const value of values) {
    if (!value) {
      continue;
    }
    const headers = new Headers(value);
    for (const name of headers.keys()) {
      if (isReservedVrpcHeader(name)) {
        throw new Error(`vRPC protocol header cannot be overridden: ${name}`);
      }
    }
  }
}

export function mediaTypeOf(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() || "";
}

export function buildVrpcHeaders({
  clientInfo,
  trace,
  timeoutMs,
  requestUsesCbor = false,
  responseUsesCbor = false,
}: BuildVrpcHeadersOptions): Headers {
  assertClientInfo(clientInfo);
  assertValidVrpcTrace(trace);
  assertValidVrpcTimeout(timeoutMs);

  const headers = new Headers();
  headers.set("content-type", requestUsesCbor ? VRPC_CBOR_CONTENT_TYPE : VRPC_JSON_CONTENT_TYPE);
  headers.set(
    "accept",
    responseUsesCbor
      ? `${VRPC_CBOR_CONTENT_TYPE}, ${VRPC_JSON_CONTENT_TYPE}`
      : VRPC_JSON_CONTENT_TYPE,
  );
  headers.set(
    "vrpc-client",
    `name=${clientInfo.clientName},version=${clientInfo.clientVersion},instanceId=${clientInfo.clientInstanceId}`,
  );
  headers.set("vrpc-trace", trace.span ? `id=${trace.id},span=${trace.span}` : `id=${trace.id}`);
  if (timeoutMs !== undefined) {
    headers.set("vrpc-options", `timeout=${timeoutMs}ms`);
  }

  return headers;
}
