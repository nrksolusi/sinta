import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { m } from "@/paraglide/messages";
import { TransferForm, type TransferFormValue } from "./-transfer-form";
import { toTransferInput } from "./-transfers-data";

export const Route = createFileRoute("/_authed/stock/transfers/new")({
  component: NewTransferPage,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// An unsaved draft (UX-D2): the entry form is the document. "Simpan draf"
// creates it server-side and navigates to /$id; "Posting" saves then posts,
// landing on the posted detail.
function NewTransferPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState<TransferFormValue>({
    fromWarehouseId: "",
    toWarehouseId: "",
    docDate: today(),
    notes: "",
    lines: [],
  });
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  async function createDraft() {
    const { data } = await api.POST("/stock-transfers", {
      body: toTransferInput(value),
    });
    if (!data) {
      toast.error(m.doc_create_failed());
      return null;
    }
    await queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    return data;
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const draft = await createDraft();
      if (!draft) return;
      toast.success(m.transfer_saved());
      await navigate({
        to: "/stock/transfers/$id",
        params: { id: draft.id },
      });
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    setPosting(true);
    try {
      const draft = await createDraft();
      if (!draft) return;
      const { data: posted } = await api.POST("/stock-transfers/{id}/post", {
        params: { path: { id: draft.id } },
      });
      if (!posted) {
        // The draft was created; send the user to it to retry posting.
        toast.error(m.doc_post_failed());
        await navigate({
          to: "/stock/transfers/$id",
          params: { id: draft.id },
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      toast.success(m.doc_posted({ number: posted.docNumber ?? "" }));
      await navigate({
        to: "/stock/transfers/$id",
        params: { id: posted.id },
      });
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/stock/transfers">
              {m.transfer_detail_breadcrumb_transfers()}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{m.transfer_new_title()}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-lg font-semibold tracking-tight">
        {m.transfer_new_title()}
      </h1>

      <TransferForm
        value={value}
        onChange={setValue}
        onSaveDraft={saveDraft}
        onPost={post}
        saving={saving}
        posting={posting}
      />
    </div>
  );
}
