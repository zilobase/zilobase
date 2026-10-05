import type { QueryClient } from "@tanstack/react-query";
import { DataPublication } from "./publication";
import { DataSession, type DataSessionScope } from "./session";
import { createPageCollection } from "../pages/cache-registration";
import { DatabaseCollections } from "../databases/cache";

export class SessionEntities {
  readonly session;
  readonly pages;
  readonly databases;
  constructor(scope: DataSessionScope) {
    this.session = new DataSession(scope);
    this.pages = createPageCollection(this.session);
    this.databases = new DatabaseCollections(this.session, this.pages);
  }
}

type SessionIdentity = Omit<DataSessionScope, "workspaceId">;
const clients = new WeakMap<QueryClient, SharedClient>();

/** Composition/lifetime only; domain modules validate and normalize their payloads. */
export class SharedClient {
  readonly publication = new DataPublication();
  private identityKey: string | undefined;
  private readonly sessions = new Map<string, SessionEntities>();
  private readonly sessionIds = new Map<string, SessionEntities>();
  constructor(private identity: () => SessionIdentity) {}

  configure(identity: () => SessionIdentity) {
    this.identity = identity;
    return this;
  }

  capture() {
    const identity = this.identity();
    const key = JSON.stringify(identity);
    if (this.identityKey !== key) {
      for (const entities of this.sessions.values()) void entities.session.dispose();
      this.sessions.clear();
      this.sessionIds.clear();
      this.identityKey = key;
      this.publication.changed([]);
    }
    return { identity, key };
  }

  resolve(
    read: ReturnType<SharedClient["capture"]>,
    workspaceId: string,
    capability?: { kind: "guest" | "public"; id: string },
  ) {
    if (this.capture().key !== read.key)
      throw new Error("Shared data read belongs to an expired identity");
    const base = read.identity;
    if (capability?.kind === "guest" && base.viewer.kind === "public")
      throw new Error("Guest read requires an authenticated actor");
    const viewer: DataSessionScope["viewer"] =
      capability?.kind === "public"
        ? { kind: "public", capabilityId: capability.id }
        : capability?.kind === "guest" && base.viewer.kind !== "public"
          ? { kind: "guest", actorId: base.viewer.actorId, capabilityId: capability.id }
          : base.viewer;
    const scope = { deployment: base.deployment, viewer, workspaceId };
    const key = JSON.stringify(scope);
    let entities = this.sessions.get(key);
    if (!entities) {
      entities = new SessionEntities(scope);
      entities.session.publication.subscribe(() => this.publication.changed([]));
      this.sessions.set(key, entities);
      this.sessionIds.set(entities.session.id, entities);
    }
    return entities;
  }

  get(id: string) {
    this.capture();
    return this.sessionIds.get(id);
  }

  database(id: string) {
    const matches = this.all().filter((owner) => owner.databases.hosts.collection.base.has(id));
    if (matches.length > 1) throw new Error("Database read requires an explicit capability scope");
    return matches[0];
  }

  all() {
    this.capture();
    return [...this.sessions.values()];
  }
}

export function installSharedClient(queryClient: QueryClient, identity: () => SessionIdentity) {
  // Hot replacement of the composition updates its identity reader without
  // creating a second owner or losing mounted collection references.
  const existing = clients.get(queryClient);
  if (existing) return existing.configure(identity);
  const client = new SharedClient(identity);
  clients.set(queryClient, client);
  return client;
}
export function sharedClient(queryClient: QueryClient) {
  const client = clients.get(queryClient);
  if (!client) throw new Error("Shared client must be installed by the application composition");
  return client;
}
