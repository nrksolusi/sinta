// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { ConfirmDialog } from "./confirm-dialog";

overwriteGetLocale(() => "en");

test("renders title, specifics, and confirm label when open", () => {
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Post receipt"
      specifics="12 lines, total 340 qty, to Gudang Utama"
      confirmLabel="Post"
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Post receipt")).toBeTruthy();
  expect(
    screen.getByText("12 lines, total 340 qty, to Gudang Utama"),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Post" })).toBeTruthy();
});

test("clicking confirm invokes onConfirm", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Post receipt"
      specifics="details"
      confirmLabel="Post"
      onConfirm={onConfirm}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Post" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("pending disables the confirm button and blocks dismissal", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Post receipt"
      specifics="details"
      confirmLabel="Post"
      onConfirm={onConfirm}
      pending
    />,
  );

  const confirm = screen.getByRole("button", { name: "Working..." });
  expect(confirm).toHaveProperty("disabled", true);

  // Escape must not close the dialog while pending.
  await user.keyboard("{Escape}");
  expect(onOpenChange).not.toHaveBeenCalledWith(false, expect.anything());
});

test("destructive confirm uses the destructive button variant", () => {
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Cancel document"
      specifics="stock will be returned"
      confirmLabel="Cancel document"
      onConfirm={() => {}}
      destructive
    />,
  );
  const confirm = screen.getByRole("button", { name: "Cancel document" });
  expect(confirm.className).toContain("text-destructive");
});
