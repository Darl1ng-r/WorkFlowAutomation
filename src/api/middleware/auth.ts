import { Context, Next } from "hono";
import { UnauthorizedError } from "@domain/errors";

export interface AuthenticatedUser {
  email: string;
  source: "CLOUDFLARE_ACCESS" | "DEV_OVERRIDE" | "KIOSK";
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthenticatedUser;
  }
}

export function authMiddleware(options?: { allowKiosk?: boolean }) {
  return async (c: Context, next: Next) => {
    // 1. Check if Cloudflare Access header is present
    const cfUserEmail = c.req.header("cf-access-authenticated-user-email");
    if (cfUserEmail) {
      c.set("user", {
        email: cfUserEmail.toLowerCase().trim(),
        source: "CLOUDFLARE_ACCESS",
      });
      return next();
    }

    // 2. Allow kiosk requests if explicitly marked for public/reception endpoints
    if (options?.allowKiosk) {
      c.set("user", {
        email: "kiosk@frontdesk.local",
        source: "KIOSK",
      });
      return next();
    }

    // 3. In development / testing environments, allow override via header
    const devUserEmail = c.req.header("x-user-email");
    const env = c.env as Record<string, unknown> | undefined;
    const isDev = !env || env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test";

    if (devUserEmail && isDev) {
      c.set("user", {
        email: devUserEmail.toLowerCase().trim(),
        source: "DEV_OVERRIDE",
      });
      return next();
    }

    if (isDev) {
      c.set("user", {
        email: "admin@company.com",
        source: "DEV_OVERRIDE",
      });
      return next();
    }

    throw new UnauthorizedError("Valid Cloudflare Access identity token required.");
  };
}
