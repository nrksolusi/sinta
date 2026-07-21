import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  // Checking creds only do it once here
  beforeLoad: async () => {
    const session = {};
    return { session };
  },
});
