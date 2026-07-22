// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SelectField } from "./select-field";

const options = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
];

const single = [{ value: "only", label: "Only Warehouse" }];

// The rendered trigger, whose text is the label Base UI resolves from `items`.
function triggerText(): string {
  return screen.getByRole("combobox").textContent ?? "";
}

// Base UI's Select resolves the trigger label from the `items` map, not from
// the selected <SelectItem>'s DOM text. SelectField wires `items` for every
// caller so the trigger shows the label, never the raw value.
test("shows the selected option's label, not its raw value", () => {
  render(
    <SelectField
      options={options}
      value="2"
      onValueChange={() => {}}
      aria-labelledby="month"
    />,
  );

  expect(triggerText()).toContain("February");
});

test("updates the displayed label when the value changes", () => {
  const { rerender } = render(
    <SelectField
      options={options}
      value="1"
      onValueChange={() => {}}
      aria-labelledby="month"
    />,
  );
  expect(triggerText()).toContain("January");

  rerender(
    <SelectField
      options={options}
      value="2"
      onValueChange={() => {}}
      aria-labelledby="month"
    />,
  );
  expect(triggerText()).toContain("February");
});

test("autoSelectSingle preselects the sole option when nothing is chosen", () => {
  const onValueChange = vi.fn();
  render(
    <SelectField
      options={single}
      value={undefined}
      onValueChange={onValueChange}
      autoSelectSingle
      aria-labelledby="wh"
    />,
  );

  expect(onValueChange).toHaveBeenCalledWith("only");
});

test("autoSelectSingle does not preselect when there are multiple options", () => {
  const onValueChange = vi.fn();
  render(
    <SelectField
      options={options}
      value={undefined}
      onValueChange={onValueChange}
      autoSelectSingle
      aria-labelledby="month"
    />,
  );

  expect(onValueChange).not.toHaveBeenCalled();
});

test("autoSelectSingle does not override an existing selection", () => {
  const onValueChange = vi.fn();
  render(
    <SelectField
      options={single}
      value="only"
      onValueChange={onValueChange}
      autoSelectSingle
      aria-labelledby="wh"
    />,
  );

  expect(onValueChange).not.toHaveBeenCalled();
});

test("does not preselect the sole option without autoSelectSingle", () => {
  const onValueChange = vi.fn();
  render(
    <SelectField
      options={single}
      value={undefined}
      onValueChange={onValueChange}
      aria-labelledby="wh"
    />,
  );

  expect(onValueChange).not.toHaveBeenCalled();
});
