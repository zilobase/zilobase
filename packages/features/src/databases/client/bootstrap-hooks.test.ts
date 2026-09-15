import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"

import {
  ZilobaseFeaturesProvider,
  type ZilobaseFeaturesConfig,
} from "../../shared/context"
import { useDatabaseBootstrap } from "./bootstrap-hooks"
import { DbProvider } from "./provider"
import { useDatabaseRecords } from "./record-hooks"

test("database bootstrap is idle outside an authenticated session", () => {
  const queryClient = new QueryClient()
  const apiFetch: ZilobaseFeaturesConfig["apiFetch"] = async () => {
    throw new Error("anonymous bootstrap must not fetch through DbClient")
  }
  let status: string | undefined

  function Capture() {
    status = useDatabaseBootstrap(null).status
    return null
  }

  renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ZilobaseFeaturesProvider,
        {
          value: {
            apiFetch,
            auth: {} as ZilobaseFeaturesConfig["auth"],
            queryClient,
          },
        },
        createElement(
          DbProvider,
          { apiFetch, queryClient, sessionId: null },
          createElement(Capture),
        ),
      ),
    ),
  )

  assert.equal(status, "idle")
})

test("database record windows load through public REST outside a session", () => {
  const queryClient = new QueryClient()
  const apiFetch: ZilobaseFeaturesConfig["apiFetch"] = async () => {
    throw new Error("anonymous record windows must not fetch through DbClient")
  }
  let status: string | undefined

  function Capture() {
    status = useDatabaseRecords({
      databaseId: "database-1",
      dataSourceId: "source-1",
      viewId: "view-1",
    }).status
    return null
  }

  renderToString(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ZilobaseFeaturesProvider,
        {
          value: {
            apiFetch,
            auth: {} as ZilobaseFeaturesConfig["auth"],
            queryClient,
          },
        },
        createElement(
          DbProvider,
          { apiFetch, queryClient, sessionId: null },
          createElement(Capture),
        ),
      ),
    ),
  )

  assert.equal(status, "loading")
})
