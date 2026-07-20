import { VrpcInvokeRequest } from "../contracts/types";

export function normalizeInvokeRequest(request: VrpcInvokeRequest): VrpcInvokeRequest {
  return {
    serviceName: request.serviceName,
    methodName: request.methodName,
    params: request.params ?? null,
    options: request.options,
  };
}
