import assert from "node:assert/strict"
import test from "node:test"

import { desktopDevelopmentPlan } from "./dev.mjs"

test("desktop development keeps Cloudflare as Cloud and lists the other local servers", () => {
  const plan = desktopDevelopmentPlan({
    communityApi: "http://localhost:3000",
    providers: [
      {
        id: "cloudflare",
        runtimes: [{
          id: "cloudflare",
          name: "Cloudflare",
          api: "http://localhost:3010",
          app: "http://localhost:1422",
        }],
      },
      {
        id: "licensed",
        runtimes: [{ name: "Licensed server", api: "http://localhost:3020/" }],
      },
      {
        id: "docs",
        runtimes: [{ name: "Docs", api: "https://docs.example.com" }],
      },
    ],
  })

  assert.equal(plan.cloudApiOrigin, "http://localhost:3010")
  assert.equal(plan.cloudWebOrigin, "http://localhost:1422")
  assert.deepEqual(plan.customServers, [
    { label: "Self-hosted Community", url: "http://localhost:3000" },
    { label: "Licensed server", url: "http://localhost:3020" },
  ])
})
