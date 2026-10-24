import { ContentEditorTracker } from "../documents/content-editor";
import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus, type Extension } from "@hocuspocus/server";
import type { RuntimeEnv } from "../../../shared/config/config";
import { canAccessPageInWorkspace } from "../../access/effective-access";
import { meetingIdFromDocumentName, pageIdFromDocumentName } from "../documents/documents";
import { assertCommentOnlyCollaborationUpdate } from "../documents/update-policy";
import {
  CollaborationDocumentPersistence,
  getMeetingPageId,
  loadDocument,
  storeDocument,
  withDatabase,
} from "../persistence/document-persistence";
import {
  verifyCollaborationTicket,
  type CollaborationTicketClaims,
} from "../tickets/ticket-security";
export type CollaborationContext = CollaborationTicketClaims;

export function createCollaborationHocuspocus(
  env: RuntimeEnv,
  persistence?: CollaborationDocumentPersistence,
) {
  const editors = new ContentEditorTracker();
  const documentLoads = new Map<string, Promise<Uint8Array>>();

  const preloadDocument = (documentName: string) => {
    const existing = documentLoads.get(documentName);

    if (existing) {
      return existing;
    }

    const load = persistence ? persistence.load(documentName) : loadDocument(documentName, env);
    documentLoads.set(documentName, load);
    void load.catch(() => documentLoads.delete(documentName));
    return load;
  };

  const consumeDocument = (documentName: string) => {
    const load = documentLoads.get(documentName) ?? preloadDocument(documentName);
    documentLoads.delete(documentName);
    return load;
  };

  return new Hocuspocus<CollaborationContext>({
    debounce: 800,
    maxDebounce: 5_000,
    extensions: [
      ...(collaborationExtensionsFactory?.(env) ?? []),
      new Database({
        fetch: async ({ documentName }) => consumeDocument(documentName),
        store: async ({ documentName, document, state }) =>
          persistence
            ? persistence.store({
                document,
                documentName,
                state,
                contentEdit: editors.pending(document),
              })
            : storeDocument(documentName, document, state, env, editors.pending(document)),
      }),
    ],
    async afterLoadDocument({ document }) {
      editors.loaded(document);
    },
    async onChange({ document, context }) {
      editors.changed(document, context?.scope === "read-write" ? context.userId : undefined);
    },
    async onAuthenticate({ connectionConfig, documentName, requestParameters, token }) {
      const authenticateStartedAt = performance.now();
      const claims = await verifyCollaborationTicket(token, env);
      const ticketVerifyMs = Math.round(performance.now() - authenticateStartedAt);
      const pageId = pageIdFromDocumentName(documentName);
      const meetingId = meetingIdFromDocumentName(documentName);
      const routedDocumentName = requestParameters.get("document");

      const ticketMatches = pageId
        ? "pageId" in claims && pageId === claims.pageId
        : meetingId
          ? "meetingId" in claims && meetingId === claims.meetingId
          : false;

      if (!ticketMatches) {
        throw new Error("Collaboration ticket does not match the document");
      }

      if (routedDocumentName && routedDocumentName !== documentName) {
        throw new Error("Collaboration document does not match the routed room");
      }

      // Hocuspocus loads the document after authentication. Start the read once
      // the signed ticket has scoped the request so it overlaps the live access
      // check instead of adding another database round trip to first sync.
      const documentLoad = preloadDocument(documentName);
      const pageAccessStartedAt = performance.now();
      const allowed = await withDatabase(env, async () => {
        const accessPageId = pageId ?? (await getMeetingPageId(meetingId!));
        return accessPageId
          ? canAccessPageInWorkspace(
              accessPageId,
              claims.workspaceId,
              claims.userId,
              claims.scope === "readonly"
                ? "view"
                : claims.scope === "comment"
                  ? "comment"
                  : "edit",
            )
          : false;
      });
      const pageAccessMs = Math.round(performance.now() - pageAccessStartedAt);

      console.info(
        JSON.stringify({
          event: "collaboration_ticket_authenticated",
          pageAccessMs,
          ticketVerifyMs,
        }),
      );

      if (!allowed) {
        documentLoads.delete(documentName);
        throw new Error("Forbidden");
      }

      connectionConfig.readOnly = claims.scope === "readonly";

      // Retain the promise until Hocuspocus asks its Database extension for it.
      // Its rejection will be surfaced by that fetch path for authorized clients.
      void documentLoad.catch(() => undefined);

      return claims;
    },
    async beforeSync({ context, document, payload, type }) {
      if (context.scope === "comment" && (type === 1 || type === 2)) {
        assertCommentOnlyCollaborationUpdate(document, payload);
      }
    },
    async connected({ connection, context }) {
      const timeout = setTimeout(() => connection.close(), Math.max(0, context.exp - Date.now()));
      connection.onClose(() => clearTimeout(timeout));
    },
  });
}

export let collaborationExtensionsFactory: ((env: RuntimeEnv) => Extension[]) | null = null;

export function setCollaborationExtensionsFactory(
  factory: ((env: RuntimeEnv) => Extension[]) | null,
) {
  collaborationExtensionsFactory = factory;
}

export let defaultHocuspocus: Hocuspocus<CollaborationContext> | null = null;

export function getDefaultCollaborationHocuspocus(env: RuntimeEnv) {
  defaultHocuspocus ??= createCollaborationHocuspocus(env);
  return defaultHocuspocus;
}
