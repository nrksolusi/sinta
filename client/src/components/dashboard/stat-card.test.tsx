// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { StatCard } from "./stat-card";

overwriteGetLocale(() => "en");

test("renders label and value", () => {
  render(<StatCard label="Produk" value="42" />);
  expect(screen.getByText("Produk")).toBeTruthy();
  expect(screen.getByText("42")).toBeTruthy();
});

test("renders a link when href is provided", () => {
  render(<StatCard label="Produk" value="42" href="/catalog/products" />);
  const link = screen.getByRole("link");
  expect(link).toBeTruthy();
  expect((link as HTMLAnchorElement).href).toContain("/catalog/products");
});

test("does not render a link when href is absent", () => {
  render(<StatCard label="Produk" value="42" />);
  expect(screen.queryByRole("link")).toBeNull();
});
