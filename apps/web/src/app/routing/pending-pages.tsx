import { useEffect } from "react";

import { recordDesktopDiagnostic } from "@/lib/desktop-diagnostics";
import { Spinner } from "@/shared/ui/spinner";

export function AppContentPendingPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <Spinner className="size-5" />
    </main>
  );
}

export function RoutePendingPage() {
  useEffect(() => {
    recordDesktopDiagnostic("router.pending", { status: "started" });
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <p className="text-sm text-muted-foreground">Connecting to Zilobase...</p>
      </div>
    </main>
  );
}
