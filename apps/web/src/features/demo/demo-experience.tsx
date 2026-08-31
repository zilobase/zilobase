import { useEffect, useState } from "react"

import { Button } from "@/shared/ui/button"
import { queryClient } from "@/shared/lib/query-client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  DEMO_GUARD_EVENT,
  DEMO_SIGNUP_URL,
  isAllowedDemoParent,
  installDemoCache,
  isHostedDemoRuntime,
} from "./runtime"

installDemoCache(queryClient)

export function DemoExperience({ children }: React.PropsWithChildren) {
  const demoMode = isHostedDemoRuntime()
  const [guardOpen, setGuardOpen] = useState(false)

  useEffect(() => {
    if (!demoMode) return
    const openGuard = () => setGuardOpen(true)
    window.addEventListener(DEMO_GUARD_EVENT, openGuard)

    const referrer = document.referrer ? new URL(document.referrer) : null
    if (
      window.parent !== window &&
      referrer &&
      isAllowedDemoParent(referrer)
    ) {
      window.parent.postMessage({ type: "zilobase-demo-ready" }, referrer.origin)
    }

    return () => {
      window.removeEventListener(DEMO_GUARD_EVENT, openGuard)
    }
  }, [demoMode])

  if (!demoMode) return children

  return (
    <>
      {children}
      <Dialog onOpenChange={setGuardOpen} open={guardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workspace to do that</DialogTitle>
            <DialogDescription>
              This is a temporary, read-safe demo. Page and database edits stay in this browser and are not transferred when you sign up.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setGuardOpen(false)} variant="outline">
              Keep exploring
            </Button>
            <Button asChild>
              <a href={DEMO_SIGNUP_URL} rel="noreferrer" target="_blank">
                Create free workspace
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
