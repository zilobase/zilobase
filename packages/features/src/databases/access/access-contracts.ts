/** Wire contract for database access rules (`/databases/:id/access`). */

export type DatabaseAccessRule = {
  id: string
  workspaceId: string
  databaseId: string
  targetType: "public" | "user" | "team" | "agent"
  targetId: string
  accessLevel: "view" | "edit" | "full"
  createdAt: string
  updatedAt: string
}

export type DatabaseAccessPayload = { access: DatabaseAccessRule[] }
