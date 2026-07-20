import { GetClientInstanceIdOptions } from "../contracts/types";

export const DEFAULT_CLIENT_INSTANCE_ID_STORAGE_KEY = "vrpc-client-instance-id";

function getRandomByteArray(length: number) {
  const array = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
    return array;
  }
  for (let i = 0; i < length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function newNonZeroHex(bytesLength: number, zeroValue: string) {
  for (;;) {
    const value = toHex(getRandomByteArray(bytesLength));
    if (value !== zeroValue) {
      return value;
    }
  }
}

export function generateVrpcId() {
  return newNonZeroHex(16, "00000000000000000000000000000000");
}

export function generateVrpcSpan() {
  return newNonZeroHex(8, "0000000000000000");
}

export function generateClientInstanceId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().toLowerCase();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function getClientInstanceId({ key }: GetClientInstanceIdOptions = {}) {
  const storageKey = key?.trim() || DEFAULT_CLIENT_INSTANCE_ID_STORAGE_KEY;

  try {
    const existingClientInstanceId = globalThis.localStorage.getItem(storageKey);
    if (existingClientInstanceId) {
      return existingClientInstanceId;
    }

    const clientInstanceId = generateClientInstanceId();
    globalThis.localStorage.setItem(storageKey, clientInstanceId);
    return clientInstanceId;
  } catch {
    return generateClientInstanceId();
  }
}
