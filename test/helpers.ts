export const TEST_VRPC_SERVER =
  "name=test.server,version=1.0.0,instanceId=22222222-2222-4222-8222-222222222222";

export function textBody(value: string) {
  return new TextEncoder().encode(value);
}

export function vrpcResponseHeaders(vrpcStatus = "OK", contentType = "application/vrpc+json") {
  return new Headers({
    "content-type": contentType,
    "vrpc-status": vrpcStatus,
    "vrpc-server": TEST_VRPC_SERVER,
  });
}
