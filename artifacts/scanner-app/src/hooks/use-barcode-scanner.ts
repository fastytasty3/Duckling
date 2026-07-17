import { useEffect, useRef, useCallback } from "react";

interface UseBarcodeScannerProps {
  onScan: (barcode: string) => void;
  minBarcodeLength?: number;
  debounceMs?: number;
  enabled?: boolean;
}

export function useBarcodeScanner({
  onScan,
  minBarcodeLength = 4,
  debounceMs = 500,
  enabled = true,
}: UseBarcodeScannerProps) {
  const buffer = useRef("");
  const lastScanTime = useRef(0);
  const lastBarcode = useRef("");
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in a normal input/textarea unless it's the main barcode input
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      
      // If it's an input, we might still want to capture if it's the specific barcode input
      // but usually the specific barcode input will trigger its own onScan via form submit.
      // Actually, standard warehouse scanners send a sequence of keys very fast and then ENTER.
      // If focus is on a random input, the scanner will type into it. 
      // We still want to intercept ENTER if it looks like a barcode scan.
      
      if (e.key === "Enter") {
        const barcode = buffer.current.trim();
        buffer.current = ""; // clear buffer
        
        if (barcode.length >= minBarcodeLength) {
          const now = Date.now();
          if (
            barcode === lastBarcode.current &&
            now - lastScanTime.current < debounceMs
          ) {
            // Debounced duplicate scan
            e.preventDefault();
            return;
          }

          lastBarcode.current = barcode;
          lastScanTime.current = now;
          onScanRef.current(barcode);
          
          if (isInput && (target as HTMLInputElement).name === "barcode") {
            // let the manual input handle it, or prevent default?
            // Actually, we'll prevent default to avoid form submission issues if we handle it here
            e.preventDefault();
          }
        }
        return;
      }

      // Only accumulate printable characters (length === 1)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer.current += e.key;
        // Optionally, prevent default if we're not in an input to avoid weird scroll jumps?
        // if (!isInput) e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, minBarcodeLength, debounceMs]);
}
