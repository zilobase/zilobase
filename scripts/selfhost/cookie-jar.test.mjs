import assert from "node:assert/strict";
import test from "node:test";
import { CookieJar } from "./cookie-jar.mjs";

test("self-host sessions preserve cookie replacement, equals signs and combined expiry headers", () => {
  const jar = new CookieJar();
  assert.equal(jar.header(), "");
  jar.store({ getSetCookie: () => ["session=first==; Path=/", "other=value; Secure", "invalid"] });
  assert.equal(jar.header(), "session=first==; other=value");
  jar.store({
    get: (name) =>
      name === "set-cookie"
        ? "session=next; Expires=Wed, 21 Oct 2030 07:28:00 GMT, new=last; Path=/"
        : null,
  });
  assert.equal(jar.header(), "session=next; other=value; new=last");
  jar.store({ get: () => null });
  assert.equal(jar.header(), "session=next; other=value; new=last");
  jar.store({ getSetCookie: () => [], get: () => "ignored=value" });
  assert.equal(jar.header(), "session=next; other=value; new=last");
});
