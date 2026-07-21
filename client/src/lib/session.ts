import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { components } from "./api-types";

export type SessionInfo = components["schemas"]["SessionInfo"];

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
