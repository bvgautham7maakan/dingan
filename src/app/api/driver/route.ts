import { withUser, jsonFor } from "@/lib/api";
import { BILL_ROLES, getDriverDay } from "@/lib/logistics/server";

export const GET = withUser(async (user) => jsonFor(user, await getDriverDay(user)), [...BILL_ROLES, "ADMIN"]);
