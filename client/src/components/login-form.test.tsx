// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { expect, test } from "vitest";
import { LoginForm } from "./login-form";

// Reproduces the reported freeze: typing into the login inputs must update
// the field promptly, under StrictMode like the real app.
test("typing into email and password updates the fields", async () => {
  const user = userEvent.setup();
  render(
    <StrictMode>
      <LoginForm onSuccess={() => {}} />
    </StrictMode>,
  );

  const email = screen.getByLabelText(/email/i) as HTMLInputElement;
  const password = screen.getByLabelText(
    /password|kata sandi/i,
  ) as HTMLInputElement;

  await user.type(email, "budi@toko-makmur.co.id");
  await user.type(password, "kata-sandi-panjang");

  expect(email.value).toBe("budi@toko-makmur.co.id");
  expect(password.value).toBe("kata-sandi-panjang");
}, 10_000);
