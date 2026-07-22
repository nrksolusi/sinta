import { createFileRoute } from "@tanstack/react-router";
import { OpnameFlow } from "./-opname-flow";

// The opname count-sheet flow (prototype D5) lives in one route with internal
// step state (setup -> count -> review).
export const Route = createFileRoute("/_authed/stock/opnames/new")({
  component: () => <OpnameFlow />,
});
