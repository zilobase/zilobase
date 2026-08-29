import { and, eq } from "drizzle-orm";

import { db, type Database } from "../../infrastructure/database";
import { member } from "../../infrastructure/database/schema";
import type {
  MembershipGrantSource,
  ZilobaseEditionExtension,
} from "../../shared/types";
import { ensureDefaultTeamspaceMembership } from "../teamspaces";

export type GrantMembershipInput = {
  id?: string;
  role: string;
  source: MembershipGrantSource;
  userId: string;
  workspaceId: string;
};

export type GrantMembershipResult = {
  created: boolean;
  membership: typeof member.$inferSelect;
};

export class MembershipService {
  constructor(
    private readonly database: Database = db,
    private readonly editionExtension?: ZilobaseEditionExtension,
  ) {}

  async grantMembership(
    input: GrantMembershipInput,
  ): Promise<GrantMembershipResult> {
    return this.database.transaction(async (transaction) => {
      const transactionalDatabase = transaction as Database;
      const [existing] = await transactionalDatabase
        .select()
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.workspaceId),
            eq(member.userId, input.userId),
          ),
        )
        .limit(1);

      if (existing) {
        return { created: false, membership: existing };
      }

      await this.editionExtension?.beforeMembershipGrant({
        database: transactionalDatabase,
        role: input.role,
        source: input.source,
        userId: input.userId,
        workspaceId: input.workspaceId,
      });

      const [created] = await transactionalDatabase
        .insert(member)
        .values({
          id: input.id ?? crypto.randomUUID(),
          organizationId: input.workspaceId,
          role: input.role,
          userId: input.userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        const [concurrentMembership] = await transactionalDatabase
          .select()
          .from(member)
          .where(
            and(
              eq(member.organizationId, input.workspaceId),
              eq(member.userId, input.userId),
            ),
          )
          .limit(1);

        if (!concurrentMembership) {
          throw new Error("Membership could not be granted");
        }

        return { created: false, membership: concurrentMembership };
      }

      await ensureDefaultTeamspaceMembership(
        transactionalDatabase,
        this.editionExtension,
        {
          userId: input.userId,
          workspaceId: input.workspaceId,
        },
      );

      await this.editionExtension?.recordSecurityEvent({
        database: transactionalDatabase,
        details: { role: input.role, source: input.source },
        occurredAt: new Date(),
        type: "membership.granted",
        userId: input.userId,
        workspaceId: input.workspaceId,
      });

      return { created: true, membership: created };
    });
  }
}
