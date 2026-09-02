import { useNavigate } from "@tanstack/react-router";
import {
  useInProductNotifications,
  useMarkInProductNotificationRead,
} from "@zilobase/features/notifications";
import { Bell, Check, Loader2 } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";

export function NotificationCenter({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const query = useInProductNotifications(workspaceId);
  const markRead = useMarkInProductNotificationRead(workspaceId);
  const unread = query.data?.unreadCount ?? 0;
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <Button aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative" size="icon" variant="ghost">
          <Bell />
          {unread ? <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-action-primary px-1 text-center text-[10px] leading-4 text-action-on-primary">{Math.min(unread, 99)}</span> : null}
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-96 max-w-[calc(100vw-1rem)] p-0">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <Bell className="size-4" />
          <h2 className="flex-1 text-sm font-semibold">Notifications</h2>
          {unread ? <Button disabled={markRead.isPending} onClick={() => markRead.mutate("all")} size="sm" variant="ghost"><Check />Mark all read</Button> : null}
        </div>
        <div className="max-h-[min(560px,calc(100dvh-6rem))] overflow-y-auto p-2">
          {query.isLoading ? <div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin" /></div> : null}
          {!query.isLoading && !query.data?.notifications.length ? <p className="p-8 text-center text-sm text-content-secondary">No notifications yet.</p> : null}
          {query.data?.notifications.map((notification) => (
            <button
              className="mb-1 flex w-full gap-3 rounded-lg px-3 py-2 text-left hover:bg-action-neutral-hover"
              key={notification.id}
              onClick={() => {
                if (!notification.readAt) markRead.mutate(notification.id);
                if (notification.pageId) void navigate({ params: { pageId: notification.pageId }, to: "/p/$pageId" });
              }}
              type="button"
            >
              <span aria-label={notification.readAt ? "Read" : "Unread"} className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-indicator-muted" : "bg-action-primary"}`} />
              <span className="min-w-0 flex-1">
                <span className="block whitespace-pre-wrap text-sm">{notification.message}</span>
                <span className="mt-1 block text-xs text-content-secondary">{new Date(notification.createdAt).toLocaleString()}</span>
              </span>
            </button>
          ))}
        </div>
      </DropDrawerContent>
    </DropDrawer>
  );
}
