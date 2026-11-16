import type { HttpErrorPayload } from "./errors";

export function readServerErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const body = payload as HttpErrorPayload;
  if (typeof body.message !== "string" || !body.message.trim()) {
    return undefined;
  }
  const detail = typeof body.detail === "string" ? body.detail.trim() : "";
  return detail ? `${body.message}\n${detail}` : body.message;
}

export function readServerErrorStringField(payload: unknown, field: keyof HttpErrorPayload) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const value = (payload as HttpErrorPayload)[field];
  return typeof value === "string" ? value : undefined;
}
