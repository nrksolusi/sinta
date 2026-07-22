import { BarcodeScanner } from "@/components/barcode-scanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";

export interface ScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // A decoded barcode. Feeds the SAME input path as typed search: the caller
  // resolves it to a product and runs the append flow, then closes the dialog.
  onScan: (barcode: string) => void;
}

// Hosts the camera BarcodeScanner in a ui/dialog. A scan result is handed back
// through onScan so the line grid resolves it exactly like a typed search.
export function ScannerDialog({
  open,
  onOpenChange,
  onScan,
}: ScannerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.combobox_scan_title()}</DialogTitle>
          <DialogDescription>{m.combobox_scan_description()}</DialogDescription>
        </DialogHeader>
        <BarcodeScanner
          onScan={(barcode) => {
            onScan(barcode);
            onOpenChange(false);
          }}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
