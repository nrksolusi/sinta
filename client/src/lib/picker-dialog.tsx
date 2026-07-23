import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export interface PickerDialogProps {
  label: string;
  selectedLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function PickerDialog({
  label,
  selectedLabel,
  disabled,
  children,
}: PickerDialogProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const triggerLabel = selectedLabel ?? label;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="outline" type="button" disabled={disabled} />
          }
        >
          {triggerLabel}
        </SheetTrigger>
        <SheetContent side="bottom">{children}</SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" type="button" disabled={disabled} />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}
