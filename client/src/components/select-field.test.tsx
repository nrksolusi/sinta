// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SelectField } from "./select-field";

const options = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
];

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
