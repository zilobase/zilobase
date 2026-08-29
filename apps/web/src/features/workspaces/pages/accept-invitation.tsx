import { Link, useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  MailCheckIcon,
  SendIcon,
} from "@/shared/components/icons"

import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/shared/ui/field"
import { Spinner } from "@/shared/ui/spinner"
import { useSession } from "@zilobase/features/auth"
import { useAcceptWorkspaceInvitation } from "@zilobase/features/workspaces"
import { getApiErrorMessage } from "@/features/desktop/network/api"
import { readSingleInvitationId } from "../lib/invitation-link"

export default function AcceptInvitationPage() {
  const navigate = useNavigate()
  const invitationId = readSingleInvitationId(window.location.search)
  const { data: session, isLoading: isLoadingSession } = useSession()
  const acceptInvitation = useAcceptWorkspaceInvitation()
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

  const createAccountSearch = invitationId
    ? {
        invitation: invitationId,
        returnTo: `${window.location.pathname}${window.location.search}`,
      }
    : {}

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
                  <Link to="/recents">Go to recents</Link>
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
                <Button asChild disabled={!invitationId} variant="outline">
                  <Link to="/signup" search={createAccountSearch}>
                    Create an account
                  </Link>
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
    return "You have joined the workspace."
  }

  if (isSignedIn) {
    return userEmail
      ? `Continue as ${userEmail}.`
      : "Continue with your current account."
  }

  return "Use the email address that received the invitation."
}
