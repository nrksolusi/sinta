// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Partner, PartnerOption } from "@/lib/pickers-data";
import { partnerToOption } from "@/lib/pickers-data";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { PartnerCombobox } from "./partner-combobox";

overwriteGetLocale(() => "en");

const partners: Partner[] = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "PT Maju Jaya",
    code: "SUP-1",
    isSupplier: true,
    isCustomer: false,
    status: "active",
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "CV Sinar Baru",
    code: "SUP-2",
    isSupplier: true,
    isCustomer: false,
    status: "active",
  },
];

const options: PartnerOption[] = partners.map(partnerToOption);

function search(query: string): Promise<PartnerOption[]> {
  const q = query.trim().toLowerCase();
  return Promise.resolve(
    q === ""
      ? options
      : options.filter((o) => o.label.toLowerCase().includes(q)),
  );
}

test("filters and selects a partner", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<PartnerCombobox onSelect={onSelect} onSearch={search} />);

  await user.click(screen.getByRole("button", { name: "Select partner" }));
  await user.type(await screen.findByRole("combobox"), "Maju");
  await user.click(await screen.findByText("PT Maju Jaya"));

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect.mock.calls[0][0].id).toBe(
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  );
});
