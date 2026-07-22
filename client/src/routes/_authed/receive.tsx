import { createFileRoute, redirect } from "@tanstack/react-router";

// The goods-receipt lifecycle now lives under /purchases/receipts (task 2.1).
// This legacy path redirects to the new-draft screen so old links keep working.
export const Route = createFileRoute("/_authed/receive")({
  beforeLoad: () => {
    throw redirect({ to: "/purchases/receipts/new" });
  },
});
