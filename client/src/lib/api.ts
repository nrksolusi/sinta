import createClient from "openapi-fetch";
import type { paths } from "./api-types";

// Typed client over the generated OpenAPI contract (ADR-0007). Session auth
// uses the sinta_session cookie, so credentials ride along automatically.
export const api = createClient<paths>({
  baseUrl: "/v1",
  credentials: "include",
});
