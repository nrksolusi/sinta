// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { PickerDialog } from "./picker-dialog";

overwriteGetLocale(() => "en");

test("shows label when no selection", () => {
  render(
    <PickerDialog label="Select product">
      <div>content</div>
    </PickerDialog>,
  );
  expect(screen.getByRole("button", { name: "Select product" })).toBeTruthy();
});

test("shows selectedLabel when provided", () => {
  render(
    <PickerDialog label="Select product" selectedLabel="Beras 5kg">
      <div>content</div>
    </PickerDialog>,
  );
  expect(screen.getByRole("button", { name: "Beras 5kg" })).toBeTruthy();
});

test("clicking trigger makes children visible", async () => {
  const user = userEvent.setup();
  render(
    <PickerDialog label="Select product">
      <div>picker-content</div>
    </PickerDialog>,
  );
  await user.click(screen.getByRole("button", { name: "Select product" }));
  expect(await screen.findByText("picker-content")).toBeTruthy();
});

test("trigger is disabled when disabled prop is true", () => {
  render(
    <PickerDialog label="Select product" disabled>
      <div>content</div>
    </PickerDialog>,
  );
  expect(screen.getByRole("button", { name: "Select product" })).toHaveProperty(
    "disabled",
    true,
  );
});
