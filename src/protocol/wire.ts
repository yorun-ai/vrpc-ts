import { VrpcWireSchema } from "../contracts/types";

function resolveFields(schema: Extract<VrpcWireSchema, { kind: "object" }>) {
  return typeof schema.fields === "function" ? schema.fields() : schema.fields;
}

function entriesOf(value: unknown): Array<[unknown, unknown]> {
  if (value instanceof Map) {
    return Array.from(value.entries());
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value);
  }
  throw new Error("vRPC wire map value must be a Record or Map.");
}

function objectOf(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries(), ([key, item]) => [String(key), item]));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("vRPC wire object value must be an object.");
}

function toIntegerKey(value: unknown) {
  const integer = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(integer)) {
    throw new Error(`vRPC wire map key must be an integer: ${String(value)}`);
  }
  return integer;
}

function normalizeBinary(value: unknown) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("vRPC Binary value must be a Uint8Array.");
}

export function toCborWireValue(value: unknown, schema: VrpcWireSchema): unknown {
  if (value == null) {
    return value;
  }

  switch (schema.kind) {
    case "value":
      return value;
    case "binary":
      return normalizeBinary(value);
    case "list":
      if (!Array.isArray(value)) {
        throw new Error("vRPC wire list value must be an array.");
      }
      return value.map((item) => toCborWireValue(item, schema.value));
    case "map": {
      const entries = entriesOf(value);
      if (schema.key === "int") {
        return new Map(
          entries.map(([key, item]) => [toIntegerKey(key), toCborWireValue(item, schema.value)]),
        );
      }
      return Object.fromEntries(
        entries.map(([key, item]) => [String(key), toCborWireValue(item, schema.value)]),
      );
    }
    case "object": {
      const input = objectOf(value);
      const output = { ...input };
      for (const [field, fieldSchema] of Object.entries(resolveFields(schema))) {
        if (field in input) {
          output[field] = toCborWireValue(input[field], fieldSchema);
        }
      }
      return output;
    }
  }
}

export function fromCborWireValue(value: unknown, schema: VrpcWireSchema): unknown {
  if (value == null) {
    return value;
  }

  switch (schema.kind) {
    case "value":
      return value;
    case "binary":
      return normalizeBinary(value);
    case "list":
      if (!Array.isArray(value)) {
        throw new Error("vRPC wire list value must be an array.");
      }
      return value.map((item) => fromCborWireValue(item, schema.value));
    case "map":
      return Object.fromEntries(
        entriesOf(value).map(([key, item]) => {
          const normalizedKey = schema.key === "int" ? toIntegerKey(key) : String(key);
          return [String(normalizedKey), fromCborWireValue(item, schema.value)];
        }),
      );
    case "object": {
      const input = objectOf(value);
      const output = { ...input };
      for (const [field, fieldSchema] of Object.entries(resolveFields(schema))) {
        if (field in input) {
          output[field] = fromCborWireValue(input[field], fieldSchema);
        }
      }
      return output;
    }
  }
}

export function normalizeCborValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries(), ([key, item]) => [String(key), normalizeCborValue(item)]),
    );
  }
  if (Array.isArray(value)) {
    return value.map(normalizeCborValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeCborValue(item)]),
    );
  }
  return value;
}
