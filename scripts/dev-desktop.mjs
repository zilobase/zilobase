import { spawn } from "node:child_process"

const children = [
  spawn("npm", ["run", "dev:server"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev", "--workspace", "@zilobase/desktop"], {
    stdio: "inherit",
  }),
]

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM")
  }
  process.exit(code)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGINT") return
    shutdown(code ?? 1)
  })
}
