import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { useMailRealtime } from "@/features/mail/realtime/mail-realtime";
import { MailComposer } from "@/features/mail/compose/mail-composer";
import { MailComposer as Baseline } from "virtual:mail-baseline";
import "@/shared/styles/global.css";
import "@/app/styles.css";

function PollingFixture() {
  const [count, setCount] = useState(0);
  const synchronize = useCallback(async () => {
    setCount((count) => count + 1);
    return {};
  }, []);
  useMailRealtime({
    bindingId: "poll-binding",
    connectionId: "poll-account",
    workspaceId: "workspace",
    enabled: true,
    pushAvailable: false,
    onSynchronize: synchronize,
  });
  return <p>Syncs: {count}</p>;
}
function Fixture() {
  const [open, setOpen] = useState(true);
  const query = new URLSearchParams(location.search);
  const Composer = query.has("baseline") ? Baseline : MailComposer;
  const seed = query.has("resume")
    ? {
        draftId: "existing",
        to: [{ address: "recipient@example.test", name: null }],
        subject: "Saved subject",
        bodyText: "Saved body",
      }
    : {};
  return (
    <>
      <Toaster />
      {open ? (
        <Composer
          online={!query.has("offline")}
          seed={seed}
          workspaceId="workspace"
          onClose={() => setOpen(false)}
          onSent={() => {}}
        />
      ) : (
        <p>Composer closed</p>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("poll") ? <PollingFixture /> : <Fixture />,
);
