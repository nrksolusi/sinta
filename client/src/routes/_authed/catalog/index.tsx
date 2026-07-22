import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/catalog/")({
  beforeLoad: () => {
    throw redirect({ to: "/catalog/products" });
  },
});
