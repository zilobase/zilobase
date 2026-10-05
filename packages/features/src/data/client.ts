import { AccessCollections } from "../pages/access-references";
import { NavigationCollections } from "../pages/navigation-references";
import type { QueryClient } from "@tanstack/react-query";
import { referenceInterests } from "./interests";
import { DataPublication } from "./publication";
import { DataSession, type DataSessionScope } from "./session";
import { createPageCollection } from "../pages/cache-registration";
import { DatabaseCollections } from "../databases/cache";

export class SessionEntities {
  readonly session;
  readonly pages;
  readonly databases;
  readonly navigation;
  readonly access;
  constructor(scope: DataSessionScope) {
    this.session = new DataSession(scope);
    this.pages = createPageCollection(this.session);
    this.databases = new DatabaseCollections(this.session, this.pages);
    this.navigation = new NavigationCollections(this.session);
    this.access = new AccessCollections(this.session);
  }
}

type SessionIdentity = Omit<DataSessionScope, "workspaceId">;
const clients = new WeakMap<QueryClient, SharedClient>();

/** Composition/lifetime only; domain modules validate and normalize their payloads. */
export class SharedClient {
  readonly publication = new DataPublication();
  private readSequence = 0;
  private authorizationEpoch = 0;
  private collectionScheduled = false;
  private readonly trackedFamilies = new Map<string, Set<string>>();
  private identityKey: string | undefined;
  private readonly sessions = new Map<string, SessionEntities>();
  private readonly sessionIds = new Map<string, SessionEntities>();
  constructor(
    private identity: () => SessionIdentity,
    private readonly queryClient?: QueryClient,
  ) {
    queryClient?.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] === "session") {
        this.capture();
        if (
          event.type === "updated" &&
          event.action.type === "error" &&
          isAccessLoss(event.query.state.error)
        )
          this.clear();
      }
      if (
        event.type === "updated" &&
        event.action.type === "error" &&
        isAccessLoss(event.query.state.error)
      )
        this.revokeReferences(event.query.state.data);
      this.scheduleCollection();
    });
  }

  configure(identity: () => SessionIdentity) {
    this.identity = identity;
    return this;
  }

  capture() {
    const identity = this.identity();
    const key = JSON.stringify(identity);
    if (this.identityKey !== key) {
      this.identityKey = key;
      this.clear();
      this.publication.changed([]);
    }
    return {
      identity,
      key,
      sequence: ++this.readSequence,
      epoch: this.authorizationEpoch,
      scopeId: undefined as string | undefined,
    };
  }

  resolve(
    read: ReturnType<SharedClient["capture"]>,
    workspaceId: string,
    capability?: { kind: "guest" | "public"; id: string },
  ) {
    if (!this.isCurrent(read)) throw new Error("Shared data read belongs to an expired identity");
    if (read.scopeId) {
      const owner = this.sessionIds.get(read.scopeId);
      if (!owner || owner.session.scope.workspaceId !== workspaceId)
        throw new Error("Expired or mismatched capability read");
      if (
        capability &&
        (owner.session.scope.viewer.kind !== capability.kind ||
          !("capabilityId" in owner.session.scope.viewer) ||
          owner.session.scope.viewer.capabilityId !== capability.id)
      )
        throw new Error("Capability classification changed during read");
      return owner;
    }
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
      entities.session.onRelease = () => this.scheduleCollection();
    }
    return entities;
  }

  revalidateScope(
    read: ReturnType<SharedClient["capture"]>,
    previous: unknown,
    kind: "account" | "guest" | "public",
    accessReduced = false,
  ) {
    if (!this.isCurrent(read)) throw new Error("Expired authorization response");
    const owners = [...referenceInterests(previous, []).keys()].flatMap(
      (id) => this.sessionIds.get(id) ?? [],
    );
    if (accessReduced || owners.some((owner) => owner.session.scope.viewer.kind !== kind)) {
      this.revokeReferences(previous);
      // This authorized receipt can establish its newly classified scope; older
      // reads remain expired. This epoch is a disposal guard, not an entity clock.
      read.epoch = this.authorizationEpoch;
      read.scopeId = undefined;
    }
  }

  isCurrent(read: ReturnType<SharedClient["capture"]>) {
    return this.capture().key === read.key && read.epoch === this.authorizationEpoch;
  }

  async captureRead(scopeId?: string) {
    const read = { ...this.capture(), scopeId };
    await Promise.all([...this.sessions.values()].map((owner) => owner.session.ready()));
    if (scopeId && !this.sessionIds.has(scopeId))
      throw new Error("Shared data capability has expired");
    if (!this.isCurrent(read))
      throw new Error("Shared data read belongs to an expired authorization");
    return read;
  }

  clear() {
    this.authorizationEpoch++;
    for (const owner of this.sessions.values()) void owner.session.dispose();
    this.sessions.clear();
    this.sessionIds.clear();
    this.trackedFamilies.clear();
    this.publication.changed([]);
  }

  revokeReferences(input: unknown) {
    const ids = referenceInterests(input, []).keys();
    let changed = false;
    for (const id of ids) {
      const owner = this.sessionIds.get(id);
      if (!owner) continue;
      changed = true;
      this.sessionIds.delete(id);
      this.trackedFamilies.delete(id);
      for (const [key, candidate] of this.sessions)
        if (candidate === owner) this.sessions.delete(key);
      void owner.session.dispose();
    }
    if (changed) {
      this.authorizationEpoch++;
      this.publication.changed([]);
      // Capability changes expire the entire affected scope. Other retained reads
      // recover through their existing authorization endpoints on next use/focus.
      void this.queryClient?.invalidateQueries({
        predicate: (query) =>
          [...referenceInterests(query.state.data, query.queryKey).keys()].some(
            (id) => !this.sessionIds.has(id),
          ),
        refetchType: "none",
      });
    }
  }

  private scheduleCollection() {
    if (this.collectionScheduled || !this.queryClient) return;
    this.collectionScheduled = true;
    queueMicrotask(() => {
      this.collectionScheduled = false;
      const queries = this.queryClient!.getQueryCache().getAll();
      // Normalization publishes before Query installs its result references.
      if (queries.some((query) => query.state.fetchStatus === "fetching")) return;
      const interests = new Map<string, Set<string>>();
      queries.forEach((query) => referenceInterests(query.state.data, query.queryKey, interests));
      for (const owner of this.sessions.values()) {
        const families = interests.get(owner.session.id) ?? new Set<string>();
        const tracked = this.trackedFamilies.get(owner.session.id) ?? new Set<string>();
        families.forEach((name) => tracked.add(name));
        this.trackedFamilies.set(owner.session.id, tracked);
        if (tracked.size && !families.size && !owner.session.isRetained) {
          this.sessionIds.delete(owner.session.id);
          this.trackedFamilies.delete(owner.session.id);
          for (const [key, candidate] of this.sessions)
            if (candidate === owner) this.sessions.delete(key);
          void owner.session.dispose();
          this.publication.changed([]);
          continue;
        }
        void owner.session.releaseInactive(families, tracked).catch(() => undefined);
        if (["records", "property-values", "source-links"].some((name) => tracked.has(name)))
          owner.databases.releaseInactiveInterests(families);
      }
    });
  }

  get(id: string) {
    this.capture();
    return this.sessionIds.get(id);
  }

  database(id: string, querySessionId?: string) {
    if (querySessionId && this.queryClient) {
      for (const [, ref] of this.queryClient.getQueriesData<{ cacheId?: string }>({
        queryKey: ["db", querySessionId, id, "bootstrap"],
      })) {
        const owner = ref?.cacheId ? this.get(ref.cacheId) : undefined;
        if (owner?.databases.hasHostInterest(id)) return owner;
      }
    }
    const matches = this.all().filter((owner) => owner.databases.hasHostInterest(id));
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
  const client = new SharedClient(identity, queryClient);
  clients.set(queryClient, client);
  return client;
}
export function sharedClient(queryClient: QueryClient) {
  const client = clients.get(queryClient);
  if (!client) throw new Error("Shared client must be installed by the application composition");
  return client;
}

export function isAccessLoss(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    [401, 403, 404].includes(Number(error.status)),
  );
}
