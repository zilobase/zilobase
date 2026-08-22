import { Link, useNavigate } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileCheck2Icon,
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
import { getApiErrorMessage } from "@/lib/api"
import { readSingleInvitationId } from "@/lib/invitation-link"
import { useSession } from "@zilobase/features/auth"
import {
  useAcceptPageGuestInvitation,
  usePageGuestInvitation,
} from "@zilobase/features/pages"

export default function AcceptPageInvitationPage() {
  const navigate = useNavigate()
  const invitationId = readSingleInvitationId(window.location.search)
  const { data: session, isLoading: isLoadingSession } = useSession()
  const invitationQuery = usePageGuestInvitation(invitationId)
  const acceptInvitation = useAcceptPageGuestInvitation()
  const isSignedIn = Boolean(session?.user)
  const invitation = invitationQuery.data
  const acceptedPageId = acceptInvitation.data?.pageId ?? invitation?.pageId
  const hasAccepted = acceptInvitation.isSuccess
  const isUnavailable = Boolean(
    invitation && invitation.status !== "pending" && !hasAccepted,
  )
  const returnTo = `${window.location.pathname}${window.location.search}`

  const signIn = () => {
    void navigate({ to: "/login", search: { returnTo } })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
            {hasAccepted ? (
              <CheckCircle2Icon className="size-5" />
            ) : !invitationId || invitationQuery.isError || isUnavailable ? (
              <AlertCircleIcon className="size-5" />
            ) : (
              <FileCheck2Icon className="size-5" />
            )}
          </div>
          <CardTitle>
            {hasAccepted
              ? "Page invitation accepted"
              : isSignedIn
                ? "Accept page invitation"
                : "Sign in to open this page"}
          </CardTitle>
          <CardDescription>
            {invitation
              ? `${invitation.workspaceName} invited ${invitation.email} to “${invitation.pageName}” with ${invitation.accessLevel} access.`
              : "Use the email address that received this page invitation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {!invitationId ? (
              <Field>
                <FieldError>Invitation link is missing an id.</FieldError>
              </Field>
            ) : null}

            {invitationQuery.isLoading ? (
              <Field className="items-center">
                <Spinner />
              </Field>
            ) : null}

            {invitationQuery.isError ? (
              <Field>
                <FieldError>{getApiErrorMessage(invitationQuery.error)}</FieldError>
              </Field>
            ) : null}

            {isUnavailable ? (
              <Field>
                <FieldError>
                  This invitation is {invitation?.status ?? "unavailable"}.
                </FieldError>
              </Field>
            ) : null}

            {acceptInvitation.isError ? (
              <Field>
                <FieldError>{getApiErrorMessage(acceptInvitation.error)}</FieldError>
              </Field>
            ) : null}

            {hasAccepted && acceptedPageId ? (
              <Field>
                <Button asChild>
                  <Link params={{ pageId: acceptedPageId }} to="/p/$pageId">
                    Open page
                  </Link>
                </Button>
              </Field>
            ) : isLoadingSession ? (
              <Field className="items-center">
                <Spinner />
              </Field>
            ) : isSignedIn ? (
              <Field>
                <Button
                  disabled={
                    !invitationId ||
                    !invitation ||
                    isUnavailable ||
                    acceptInvitation.isPending
                  }
                  onClick={() =>
                    invitationId && acceptInvitation.mutate(invitationId)
                  }
                  type="button"
                >
                  {acceptInvitation.isPending ? <Spinner /> : <SendIcon />}
                  Accept page invitation
                </Button>
                <FieldDescription className="text-center">
                  Continue as {session?.user?.email}.
                </FieldDescription>
              </Field>
            ) : (
              <Field>
                <Button disabled={!invitationId} onClick={signIn} type="button">
                  Sign in to accept
                </Button>
                <Button asChild disabled={!invitationId} variant="outline">
                  <Link
                    search={
                      invitationId
                        ? { invitation: invitationId, returnTo }
                        : {}
                    }
                    to="/signup"
                  >
                    Create an account
                  </Link>
                </Button>
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
    </main>
  )
}
