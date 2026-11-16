import {
  buildVrpcHeaderRecord,
  generateVrpcId,
  decodeVrpcResponse,
  type VrpcResponseSource,
} from "@yorun-ai/vrpc/protocol";
const headers: Record<string, string> = buildVrpcHeaderRecord({
  clientInfo: {
    clientName: "miniapp",
    clientVersion: "1.0.0",
    clientInstanceId: "11111111-1111-4111-8111-111111111111",
  },
  trace: { id: generateVrpcId() },
});
const response: VrpcResponseSource = {
  status: 200,
  headers,
  text: () => '{"result":null,"error":null}',
  arrayBuffer: () => new ArrayBuffer(0),
};
void decodeVrpcResponse<null>(response);
