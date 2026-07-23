import { VrpcInvokeError } from "../contracts/errors";
import {
  VrpcClient,
  VrpcClientOptions,
  VrpcInvokeContext,
  VrpcInvokeRequest,
  VrpcRequestOptions,
  VrpcTrace,
} from "../contracts/types";
import { assertNoReservedVrpcHeaders, buildVrpcHeaders } from "../protocol/headers";
import { generateVrpcId, generateVrpcSpan } from "../protocol/id";
import { buildVrpcPath, encodeVrpcRequestBody } from "../protocol/request";
import { decodeVrpcResponsePayload, unwrapVrpcResponse } from "../protocol/response";
import { createClientCore } from "./create-client-core";
import { buildRequestUrl, mergeHeaders } from "./http-utils";
import { normalizeInvokeRequest } from "./invoke-args";
import { splitVrpcRequestOptions, SplitVrpcRequestOptionsResult } from "./request-options";

type VrpcSuccessPayload<TResponse> = {
  result: TResponse;
  error: null;
};

function buildDefaultTrace(traceMode: NonNullable<VrpcClientOptions["traceMode"]>): VrpcTrace {
  const trace: VrpcTrace = { id: generateVrpcId() };
  if (traceMode === "direct") {
    trace.span = generateVrpcSpan();
  }
  return trace;
}

function assertWireSpec(serviceName: string, methodName: string, wire: VrpcRequestOptions["wire"]) {
  if (!wire) {
    return;
  }
  if (!wire.arguments && !wire.result) {
    throw new Error(`Invalid vRPC wire spec for ${serviceName}/${methodName}: wire is empty.`);
  }
}

function requireCborCodec(
  serviceName: string,
  methodName: string,
  wire: VrpcRequestOptions["wire"],
  cborCodec: VrpcClientOptions["cborCodec"],
) {
  if (wire && !cborCodec) {
    throw new Error(
      `CBOR is required for ${serviceName}/${methodName}, but no cborCodec was configured. ` +
        "Pass cborCodec to createVrpcClient().",
    );
  }
}

export function createVrpcClient(options: VrpcClientOptions): VrpcClient {
  const {
    prefixUrl,
    clientInfo,
    traceMode = "portal",
    cborCodec,
    fetchImpl,
    transport,
    interceptors,
    ...baseOptions
  } = options;
  const core = createClientCore<
    VrpcRequestOptions,
    SplitVrpcRequestOptionsResult,
    VrpcInvokeRequest,
    VrpcInvokeContext,
    NonNullable<VrpcClientOptions["interceptors"]>[number]
  >({
    prefixUrl,
    baseOptions,
    fetchImpl,
    transport,
    interceptors,
    splitRequestOptions: splitVrpcRequestOptions,
    prepareRequest: async (request, helpers) => {
      const resolvedRequest = normalizeInvokeRequest(request);
      const requestOptions = helpers.splitRequestOptions(resolvedRequest.options);
      const wire = requestOptions.wire;
      assertWireSpec(resolvedRequest.serviceName, resolvedRequest.methodName, wire);
      requireCborCodec(resolvedRequest.serviceName, resolvedRequest.methodName, wire, cborCodec);
      assertNoReservedVrpcHeaders(helpers.baseOptions.headers, requestOptions.headers);

      const timeoutMs = requestOptions.timeoutMs ?? helpers.baseOptions.timeoutMs;
      const trace = requestOptions.trace ?? buildDefaultTrace(traceMode);
      const requestUsesCbor = Boolean(wire?.arguments);
      const responseUsesCbor = Boolean(wire?.result);
      const protocolHeaders = buildVrpcHeaders({
        clientInfo,
        trace,
        timeoutMs,
        requestUsesCbor,
        responseUsesCbor,
      });
      const finalHeaders = mergeHeaders(
        helpers.baseOptions.headers,
        requestOptions.headers,
        protocolHeaders,
      );
      const body = await encodeVrpcRequestBody(resolvedRequest.params, wire?.arguments, cborCodec);
      const path = buildVrpcPath(resolvedRequest.serviceName, resolvedRequest.methodName);
      const url = buildRequestUrl(helpers.prefixUrl, path);
      const resolvedRequestInit = {
        credentials: "omit" as const,
        ...helpers.baseOptions.requestInit,
        ...requestOptions.requestInit,
      };
      const suppressGlobalToast =
        requestOptions.suppressGlobalToast ?? helpers.baseOptions.suppressGlobalToast;
      const resolvedOptions: VrpcRequestOptions = {
        headers: finalHeaders,
        timeoutMs,
        requestInit: resolvedRequestInit,
        suppressGlobalToast,
        trace,
        wire,
      };
      const init: RequestInit = {
        ...resolvedRequestInit,
        method: "POST",
        headers: finalHeaders,
        body,
      };

      return {
        timeoutMs,
        fallbackMethod: "POST",
        fallbackHeaders: finalHeaders,
        fallbackBody: body,
        context: {
          url,
          init,
          request: resolvedRequest,
          options: resolvedOptions,
        },
      };
    },
    parseResponse: async (response, context) => {
      try {
        return await decodeVrpcResponsePayload(response, cborCodec, context.options.wire?.result);
      } catch (cause) {
        const vrpcStatus = response.headers.get("vrpc-status");
        if (vrpcStatus && (!response.ok || vrpcStatus !== "OK")) {
          throw new VrpcInvokeError(
            response,
            null,
            {
              url: context.url,
              method: String(context.init.method || "POST").toUpperCase(),
            },
            { cause },
          );
        }
        throw cause;
      }
    },
    validateRequest: (_context, requestMeta) => {
      if (requestMeta.method !== "POST") {
        throw new Error(`Unsupported method: ${requestMeta.method}, only POST is allowed.`);
      }
    },
    assertResponse: (response, payload, _context, requestMeta) => {
      unwrapVrpcResponse(
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          url: requestMeta.url,
          method: requestMeta.method,
        },
        payload,
      );
    },
  });

  async function invoke<TResponse = unknown>(request: VrpcInvokeRequest): Promise<TResponse> {
    const payload = await core.execute<VrpcSuccessPayload<TResponse>>(request);
    return payload.result;
  }

  return {
    invoke,
    use: core.use,
  };
}
