import { readServerErrorMessage, readServerErrorStringField } from "./error-payload";
import type { VrpcCborCodec, VrpcWireSchema } from "./types";

export type VrpcHeaderRecord = Record<string, string>;
export type VrpcResponseData = {
  status: number;
  statusText?: string;
  headers: Readonly<Record<string, string | readonly string[] | undefined | null>>;
  url?: string;
  method?: string;
};

// Body readers belong to the platform adapter. No browser globals are required.
export type VrpcResponseSource = VrpcResponseData & {
  text(): string | Promise<string>;
  arrayBuffer(): ArrayBuffer | Promise<ArrayBuffer>;
};

export type VrpcDecodeOptions = {
  cborCodec?: VrpcCborCodec;
  resultSchema?: VrpcWireSchema;
};

export type VrpcResponseResult<T = unknown> = {
  status: number;
  statusText: string;
  headers: VrpcHeaderRecord;
  url: string;
  method: string;
  payload: unknown;
} & (
  | { ok: true; vrpcStatus: "OK"; result: T; error: null }
  | { ok: false; vrpcStatus: string | null; result: unknown; error: unknown }
);

// Separate from the browser client's errors, whose responseHeaders are Headers.
// Existing error types and guards retain their published contracts.
export class VrpcResponseError extends Error {
  readonly kind: "protocol" | "invoke";
  readonly cause?: unknown;
  readonly status: number;
  readonly statusText: string;
  readonly responseHeaders: VrpcHeaderRecord;
  readonly vrpcStatus: string | null;
  readonly url: string;
  readonly method: string;
  readonly payload: unknown;
  readonly code?: string;
  readonly reason?: string;
  readonly detail?: string;

  constructor(
    kind: "protocol" | "invoke",
    response: VrpcResponseResult,
    payload: unknown,
    options: { message?: string; cause?: unknown } = {},
  ) {
    super(
      options.message ??
        readServerErrorMessage(payload) ??
        `request failed (status=${response.status})`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "VrpcResponseError";
    this.kind = kind;
    this.cause = options.cause;
    this.status = response.status;
    this.statusText = response.statusText;
    this.responseHeaders = response.headers;
    this.vrpcStatus = response.vrpcStatus;
    this.url = response.url;
    this.method = response.method;
    this.payload = payload;
    this.code =
      kind === "protocol" ? "VRPC_PROTOCOL_ERROR" : readServerErrorStringField(payload, "code");
    this.reason = readServerErrorStringField(payload, "reason");
    this.detail = readServerErrorStringField(payload, "detail");
  }
}
