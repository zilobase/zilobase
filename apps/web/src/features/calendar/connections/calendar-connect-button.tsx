import { GoogleIcon } from "@/shared/components/google-icon";
import { Button } from "@/shared/ui/button";
import type { useCalendarAccounts } from "./use-calendar-accounts";

export function CalendarConnectButton({
  accounts,
  connect,
}: Pick<ReturnType<typeof useCalendarAccounts>, "accounts" | "connect">) {
  return (
    <>
      <Button
        disabled={connect.isPending || !accounts.data?.providerConfigured}
        onClick={() => connect.mutate()}
      >
        <GoogleIcon />
        {connect.isPending ? "Opening Google…" : "Connect Google Calendar"}
      </Button>
      {connect.isSuccess && (
        <div className="grid gap-2 text-xs text-content-secondary" role="status">
          <p>
            Finish connecting in your browser, then return here. If you closed the browser, you can
            start again.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void accounts.refetch();
              connect.reset();
            }}
          >
            Check connection
          </Button>
        </div>
      )}
      {connect.error && (
        <p role="alert" className="text-xs text-content-secondary">
          Connection could not start. Check your network and try again. Your organization may need
          to allow Google Calendar access.
        </p>
      )}
      {!accounts.data?.providerConfigured && (
        <p className="text-xs text-content-secondary">
          Google Calendar is not configured on this server.
        </p>
      )}
    </>
  );
}
