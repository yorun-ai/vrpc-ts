import { HttpTransportResponse } from "../contracts/types";
import { isNullBodyStatus } from "./http-utils";

export function buildResponseFromTransportResult(result: HttpTransportResponse) {
  const body = isNullBodyStatus(result.status) ? null : result.body;
  const response = new Response(body as BodyInit | null, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });

  try {
    Object.defineProperty(response, "url", {
      value: result.url,
      configurable: true,
    });
  } catch {}

  return response;
}
