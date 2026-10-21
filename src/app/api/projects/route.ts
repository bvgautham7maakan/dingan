import { withUser, jsonFor } from "@/lib/api";
import { projectsFor } from "@/lib/projects";

// Money fields (bulThresholdFils) are stripped for no-AED roles by jsonFor.
export const GET = withUser(async (user, req) => {
  const scope = new URL(req.url).searchParams.get("scope");
  const { scope: s, projects } = await projectsFor(user, scope === "all" || scope === "mine" ? scope : undefined);
  return jsonFor(user, { scope: s, projects });
});
