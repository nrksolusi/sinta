import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { components } from "./api-types";
import type { Role } from "./roles";

export type SessionInfo = components["schemas"]["SessionInfo"];

// Role in the currently active tenant, undefined when no tenant is active.
export function activeRole(session: SessionInfo): Role | undefined {
  return session.memberships.find(
    (mb) => mb.tenant.id === session.activeTenantId,
  )?.role;
}

// null means "not authenticated" - a normal state, not an error.
export const sessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async (): Promise<SessionInfo | null> => {
    const { data, response } = await api.GET("/auth/session");
    if (response.status === 401) return null;
    if (!data) throw new Error(`session request failed: ${response.status}`);
    return data;
  },
});
