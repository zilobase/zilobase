import { useEffect, useMemo } from "react";

import { FieldDescription } from "@/shared/ui/field";
import { ZilobaseLogo } from "@/shared/components/zilobase-logo";

const OAUTH_CALLBACK_MESSAGE = "zilobase-oauth-callback";

export default function OAuthCallbackPage() {
  const result = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      code: params.get("code"),
      error: params.get("error"),
      errorDescription: params.get("error_description"),
      state: params.get("state"),
    };
  }, []);

  useEffect(() => {
    const payload = {
      type: OAUTH_CALLBACK_MESSAGE,
      ...result,
    };

    window.opener?.postMessage(payload, window.location.origin);

    const chromeRuntime = (
      globalThis as { chrome?: { runtime?: { sendMessage?: (message: unknown) => void } } }
    ).chrome?.runtime;
    try {
      chromeRuntime?.sendMessage?.(payload);
    } catch {
      // The page also works when opened outside the extension.
    }
  }, [result]);

  const failed = Boolean(result.error) || !result.code;

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="w-full max-w-sm rounded-xl bg-surface-overlay p-5">
        <div className="mb-4 flex items-center gap-2">
          <ZilobaseLogo className="h-6 w-auto" />
          <span className="text-sm font-medium">Zilobase</span>
        </div>
        <h1 className="text-sm font-medium">
          {failed ? "Could not connect" : "Connected to Zilobase"}
        </h1>
        <FieldDescription className="mt-1">
          {failed
            ? result.errorDescription ||
              "The authorization request was denied or expired. You can close this tab."
            : "You can close this tab and return to the clipper."}
        </FieldDescription>
      </div>
    </main>
  );
}
