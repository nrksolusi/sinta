// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import type { DashboardDoc } from "./documents";
import { DraftList } from "./draft-list";
import { RecentDocs } from "./recent-docs";

overwriteGetLocale(() => "en");

// Minimal router so `<Link>` has a context. The children render at "/".
function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test-only router shim
  return render(<RouterProvider router={router as any} />);
}

const draft: DashboardDoc = {
  id: "gr1",
  kind: "goodsReceipt",
  to: "/purchases/receipts/gr1",
  number: null,
  typeLabel: "Goods receipt",
  counterparty: "CV Sinar Baru",
  lineCount: 2,
  date: "2026-07-21",
  status: "draft",
};

test("DraftList renders a resume link to the draft detail", async () => {
  renderWithRouter(<DraftList drafts={[draft]} />);

  const link = await screen.findByRole("link", { name: "Continue" });
  expect(link.getAttribute("href")).toBe("/purchases/receipts/gr1");
  expect(screen.getByText(/CV Sinar Baru/)).toBeTruthy();
  expect(screen.getByText(/2 lines/)).toBeTruthy();
});

test("DraftList shows an empty state when there are no drafts", async () => {
  renderWithRouter(<DraftList drafts={[]} />);
  expect(await screen.findByTestId("empty-state")).toBeTruthy();
});

test("RecentDocs links each row to its detail and shows a status badge", async () => {
  const posted: DashboardDoc = {
    ...draft,
    id: "gr2",
    to: "/purchases/receipts/gr2",
    number: "GR-2026-0015",
    status: "posted",
  };
  renderWithRouter(<RecentDocs docs={[posted]} />);

  const link = await screen.findByRole("link", { name: "GR-2026-0015" });
  expect(link.getAttribute("href")).toBe("/purchases/receipts/gr2");
  expect(screen.getByText("Posted")).toBeTruthy();
});

test("RecentDocs shows an empty state when there are no documents", async () => {
  renderWithRouter(<RecentDocs docs={[]} />);
  expect(await screen.findByTestId("empty-state")).toBeTruthy();
});
