import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  // Required: the restated qty/doc/warehouse line. A bare "Are you sure?" is a
  // review failure (design brief section D / UX-D2/D7/D10).
  specifics: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  // delete-draft, reverse, remove member, revoke, archive.
  destructive?: boolean;
  // While pending the confirm button is busy and the dialog cannot be
  // dismissed (Esc / outside press are swallowed).
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  specifics,
  confirmLabel,
  onConfirm,
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      // Non-dismissable while pending: ignore close requests, keep open ones.
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
      disablePointerDismissal={pending}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{specifics}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            {m.confirm_cancel()}
          </DialogClose>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? m.confirm_pending() : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
