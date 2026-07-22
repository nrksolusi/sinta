import { createFileRoute, redirect } from "@tanstack/react-router";

// The old fire-and-forget delivery form is replaced by the document lifecycle
// under /sales/deliveries (UX-D1/D2). Keep the old path working by redirecting
// its entry point to the new draft route (fix-2 route map).
export const Route = createFileRoute("/_authed/delivery")({
  beforeLoad: () => {
    throw redirect({ to: "/sales/deliveries/new" });
  },
});
