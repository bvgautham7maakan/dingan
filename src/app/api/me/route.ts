import { withUser, jsonFor } from "@/lib/api";

export const GET = withUser(async (user) =>
  jsonFor(user, { id: user.id, username: user.username, displayName: user.displayName, roles: user.roles, locale: user.locale }),
);
