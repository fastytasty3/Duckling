import { createContext, useContext, useState, useCallback, ReactNode, useRef } from "react";

type FlashType = "success" | "warning" | "error" | null;

interface FlashContextType {
  flash: (type: FlashType) => void;
}

const FlashContext = createContext<FlashContextType | undefined>(undefined);

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flashType, setFlashType] = useState<FlashType>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flash = useCallback((type: FlashType) => {
    setFlashType(type);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setFlashType(null);
    }, 800);
  }, []);

  return (
    <FlashContext.Provider value={{ flash }}>
      {children}
      {flashType && (
        <div
          className={`pointer-events-none fixed inset-0 z-[9999] animate-in fade-in duration-100 ${
            flashType === "success"
              ? "bg-success/30"
              : flashType === "warning"
              ? "bg-warning/30"
              : "bg-destructive/30"
          }`}
          style={{ opacity: 0.8 }}
        />
      )}
    </FlashContext.Provider>
  );
}

export function useFlash() {
  const ctx = useContext(FlashContext);
  if (!ctx) throw new Error("useFlash must be used within FlashProvider");
  return ctx;
}
