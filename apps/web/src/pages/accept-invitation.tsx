import { Link, useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  MailCheckIcon,
  SendIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useSession } from "@/features/auth/hooks"
import { useAcceptOrganizationInvitation } from "@/features/organizations/hooks"
import { getApiErrorMessage } from "@/lib/api"

export default function AcceptInvitationPage() {
  const navigate = useNavigate()
  const invitationId = new URLSearchParams(window.location.search).get("id")
  const { data: session, isLoading: isLoadingSession } = useSession()
  const acceptInvitation = useAcceptOrganizationInvitation()
  const isSignedIn = Boolean(session?.user)
  const hasAccepted = acceptInvitation.isSuccess

  const accept = () => {
    if (!invitationId) {
      return
    }

    acceptInvitation.mutate(invitationId)
  }

  const signIn = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    void navigate({
      to: "/login",
      search: { returnTo },
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
            {hasAccepted ? (
              <CheckCircle2Icon className="size-5" />
            ) : acceptInvitation.isError || !invitationId ? (
              <AlertCircleIcon className="size-5" />
            ) : (
              <MailCheckIcon className="size-5" />
            )}
          </div>
          <CardTitle>{getTitle(hasAccepted, isSignedIn)}</CardTitle>
          <CardDescription>
            {getDescription({
              hasAccepted,
              hasInvitationId: Boolean(invitationId),
              isSignedIn,
              userEmail: session?.user?.email,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {!invitationId ? (
              <Field>
                <FieldError>Invitation link is missing an id.</FieldError>
              </Field>
            ) : null}

            {acceptInvitation.isError ? (
              <Field>
                <FieldError>{getApiErrorMessage(acceptInvitation.error)}</FieldError>
              </Field>
            ) : null}

            {hasAccepted ? (
              <Field>
                <Button asChild>
                  <Link to="/dashboard">Go to dashboard</Link>
                </Button>
              </Field>
            ) : isLoadingSession ? (
              <Field className="items-center">
                <Spinner />
              </Field>
            ) : isSignedIn ? (
              <Field>
                <Button
                  disabled={!invitationId || acceptInvitation.isPending}
                  onClick={accept}
                  type="button"
                >
                  {acceptInvitation.isPending ? <Spinner /> : <SendIcon />}
                  Accept invitation
                </Button>
                <FieldDescription className="text-center">
                  You must be signed in with the invited email address.
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <Button disabled={!invitationId} onClick={signIn} type="button">
                  Sign in to accept
                </Button>
                <FieldDescription className="text-center">
                  We will bring you back to this invitation after sign in.
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
    </main>
  )
}

function getTitle(hasAccepted: boolean, isSignedIn: boolean) {
  if (hasAccepted) {
    return "Invitation accepted"
  }

  return isSignedIn ? "Accept invitation" : "Sign in to accept"
}

function getDescription({
  hasAccepted,
  hasInvitationId,
  isSignedIn,
  userEmail,
}: {
  hasAccepted: boolean
  hasInvitationId: boolean
  isSignedIn: boolean
  userEmail?: string
}) {
  if (!hasInvitationId) {
    return "This invitation link is incomplete."
  }

  if (hasAccepted) {
    return "You have joined the organization."
  }

  if (isSignedIn) {
    return userEmail
      ? `Continue as ${userEmail}.`
      : "Continue with your current account."
  }

  return "Use the email address that received the invitation."
}
