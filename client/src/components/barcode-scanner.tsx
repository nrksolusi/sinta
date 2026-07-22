import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type BarcodeReader, createBarcodeReader } from "@/lib/barcode";
import { m } from "@/paraglide/messages";

type ScanState = "idle" | "starting" | "scanning" | "denied" | "unsupported";

// Camera barcode scanner for the warehouse screens. Opens the rear camera,
// polls frames through the BarcodeReader seam (native BarcodeDetector, else
// the @zxing/browser fallback), and calls onScan with the first decoded value.
// A manual text entry is always available so a broken or missing camera never
// blocks receiving/delivery/opname (D12: online-only, mobile-first).
export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("idle");
  const [manual, setManual] = useState("");

  useEffect(() => {
    // getUserMedia is absent under jsdom and on insecure origins; degrade to
    // manual entry rather than throwing.
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }

    let stream: MediaStream | null = null;
    let reader: BarcodeReader | null = null;
    let cancelled = false;
    let frame = 0;

    const start = async () => {
      setState("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        reader = await createBarcodeReader();
        if (cancelled) return;
        setState("scanning");

        const tick = async () => {
          if (cancelled || !reader || !videoRef.current) return;
          const value = await reader.scan(videoRef.current);
          if (cancelled) return;
          if (value) {
            onScan(value);
            return;
          }
          frame = requestAnimationFrame(() => {
            void tick();
          });
        };
        void tick();
      } catch {
        if (!cancelled) setState("denied");
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      reader?.stop();
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [onScan]);

  const submitManual = () => {
    const value = manual.trim();
    if (value) onScan(value);
  };

  return (
    <div className="space-y-3">
      {(state === "starting" || state === "scanning") && (
        // biome-ignore lint/a11y/useMediaCaption: live camera preview has no caption track
        <video
          ref={videoRef}
          className="aspect-square w-full rounded-lg bg-black object-cover"
          playsInline
          muted
          aria-label={m.scan_camera_label()}
        />
      )}

      {state === "scanning" && (
        <p className="text-center text-sm text-muted-foreground">
          {m.scan_hint()}
        </p>
      )}
      {state === "starting" && (
        <p className="text-center text-sm text-muted-foreground">
          {m.scan_starting()}
        </p>
      )}
      {state === "denied" && (
        <p className="text-sm text-red-600" role="alert">
          {m.scan_denied()}
        </p>
      )}
      {state === "unsupported" && (
        <p className="text-sm text-muted-foreground">{m.scan_unsupported()}</p>
      )}

      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{m.scan_manual_label()}</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            inputMode="numeric"
            autoComplete="off"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitManual();
              }
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={submitManual}
            disabled={!manual.trim()}
          >
            {m.scan_manual_submit()}
          </Button>
          {onClose && (
            <Button type="button" variant="outline" onClick={onClose}>
              {m.scan_close()}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
