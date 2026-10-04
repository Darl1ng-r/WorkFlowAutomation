import { Context, Next } from "hono";
import { UnauthorizedError, ForbiddenError } from "@domain/errors";

export type UserRole = "DIRECTOR" | "FINANCE" | "OPERATIONS" | "RECEPTIONIST" | "STAFF" | "KIOSK";

export interface AuthenticatedUser {
  email: string;
  role: UserRole;
  source: "CLOUDFLARE_ACCESS" | "DEV_OVERRIDE" | "KIOSK";
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthenticatedUser;
  }
}

// In-memory cache for Cloudflare Access JWKS public keys per isolate
interface CachedJwks {
  keys: Array<{ kid: string; n: string; e: string; kty: string }>;
  fetchedAt: number;
}
let jwksCache: CachedJwks | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function resolveUserRole(email: string): UserRole {
  const lower = email.toLowerCase().trim();
  if (lower.includes("kiosk")) {
    return "KIOSK";
  }
  if (
    lower.startsWith("director") ||
    lower.startsWith("ceo") ||
    lower.startsWith("cfo") ||
    lower.startsWith("admin") ||
    lower.includes("management")
  ) {
    return "DIRECTOR";
  }
  if (lower.includes("finance") || lower.includes("account") || lower.includes("billing")) {
    return "FINANCE";
  }
  if (lower.includes("reception") || lower.includes("frontdesk") || lower.includes("concierge")) {
    return "RECEPTIONIST";
  }
  if (lower.includes("ops") || lower.includes("operation") || lower.includes("facility")) {
    return "OPERATIONS";
  }
  return "STAFF";
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verifies Cloudflare Access RS256 JWT assertion against CF Access JWKS.
 */
async function verifyCloudflareAccessJwt(
  jwt: string,
  teamDomain?: string,
  expectedAud?: string
): Promise<{ email: string } | null> {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const headerStr = new TextDecoder().decode(base64UrlDecode(headerB64));
    const header = JSON.parse(headerStr) as { alg?: string; kid?: string };

    if (header.alg !== "RS256" || !header.kid) {
      return null;
    }

    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadStr) as { email?: string; aud?: string | string[]; exp?: number };

    // 1. Check expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return null;
    }

    // 2. Check audience if configured
    if (expectedAud) {
      const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!auds.includes(expectedAud)) {
        return null;
      }
    }

    // 3. Cryptographically verify signature if team domain is configured
    if (teamDomain) {
      const now = Date.now();
      if (!jwksCache || now - jwksCache.fetchedAt > JWKS_CACHE_TTL_MS) {
        const res = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
        if (!res.ok) return null;
        const jwks = (await res.json()) as { keys: Array<{ kid: string; n: string; e: string; kty: string }> };
        jwksCache = { keys: jwks.keys, fetchedAt: now };
      }

      const matchingKey = jwksCache.keys.find((k) => k.kid === header.kid);
      if (!matchingKey) return null;

      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        matchingKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const dataToVerify = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const signatureBytes = base64UrlDecode(signatureB64);

      const isValid = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        signatureBytes,
        dataToVerify
      );

      if (!isValid) return null;
    }

    if (!payload.email) return null;
    return { email: payload.email.toLowerCase().trim() };
  } catch (_) {
    return null;
  }
}

export interface AuthMiddlewareOptions {
  allowKiosk?: boolean;
  strictMode?: boolean;
}

export function authMiddleware(options?: AuthMiddlewareOptions) {
  return async (c: Context, next: Next) => {
    const env = c.env as Record<string, string> | undefined;
    const environment = env?.ENVIRONMENT ?? "development";
    const isProductionOrStaging = environment === "production" || environment === "staging";
    const isStrictMode = options?.strictMode || isProductionOrStaging;

    // If user is already set (e.g. by specialized allowKiosk middleware), proceed
    if (c.get("user")) {
      return next();
    }

    // 1. Allow kiosk bypass if explicitly designated on public kiosk check-in
    if (options?.allowKiosk) {
      c.set("user", {
        email: "kiosk@frontdesk.local",
        role: "KIOSK",
        source: "KIOSK",
      });
      return next();
    }

    // 2. Cryptographic Cloudflare Access JWT Assertion Verification
    const jwtAssertion = c.req.header("Cf-Access-Jwt-Assertion");
    if (jwtAssertion) {
      const verified = await verifyCloudflareAccessJwt(
        jwtAssertion,
        env?.ACCESS_TEAM_DOMAIN,
        env?.ACCESS_AUD
      );

      if (verified) {
        c.set("user", {
          email: verified.email,
          role: resolveUserRole(verified.email),
          source: "CLOUDFLARE_ACCESS",
        });
        return next();
      }

      // If JWT assertion is present but invalid/expired, immediately fail closed
      throw new UnauthorizedError("Invalid or expired Cloudflare Access identity token.");
    }

    // 3. In Non-Strict Dev/Test mode ONLY: allow controlled dev override
    if (!isStrictMode) {
      const devUserEmail = c.req.header("x-user-email");
      if (devUserEmail) {
        const cleanEmail = devUserEmail.toLowerCase().trim();
        c.set("user", {
          email: cleanEmail,
          role: resolveUserRole(cleanEmail),
          source: "DEV_OVERRIDE",
        });
        return next();
      }

      // Default development user fallback
      const defaultDevEmail = "admin@company.com";
      c.set("user", {
        email: defaultDevEmail,
        role: "DIRECTOR",
        source: "DEV_OVERRIDE",
      });
      return next();
    }

    // 4. In production or strict mode without valid credentials: FAIL CLOSED
    throw new UnauthorizedError("Valid Cloudflare Access identity required.");
  };
}

/**
 * RBAC Guard Middleware: enforces that the authenticated user possesses one of the allowed roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) {
      throw new UnauthorizedError("Authentication required.");
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError(
        `Action requires one of the following roles: [${allowedRoles.join(", ")}]. Current role: '${user.role}'`
      );
    }

    return next();
  };
}
