// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { StatusBadge } from "./status-badge";

// baseLocale is Indonesian; pin English is not needed here because the status
// labels are always the Indonesian domain terms (Draf/Diposting/...) per the
// brief - but the label comes from Paraglide, so pin the base (id) locale for
// determinism against the spec's id labels.
overwriteGetLocale(() => "id");

test("renders the id label for each status", () => {
  const { rerender } = render(<StatusBadge status="draft" />);
  expect(screen.getByText("Draf")).toBeTruthy();

  rerender(<StatusBadge status="posted" />);
  expect(screen.getByText("Diposting")).toBeTruthy();

  rerender(<StatusBadge status="reversed" />);
  expect(screen.getByText("Dibatalkan")).toBeTruthy();

  rerender(<StatusBadge status="pending" />);
  expect(screen.getByText("Menunggu Persetujuan")).toBeTruthy();
});

test("posted uses the success palette", () => {
  render(<StatusBadge status="posted" />);
  const badge = screen.getByText("Diposting");
  expect(badge.className).toContain("text-success");
  expect(badge.className).toContain("bg-success/12");
});

test("reversed carries the strikethrough accent", () => {
  render(<StatusBadge status="reversed" />);
  const badge = screen.getByText("Dibatalkan");
  expect(badge.className).toContain("line-through");
  expect(badge.className).toContain("bg-muted");
});

test("pending uses the warning palette", () => {
  render(<StatusBadge status="pending" />);
  const badge = screen.getByText("Menunggu Persetujuan");
  expect(badge.className).toContain("bg-warning/15");
  expect(badge.className).toContain("text-warning-foreground");
});

test("draft uses the neutral muted palette", () => {
  render(<StatusBadge status="draft" />);
  const badge = screen.getByText("Draf");
  expect(badge.className).toContain("bg-muted");
  expect(badge.className).toContain("text-muted-foreground");
});
