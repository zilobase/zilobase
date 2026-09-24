import { orderCalendarSources, moveCalendarSource } from "@zilobase/features/calendar";
import { MoreHorizontalIcon, LogOutIcon } from "@/shared/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/ui/dropdown-menu";
import {
  SidebarNavItemAction,
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
} from "@/shared/ui/sidebar-nav-item-action";
import { useCalendarCatalog } from "./use-calendar-catalog";
import { calendarSelectionKey, resolveDefaultCalendar } from "./calendar-selection";
import { getApiErrorMessage } from "@/platform/network/api";
import { PlusIcon } from "@/shared/components/icons";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/shared/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import { CalendarMiniCalendar } from "./calendar-mini-calendar";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/shared/ui/alert-dialog";
import { CalendarList } from "./calendar-list";
import { CalendarConnectButton } from "./calendar-connect-button";
import { useCalendarAccounts } from "./use-calendar-accounts";
import { useCalendarPreferences } from "../preferences/use-calendar-preferences";

export function CalendarAccountsSidebar({ workspaceId }: { workspaceId: string }) {
  const { accounts, connect, disconnect } = useCalendarAccounts(workspaceId);
  const preferences = useCalendarPreferences(workspaceId);
  const orderedAccounts = orderCalendarSources(
    accounts.data?.connections ?? [],
    preferences.query.data?.accountOrder ?? [],
    (account) => account.accountId,
  );
  const catalog = useCalendarCatalog(orderedAccounts);
  const defaultAttempt = useRef("");
  const value = preferences.query.data;
  const resolved = value && resolveDefaultCalendar(catalog.calendars, value);
  const defaultKey = resolved ? calendarSelectionKey(resolved.bindingId, resolved.id) : null;
  useEffect(() => {
    if (
      !value ||
      !accounts.isSuccess ||
      !catalog.ready ||
      preferences.pending ||
      value.defaultCalendarKey === defaultKey
    )
      return;
    const attempt = JSON.stringify([workspaceId, value.defaultCalendarKey, defaultKey]);
    if (defaultAttempt.current === attempt) return;
    defaultAttempt.current = attempt;
    preferences.save.mutate({ ...value, defaultCalendarKey: defaultKey });
  }, [workspaceId, value, accounts.isSuccess, catalog.ready, defaultKey, preferences.pending]);
  const [adding, setAdding] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  return (
    <>
      <aside className="space-y-4 px-2 py-2" aria-label="Calendar accounts">
        {preferences.query.data && <CalendarMiniCalendar preferences={preferences.query.data} />}
        {orderedAccounts.map((account, index) => (
          <CalendarAccountSection
            key={account.bindingId}
            account={account}
            index={index}
            orderedAccounts={orderedAccounts}
            value={value}
            preferences={preferences}
            catalog={catalog}
            defaultKey={defaultKey}
            workspaceId={workspaceId}
            connect={connect}
            disconnect={disconnect}
            setDisconnectId={setDisconnectId}
          />
        ))}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setAdding(true)}>
              <PlusIcon />
              <span>Add calendar account</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </aside>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add calendar account</DialogTitle>
            <DialogDescription>
              Manage your personal and work calendars all in one place.
            </DialogDescription>
          </DialogHeader>
          <CalendarConnectButton accounts={accounts} connect={connect} />
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(disconnectId)}
        onOpenChange={(open) => {
          if (!open && !disconnect.isPending) setDisconnectId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect calendar account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes this account from this workspace. Events remain in Google Calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (disconnectId)
                  disconnect.mutate(disconnectId, { onSuccess: () => setDisconnectId(null) });
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function CalendarAccountSection({
  account,
  index,
  orderedAccounts,
  value,
  preferences,
  catalog,
  defaultKey,
  workspaceId,
  connect,
  disconnect,
  setDisconnectId,
}: {
  account: {
    bindingId: string;
    accountId: string;
    email: string;
    workspaceId: string;
    workspaceName?: string;
    status: string;
  };
  index: number;
  orderedAccounts: { accountId: string }[];
  value: ReturnType<typeof useCalendarPreferences>["query"]["data"];
  preferences: ReturnType<typeof useCalendarPreferences>;
  catalog: ReturnType<typeof useCalendarCatalog>;
  defaultKey: string | null;
  workspaceId: string;
  connect: ReturnType<typeof useCalendarAccounts>["connect"];
  disconnect: ReturnType<typeof useCalendarAccounts>["disconnect"];
  setDisconnectId: (id: string | null) => void;
}) {
  const collapsed = value?.collapsedAccountIds?.includes(account.accountId);
  return (
    <div className="space-y-1">
      <div className="group/nav-row relative">
        <SidebarMenuButton
          id={`calendar-account-${account.bindingId}`}
          disabled={!value || preferences.pending}
          aria-expanded={!collapsed}
          onClick={() => {
            if (value)
              preferences.save.mutate({
                ...value,
                collapsedAccountIds: collapsed
                  ? value.collapsedAccountIds?.filter((id) => id !== account.accountId)
                  : [...(value.collapsedAccountIds ?? []), account.accountId],
              });
          }}
          className={`${SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME} pr-8 text-content-secondary`}
        >
          <span className="truncate" title={account.workspaceName}>
            {account.email}
            {account.workspaceId !== workspaceId && account.workspaceName
              ? ` · ${account.workspaceName}`
              : ""}
          </span>
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarNavItemAction variant="menu" aria-label={`Options for ${account.email}`}>
              <MoreHorizontalIcon />
            </SidebarNavItemAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            {([-1, 1] as const).map((direction) => (
              <DropdownMenuItem
                key={direction}
                disabled={
                  !value ||
                  preferences.pending ||
                  index + direction < 0 ||
                  index + direction >= orderedAccounts.length
                }
                onSelect={() => {
                  if (value)
                    preferences.save.mutate({
                      ...value,
                      accountOrder: moveCalendarSource(
                        value.accountOrder ?? [],
                        orderedAccounts.map((item) => item.accountId),
                        account.accountId,
                        direction,
                      ),
                    });
                }}
              >
                {direction < 0 ? "Move up" : "Move down"}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              variant="destructive"
              disabled={disconnect.isPending}
              onSelect={() => setDisconnectId(account.bindingId)}
            >
              <LogOutIcon />
              Disconnect account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {account.status === "reconnect_required" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={connect.isPending}
          onClick={() => connect.mutate()}
        >
          Reconnect account
        </Button>
      )}
      <AccountCalendars
        collapsed={Boolean(collapsed)}
        query={catalog.queries[index]}
        value={value}
        catalog={catalog}
        account={account}
        defaultKey={defaultKey}
        preferences={preferences}
      />
    </div>
  );
}
function AccountCalendars({
  collapsed,
  query,
  value,
  catalog,
  account,
  defaultKey,
  preferences,
}: {
  collapsed: boolean;
  query?: { error?: unknown; isPending?: boolean };
  value: ReturnType<typeof useCalendarPreferences>["query"]["data"];
  catalog: ReturnType<typeof useCalendarCatalog>;
  account: { bindingId: string };
  defaultKey: string | null;
  preferences: ReturnType<typeof useCalendarPreferences>;
}) {
  if (collapsed) return null;
  if (query?.error)
    return (
      <p role="alert" className="px-2 text-xs text-content-secondary">
        {getApiErrorMessage(query.error)}
      </p>
    );
  if (query?.isPending)
    return <p className="px-2 text-xs text-content-secondary">Loading calendars…</p>;
  if (!value) return null;
  return (
    <CalendarList
      allCalendars={catalog.calendars}
      calendars={catalog.calendars.filter((calendar) => calendar.bindingId === account.bindingId)}
      preferences={{ ...value, defaultCalendarKey: defaultKey }}
      onPreferences={(data) => preferences.save.mutateAsync(data)}
      disabled={preferences.pending}
    />
  );
}
