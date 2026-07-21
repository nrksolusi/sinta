import { m } from "@/paraglide/messages";
import type { components } from "./api-types";

export type Role = components["schemas"]["Role"];

export const ROLES: Role[] = ["owner", "admin", "warehouse", "sales", "viewer"];

export function roleLabel(role: Role): string {
  switch (role) {
    case "owner":
      return m.role_owner();
    case "admin":
      return m.role_admin();
    case "warehouse":
      return m.role_warehouse();
    case "sales":
      return m.role_sales();
    case "viewer":
      return m.role_viewer();
  }
}
