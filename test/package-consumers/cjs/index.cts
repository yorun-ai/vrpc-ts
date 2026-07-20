import {
  createVrpcClient,
  type VrpcClient,
  type VrpcTransport,
  type VrpcTransportRequest,
  type VrpcTransportResponse,
} from "@yorun-ai/vrpc";
import { buildVrpcPath } from "@yorun-ai/vrpc/client";
import { createHttpClient, type HttpClient } from "@yorun-ai/vrpc/http";

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

void vrpcClient;
void httpClient;
void transportTypes;
void buildVrpcPath("example.Service", "Get");
