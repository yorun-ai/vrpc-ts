import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CLIENT_INSTANCE_ID_STORAGE_KEY,
  getClientInstanceId,
} from "../src/entrypoints/client";

type MemoryStorage = {
  values: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function createMemoryStorage(initialValues?: Record<string, string>): MemoryStorage {
  const values = new Map(Object.entries(initialValues || {}));

  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function installLocalStorage(storage: MemoryStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorageDescriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("getClientInstanceId", () => {
  it("should reuse persisted id from default storage key", () => {
    const storage = createMemoryStorage({
      [DEFAULT_CLIENT_INSTANCE_ID_STORAGE_KEY]: "11111111-1111-4111-8111-111111111111",
    });
    installLocalStorage(storage);

    const clientInstanceId = getClientInstanceId();

    expect(clientInstanceId).toBe("11111111-1111-4111-8111-111111111111");
    expect(storage.values.get(DEFAULT_CLIENT_INSTANCE_ID_STORAGE_KEY)).toBe(clientInstanceId);
  });

  it("should persist generated id with custom storage key", () => {
    const storage = createMemoryStorage();
    installLocalStorage(storage);

    const clientInstanceId = getClientInstanceId({
      key: "custom-vrpc-client-instance-id",
    });

    expect(clientInstanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(storage.values.get("custom-vrpc-client-instance-id")).toBe(clientInstanceId);
  });

  it("should return generated id when localStorage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("read failed");
        },
        setItem: () => {
          throw new Error("write failed");
        },
      },
      configurable: true,
    });

    const clientInstanceId = getClientInstanceId();

    expect(clientInstanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
