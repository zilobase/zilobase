type DatabaseMetricOutcome = "failure" | "success"

type DatabaseMetricAttributes = {
  operation?: string
  outcome: DatabaseMetricOutcome
  scope?: "host" | "source"
}

type DatabaseCounterName = "ordering_conflict"
type DatabaseGaugeName = "outbox_backlog" | "outbox_oldest_age_ms"
type DatabaseHistogramName =
  | "acknowledgement_latency_ms"
  | "commit_duration_ms"
  | "enqueue_duration_ms"

const counters = new Map<string, number>()
const gauges = new Map<string, number>()
const histograms = new Map<string, { count: number; sum: number }>()

export function recordDatabaseCounter(
  name: DatabaseCounterName,
  attributes: DatabaseMetricAttributes,
  value = 1,
) {
  if (!Number.isFinite(value) || value < 0) return
  const key = metricKey(`zilobase.database.${name}`, attributes)
  counters.set(key, (counters.get(key) ?? 0) + value)
}

export function recordDatabaseGauge(
  name: DatabaseGaugeName,
  value: number,
  attributes: DatabaseMetricAttributes = { outcome: "success" },
) {
  if (!Number.isFinite(value) || value < 0) return
  gauges.set(metricKey(`zilobase.database.${name}`, attributes), value)
}

export function recordDatabaseHistogram(
  name: DatabaseHistogramName,
  value: number,
  attributes: DatabaseMetricAttributes,
) {
  if (!Number.isFinite(value) || value < 0) return
  const key = metricKey(`zilobase.database.${name}`, attributes)
  const current = histograms.get(key) ?? { count: 0, sum: 0 }
  histograms.set(key, {
    count: current.count + 1,
    sum: current.sum + value,
  })
}

export async function measureDatabaseOperation<T>(
  name: DatabaseHistogramName,
  attributes: Omit<DatabaseMetricAttributes, "outcome">,
  operation: () => Promise<T>,
) {
  const startedAt = performance.now()
  try {
    const result = await operation()
    recordDatabaseHistogram(name, performance.now() - startedAt, {
      ...attributes,
      outcome: "success",
    })
    return result
  } catch (error) {
    recordDatabaseHistogram(name, performance.now() - startedAt, {
      ...attributes,
      outcome: "failure",
    })
    throw error
  }
}

export function renderPrometheusDatabaseMetrics() {
  const lines: string[] = []
  for (const [key, value] of counters) {
    const [name, labels] = splitMetricKey(key)
    lines.push(`# TYPE ${name} counter`, `${name}${labels} ${value}`)
  }
  for (const [key, value] of gauges) {
    const [name, labels] = splitMetricKey(key)
    lines.push(`# TYPE ${name} gauge`, `${name}${labels} ${value}`)
  }
  for (const [key, value] of histograms) {
    const [name, labels] = splitMetricKey(key)
    lines.push(
      `# TYPE ${name} summary`,
      `${name}_count${labels} ${value.count}`,
      `${name}_sum${labels} ${value.sum}`,
    )
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : ""
}

export function resetDatabaseMetricsForTest() {
  counters.clear()
  gauges.clear()
  histograms.clear()
}

function metricKey(name: string, attributes: DatabaseMetricAttributes) {
  const labels = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\u0000")
  return `${name}\u0001${labels}`
}

function splitMetricKey(key: string): [string, string] {
  const [rawName = "zilobase_database_unknown", rawLabels = ""] = key.split("\u0001")
  const name = rawName.replaceAll(".", "_")
  const labels = rawLabels
    ? `{${rawLabels.split("\u0000").map((entry) => {
      const [label, ...rest] = entry.split("=")
      return `${label}="${rest.join("=").replace(/[\\"\n]/g, "_")}"`
    }).join(",")}}`
    : ""
  return [name, labels]
}
