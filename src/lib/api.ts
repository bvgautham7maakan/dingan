import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth/current";
import { hasAnyRole, type Role } from "./roles";
import { moneyFor } from "./money";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Every API JSON response goes through here so AED fields are stripped by role. */
export function jsonFor(user: CurrentUser, data: unknown, init?: ResponseInit) {
  return NextResponse.json(moneyFor(user.roles, data), init);
}

type Handler = (user: CurrentUser, req: Request) => Promise<Response>;

export function withUser(handler: Handler, allowed?: readonly Role[]) {
  return async (req: Request) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "unauthenticated");
      if (user.mustChangePassword) throw new ApiError(403, "password_change_required");
      if (allowed && !hasAnyRole(user.roles, allowed)) throw new ApiError(403, "forbidden");
      return await handler(user, req);
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.code }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json({ error: "invalid", issues: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}
