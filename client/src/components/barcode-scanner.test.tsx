// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { BarcodeScanner } from "./barcode-scanner";

// Under jsdom navigator.mediaDevices.getUserMedia is absent, so the component
// takes the "unsupported" branch and must still let the user enter a barcode by
// hand. This is the fallback path the warehouse relies on when the camera is
// unavailable or denied.
test("degrades to manual entry when the camera is unavailable", async () => {
  const user = userEvent.setup();
  const onScan = vi.fn();
  render(<BarcodeScanner onScan={onScan} />);

  expect(
    screen.getByText(/camera is not available|not available/i),
  ).toBeTruthy();

  const input = screen.getByLabelText(/enter barcode|barcode/i);
  await user.type(input, "8991234567890");
  await user.click(screen.getByRole("button", { name: /find/i }));

  expect(onScan).toHaveBeenCalledWith("8991234567890");
});

test("submits a manual barcode on Enter", async () => {
  const user = userEvent.setup();
  const onScan = vi.fn();
  render(<BarcodeScanner onScan={onScan} />);

  const input = screen.getByLabelText(/enter barcode|barcode/i);
  await user.type(input, "12345{Enter}");

  expect(onScan).toHaveBeenCalledWith("12345");
});
