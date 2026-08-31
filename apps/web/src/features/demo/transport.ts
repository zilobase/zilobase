type DemoMutationResult<T> =
  | { handled: false }
  | { handled: true; value: T }

type DemoTransport = {
  applyReadOverlay: <T>(path: string, value: T) => T
  interceptMutation: <T>(
    path: string,
    method: string,
    body: BodyInit | null | undefined,
  ) => DemoMutationResult<T>
}

let transport: DemoTransport = {
  applyReadOverlay: (_path, value) => value,
  interceptMutation: () => ({ handled: false }),
}

export function installDemoTransport(next: DemoTransport) {
  transport = next
}

export function applyDemoReadOverlay<T>(path: string, value: T): T {
  return transport.applyReadOverlay(path, value)
}

export function interceptDemoMutation<T>(
  path: string,
  method: string,
  body: BodyInit | null | undefined,
): DemoMutationResult<T> {
  return transport.interceptMutation(path, method, body)
}
