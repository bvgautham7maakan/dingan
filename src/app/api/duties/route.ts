import { withUser, jsonFor } from "@/lib/api";
import { DUTY_ASSIGN_ROLES, DUTY_VIEW_ROLES, listDuties } from "@/lib/site/duties";
import { hasAnyRole } from "@/lib/roles";

export const GET = withUser(
  async (user) => jsonFor(user, { duties: await listDuties(user), canAssign: hasAnyRole(user.roles, DUTY_ASSIGN_ROLES), now: new Date().toISOString() }),
  DUTY_VIEW_ROLES,
);
