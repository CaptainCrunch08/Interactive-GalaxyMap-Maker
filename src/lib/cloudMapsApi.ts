import type { Campaign } from "../types/campaign";

export type CloudMapMeta = {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
};

export type CloudMapDetail = CloudMapMeta & {
  campaign: Campaign;
};

export class CloudApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function devHeaders(): HeadersInit {
  if (!import.meta.env.DEV) return {};
  const email = import.meta.env.VITE_DEV_AUTH_EMAIL as string | undefined;
  return email ? { "X-Dev-Email": email } : {};
}

/** Abort hung /api calls (dead pages:dev used to freeze "Checking session…"). */
const API_TIMEOUT_MS = 8_000;

async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  const signal =
    init?.signal != null
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      signal,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...devHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new TypeError(
        "Cannot reach /api (timed out). Run `npm run pages:dev` on port 8788 alongside Vite.",
      );
    }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new CloudApiError(msg, res.status);
  }
  return data as T;
}

export async function fetchMe(): Promise<{ email: string }> {
  return api("/api/me");
}

export async function listCloudMaps(): Promise<CloudMapMeta[]> {
  const data = await api<{ maps: CloudMapMeta[] }>("/api/maps");
  return data.maps ?? [];
}

export async function getCloudMap(id: string): Promise<CloudMapDetail> {
  return api(`/api/maps/${encodeURIComponent(id)}`);
}

export async function createCloudMap(args: {
  id?: string;
  name?: string;
  campaign: Campaign;
}): Promise<CloudMapMeta> {
  return api("/api/maps", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export async function putCloudMap(
  id: string,
  args: { name?: string; campaign: Campaign },
): Promise<CloudMapMeta> {
  return api(`/api/maps/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(args),
  });
}

export async function deleteCloudMap(id: string): Promise<void> {
  await api(`/api/maps/${encodeURIComponent(id)}`, { method: "DELETE" });
}
