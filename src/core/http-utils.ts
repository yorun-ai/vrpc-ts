export const NULL_BODY_STATUS_CODES = new Set([101, 103, 204, 205, 304]);

export function isNullBodyStatus(status: number) {
  return NULL_BODY_STATUS_CODES.has(status);
}

export function shouldTreatResponseAsBodyless(method: string, status: number) {
  return method.toUpperCase() === "HEAD" || isNullBodyStatus(status);
}

export function normalizeBaseUrl(input: string | URL) {
  const value = String(input);
  return value.endsWith("/") ? value : `${value}/`;
}

type BuildRequestUrlOptions = {
  allowAbsoluteUrls?: boolean;
};

const ALLOWED_ABSOLUTE_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function buildRequestUrl(
  prefixUrl: string | URL,
  path: string,
  { allowAbsoluteUrls = false }: BuildRequestUrlOptions = {},
) {
  if (/^\s*\/\//.test(path)) {
    throw new Error("Protocol-relative request URLs are not supported.");
  }

  let absoluteUrl: URL | undefined;
  try {
    absoluteUrl = new URL(path);
  } catch {}

  if (absoluteUrl) {
    if (!ALLOWED_ABSOLUTE_URL_PROTOCOLS.has(absoluteUrl.protocol)) {
      throw new Error(
        `Unsupported absolute request URL protocol: ${absoluteUrl.protocol || "unknown"}`,
      );
    }
    if (!allowAbsoluteUrls) {
      throw new Error(
        "Absolute request URLs are disabled. Set allowAbsoluteUrls: true on createHttpClient() to enable them.",
      );
    }
    return absoluteUrl.toString();
  }

  const base = String(prefixUrl).replace(/\/+$/, "");
  const relativePath = path.replace(/^\/+/, "");
  return relativePath ? `${base}/${relativePath}` : `${base}/`;
}

export function appendQueryToUrl(
  url: string,
  query?:
    | URLSearchParams
    | Record<
        string,
        string | number | boolean | Array<string | number | boolean> | null | undefined
      >,
) {
  if (!query) {
    return url;
  }

  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const urlWithoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const searchIndex = urlWithoutHash.indexOf("?");
  const basePath = searchIndex >= 0 ? urlWithoutHash.slice(0, searchIndex) : urlWithoutHash;
  const currentSearch = searchIndex >= 0 ? urlWithoutHash.slice(searchIndex + 1) : "";
  const searchParams = new URLSearchParams(currentSearch);

  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => {
      searchParams.append(key, value);
    });
    const nextSearch = searchParams.toString();
    return `${basePath}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
  }

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue == null) {
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      searchParams.append(key, String(value));
    }
  }

  const nextSearch = searchParams.toString();
  return `${basePath}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}

export function mergeHeaders(...values: Array<HeadersInit | undefined>) {
  const merged = new Headers();
  values.forEach((value) => {
    if (!value) {
      return;
    }
    const source = new Headers(value);
    source.forEach((headerValue, headerKey) => merged.set(headerKey, headerValue));
  });
  return merged;
}

export async function parseResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
