import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../types";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function readAccessToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;

  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);

  // Local Pages/Vite proxy: allow explicit bearer for testing.
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  return null;
}

/**
 * Resolve the signed-in user's email from Cloudflare Access JWT.
 * When Access env vars are missing, falls back to DEV_AUTH_EMAIL / X-Dev-Email
 * so `wrangler pages dev` and Vite proxy work without Zero Trust.
 */
export async function requireUserEmail(
  request: Request,
  env: Env,
): Promise<string> {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.CF_ACCESS_AUD?.trim();

  if (!team || !aud) {
    const devHeader = request.headers.get("X-Dev-Email")?.trim();
    const email = (devHeader || env.DEV_AUTH_EMAIL || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new AuthError(
        "Auth not configured. Set CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD, or DEV_AUTH_EMAIL for local use.",
        401,
      );
    }
    return email;
  }

  const token = readAccessToken(request);
  if (!token) throw new AuthError("Missing Access token");

  const JWKS = createRemoteJWKSet(
    new URL(`https://${team}/cdn-cgi/access/certs`),
  );
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${team}`,
      audience: aud,
    });
    const email =
      typeof payload.email === "string" ? payload.email : null;
    if (!email) throw new AuthError("Access token missing email claim");
    return email.toLowerCase();
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("Invalid Access token");
  }
}
