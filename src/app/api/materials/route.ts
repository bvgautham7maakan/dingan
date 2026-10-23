import { withUser, jsonFor } from "@/lib/api";
import { catalogue, MR_CREATE_ROLES } from "@/lib/materials/server";
import { projectChoices } from "@/lib/site/projects";

// Catalogue for the material request form (cached on the phone). No prices.
export const GET = withUser(async (user, req) => {
  const projects = await projectChoices(user);
  const projectId = new URL(req.url).searchParams.get("project") || projects[0]?.id;
  return jsonFor(user, { projectId, projects, materials: projectId ? await catalogue(projectId) : [] });
}, MR_CREATE_ROLES);
