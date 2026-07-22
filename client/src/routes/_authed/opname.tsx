import { createFileRoute, redirect } from "@tanstack/react-router";

// Old opname form route; the flow moved to /stock/opnames/new (UX-D3, route
// map in docs/plans/fix-2-ui-redesign.md).
export const Route = createFileRoute("/_authed/opname")({
  beforeLoad: () => {
    throw redirect({ to: "/stock/opnames/new" });
  },
});
