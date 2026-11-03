import { AuthError } from "./auth";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function handleError(err: unknown): Response {
  if (err instanceof AuthError) {
    return json({ error: err.message }, err.status);
  }
  console.error("[api]", err);
  return json({ error: "Internal server error" }, 500);
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
