import { test } from "node:test";
import assert from "node:assert/strict";

import { createRegistry } from "../src/registry.ts";

// Local port keys so the test needs no runtime import from @zilobase/core-ports.
const HelloPort = { id: "hello" } as { id: string; __type?: { hi(): string } };
const NumberPort = { id: "number" } as { id: string; __type?: number };
const MissingPort = { id: "missing" } as { id: string; __type?: unknown };

test("register and resolve an implementation", () => {
  const registry = createRegistry();
  registry.register(HelloPort, { hi: () => "world" });
  assert.equal(registry.resolve(HelloPort).hi(), "world");
});

test("resolve throws for an unregistered port", () => {
  const registry = createRegistry();
  assert.throws(() => registry.resolve(MissingPort), /No implementation registered/);
});

test("duplicate registration throws unless override is set", () => {
  const registry = createRegistry();
  registry.register(NumberPort, 1);
  assert.throws(() => registry.register(NumberPort, 2), /already has an implementation/);
  registry.register(NumberPort, 2, { override: true });
  assert.equal(registry.resolve(NumberPort), 2);
});

test("has and tryResolve reflect registration state", () => {
  const registry = createRegistry();
  assert.equal(registry.has(HelloPort), false);
  assert.equal(registry.tryResolve(HelloPort), undefined);
  registry.register(HelloPort, { hi: () => "x" });
  assert.equal(registry.has(HelloPort), true);
  assert.equal(registry.tryResolve(HelloPort)?.hi(), "x");
});
