import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { SessionModal } from "./session-modal";
import { useGetSettings } from "@workspace/api-client-react";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useFlash } from "./flash-provider";
import { useProcessBarcodeScan } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  getGetActiveOperationQueryKey, 
  getListOperationsQueryKey,
  useGetSession
} from "@workspace/api-client-react";

export function Layout({ children }: { children: ReactNode }) {
  const { data: settings } = useGetSettings();
  const { data: session } = useGetSession({ query: { queryKey: ["/api/session"] } });
  
  const { flash } = useFlash();
  const queryClient = useQueryClient();
  const processScan = useProcessBarcodeScan();

  const handleScan = (barcode: string) => {
    if (!session?.operatorId) return; // No session, ignore

    processScan.mutate(
      {
        data: {
          barcode,
          operatorId: session.operatorId,
          shiftId: session.shiftId || undefined,
          workplaceId: session.workplaceId || undefined,
        }
      },
      {
        onSuccess: (res) => {
          if (settings?.soundEnabled) {
            // Optional: play beep
          }
          
          if (res.status === "product_unknown") {
            flash("warning");
          } else {
            flash("success");
          }

          queryClient.invalidateQueries({ queryKey: getGetActiveOperationQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOperationsQueryKey() });
        },
        onError: () => {
          flash("error");
          if (settings?.soundEnabled) {
            // Optional: play error beep
          }
        }
      }
    );
  };

  useBarcodeScanner({
    onScan: handleScan,
    minBarcodeLength: settings?.minBarcodeLength || 4,
    debounceMs: settings?.duplicateScanDebounceMs || 500,
    enabled: !!session?.operatorId,
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-[100dvh] flex flex-col relative overflow-hidden">
        {children}
      </main>
      <SessionModal />
    </div>
  );
}
