import { useEffect } from "react";

import { recordDesktopDiagnostic } from "@/features/desktop/diagnostics/index";
import { Spinner } from "@/shared/ui/spinner";

export function PendingPage() {
  useEffect(() => {
    recordDesktopDiagnostic("router.pending", { status: "started" });
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <p className="text-sm text-content-secondary">Connecting to Zilobase...</p>
      </div>
    </main>
  );
}
