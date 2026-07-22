// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TenantSwitcher } from "./tenant-switcher";

const tenants = [
  { id: "t1", name: "PT Maju Jaya" },
  { id: "t2", name: "CV Sinar Baru" },
];

test("shows the active tenant name on the trigger", () => {
  render(
    <TenantSwitcher
      tenants={tenants}
      activeTenantId="t2"
      onSwitch={() => {}}
    />,
  );

  expect(screen.getByRole("button").textContent).toContain("CV Sinar Baru");
});

test("switching to another tenant calls onSwitch with its id", async () => {
  const user = userEvent.setup();
  const onSwitch = vi.fn();
  render(
    <TenantSwitcher
      tenants={tenants}
      activeTenantId="t1"
      onSwitch={onSwitch}
    />,
  );

  await user.click(screen.getByRole("button"));
  await user.click(await screen.findByText("CV Sinar Baru"));

  expect(onSwitch).toHaveBeenCalledWith("t2");
});

test("re-selecting the active tenant does not switch", async () => {
  const user = userEvent.setup();
  const onSwitch = vi.fn();
  render(
    <TenantSwitcher
      tenants={tenants}
      activeTenantId="t1"
      onSwitch={onSwitch}
    />,
  );

  await user.click(screen.getByRole("button"));
  // The trigger label and the list both render the active name; scope to the
  // listbox option to avoid matching the trigger.
  const option = (await screen.findAllByText("PT Maju Jaya")).at(-1);
  await user.click(option as HTMLElement);

  expect(onSwitch).not.toHaveBeenCalled();
});

test("filters the list by the search query", async () => {
  const user = userEvent.setup();
  render(
    <TenantSwitcher
      tenants={tenants}
      activeTenantId="t1"
      onSwitch={() => {}}
    />,
  );

  await user.click(screen.getByRole("button"));
  await user.type(screen.getByRole("combobox"), "Sinar");

  expect(screen.getByText("CV Sinar Baru")).toBeTruthy();
  expect(screen.queryByRole("option", { name: /Maju Jaya/ })).toBeNull();
});
