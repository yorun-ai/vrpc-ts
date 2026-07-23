import {
  createVrpcClient,
  isVrpcError,
  type VrpcClient,
  type VrpcTransport,
  type VrpcTransportRequest,
  type VrpcTransportResponse,
} from "@yorun-ai/vrpc";
import { buildVrpcPath } from "@yorun-ai/vrpc/client";
import { createHttpClient, isHttpError, type HttpClient } from "@yorun-ai/vrpc/http";

const vrpcClient: VrpcClient = createVrpcClient({
  prefixUrl: "https://example.com",
  clientInfo: {
    clientName: "type-test",
    clientVersion: "0.0.0",
    clientInstanceId: "type-test",
  },
});
const httpClient: HttpClient = createHttpClient({ prefixUrl: "https://example.com" });
const transportTypes: [VrpcTransport, VrpcTransportRequest, VrpcTransportResponse] | undefined =
  undefined;

function classifyError(error: unknown) {
  if (isVrpcError(error) && error.kind === "timeout") {
    return error.timeoutMs;
  }
  if (isVrpcError(error) && error.kind === "invoke") {
    return [error.vrpcStatus, error.code, error.reason];
  }
  if (isHttpError(error)) {
    return error.kind;
  }
  return undefined;
}

void vrpcClient;
void httpClient;
void transportTypes;
void classifyError;
void buildVrpcPath("example.Service", "Get");
