import { withUser, jsonFor } from "@/lib/api";
import { projectChoices } from "@/lib/site/projects";
import { listQueries, QUERY_RAISE_ROLES, QUERY_VIEW_ROLES } from "@/lib/site/queries";
import { hasAnyRole } from "@/lib/roles";

export const GET = withUser(async (user) => {
  return jsonFor(user, {
    canRaise: hasAnyRole(user.roles, QUERY_RAISE_ROLES),
    projects: await projectChoices(user),
    queries: await listQueries(user),
  });
}, QUERY_VIEW_ROLES);
