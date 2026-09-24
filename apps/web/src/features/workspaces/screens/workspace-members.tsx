import { MemberList } from "../members/components/member-list";
import { InviteMemberSection, InvitationList } from "../members/components/member-invitations";
import { GuestList, GuestPolicySection } from "../guests/components/workspace-guests";
import { RegistrationSettingsSection } from "../settings/registration-settings";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { UsersIcon } from "@/shared/components/icons";

import { SettingsHeader } from "@/features/settings";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";

import { Separator } from "@/shared/ui/separator";

import { Tabs, TabsBadge, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";
import { useSession } from "@zilobase/features/auth/react";
import {
  useActiveWorkspaceId,
  useWorkspaceAccessTargets,
  useWorkspaceGuests,
  useWorkspaceGuestPolicy,
  useWorkspaceGuestRequests,
  useWorkspaceInvitations,
} from "@zilobase/features/workspaces/react";

import { normalizeWorkspaceRole } from "../members/model/member-access";
import {
  getTeamSettingsTabCounts,
  normalizeTeamSettingsTab,
} from "../members/model/member-settings-tabs";

export default function TeamSettingsPage() {
  const navigate = useNavigate();
  const tab = useSearch({
    strict: false,
    select: (search) => normalizeTeamSettingsTab(search.tab),
  });
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data: sessionData } = useSession();
  const { data: accessTargets, isLoading: isLoadingAccessTargets } =
    useWorkspaceAccessTargets(activeWorkspaceId);
  const { data: invitations, isLoading: isLoadingInvitations } =
    useWorkspaceInvitations(activeWorkspaceId);
  const currentMembership = accessTargets?.members.find(
    (member) => member.id === sessionData?.user?.id,
  );
  const currentRole = normalizeWorkspaceRole(currentMembership?.role);
  const canManageMembers = currentRole === "owner" || currentRole === "admin";
  const isWorkspaceOwner = currentRole === "owner";
  const { data: guests, isLoading: isLoadingGuests } = useWorkspaceGuests(activeWorkspaceId, {
    enabled: canManageMembers,
  });
  const { data: guestPolicy } = useWorkspaceGuestPolicy(activeWorkspaceId, {
    enabled: isWorkspaceOwner,
  });
  const { data: guestRequests, isLoading: isLoadingGuestRequests } = useWorkspaceGuestRequests(
    activeWorkspaceId,
    {
      enabled: isWorkspaceOwner,
    },
  );
  const isInstanceOwner = Boolean(
    sessionData?.workspacePinned &&
    accessTargets?.members.some(
      (member) => member.id === sessionData.user?.id && member.role === "owner",
    ),
  );
  const pendingInvitations = (invitations ?? []).filter(
    (invitation) => invitation.status === "pending",
  );
  const pendingGuestRequests = (guestRequests ?? []).filter(
    (request) => request.status === "pending",
  );
  const tabCounts = getTeamSettingsTabCounts({
    guests: guests?.length ?? 0,
    members: accessTargets?.members.length ?? 0,
    pendingGuestRequests: pendingGuestRequests.length,
    pendingInvitations: pendingInvitations.length,
  });

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader title="Team" description="Invite collaborators and manage team access." />

      <Tabs
        className="mx-auto w-full max-w-3xl"
        gap="spacious"
        onValueChange={(value) => {
          void navigate({
            replace: true,
            search: { tab: value === "guests" ? "guests" : "team" },
            to: "/settings/team",
          });
        }}
        value={tab}
      >
        <TabsList aria-label="Team settings sections" overflow="scroll" width="full">
          <TabsTrigger value="team" width="content">
            Team
            <TabsBadge>{tabCounts.team}</TabsBadge>
          </TabsTrigger>
          <TabsTrigger value="guests" width="content">
            Guests
            <TabsBadge>{tabCounts.guests}</TabsBadge>
          </TabsTrigger>
        </TabsList>

        <TabsContent className="grid gap-6 text-sm" value="team">
          {isInstanceOwner ? (
            <>
              <RegistrationSettingsSection />
              <Separator />
            </>
          ) : null}

          {canManageMembers ? <InviteMemberSection workspaceId={activeWorkspaceId} /> : null}

          {canManageMembers || isInstanceOwner ? <Separator /> : null}

          <section className="grid gap-3">
            <div className="space-y-1">
              <h3 className="font-heading text-base leading-snug font-medium">Members</h3>
              <p className="text-sm text-content-secondary">
                People with access to this workspace.
              </p>
            </div>
            <MemberList
              actorRole={currentRole}
              canManage={canManageMembers}
              currentUserId={sessionData?.user?.id ?? null}
              isLoading={isLoadingAccessTargets}
              members={accessTargets?.members ?? []}
              workspaceId={activeWorkspaceId}
            />
          </section>

          <Separator />

          <section className="grid gap-3">
            <div className="space-y-1">
              <h3 className="font-heading text-base leading-snug font-medium">
                Pending invitations
              </h3>
              <p className="text-sm text-content-secondary">Invitations waiting to be accepted.</p>
            </div>
            <InvitationList invitations={pendingInvitations} isLoading={isLoadingInvitations} />
          </section>
        </TabsContent>

        <TabsContent className="grid gap-6 text-sm" value="guests">
          {canManageMembers ? (
            <>
              {isWorkspaceOwner ? (
                <>
                  <GuestPolicySection
                    policy={guestPolicy?.mode ?? "direct"}
                    requests={pendingGuestRequests}
                    isLoadingRequests={isLoadingGuestRequests}
                    workspaceId={activeWorkspaceId}
                  />
                  <Separator />
                </>
              ) : null}
              <section className="grid gap-3">
                <div className="space-y-1">
                  <h3 className="font-heading text-base leading-snug font-medium">Page guests</h3>
                  <p className="text-sm text-content-secondary">
                    External people invited to individual pages. Guests do not receive workspace
                    membership.
                  </p>
                </div>
                <GuestList
                  guests={guests ?? []}
                  isLoading={isLoadingGuests}
                  canPromote={isWorkspaceOwner}
                  workspaceId={activeWorkspaceId}
                />
              </section>
              <Separator />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>Guest administration is restricted</EmptyTitle>
                <EmptyDescription>
                  Workspace owners and admins can review page guests. Ask an owner to change guest
                  access or invitation policy.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
