import { Component, type ReactNode } from "react"

import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index"
import { captureProductException } from "@/shared/lib/posthog"

type FallbackErrorBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
  name?: string
}

type FallbackErrorBoundaryState = {
  hasError: boolean
}

export class FallbackErrorBoundary extends Component<
  FallbackErrorBoundaryProps,
  FallbackErrorBoundaryState
> {
  state: FallbackErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    captureProductException(error, {
      error_boundary: this.props.name ?? "route.render_error",
    })
    recordDesktopDiagnostic(
      this.props.name ?? "route.render_error",
      describeDesktopError(error),
      "error",
    )
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
