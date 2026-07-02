# Contributing to Notelab

Thanks for your interest in improving Notelab. This guide explains how to set up the repo, make focused changes, and submit pull requests that are straightforward to review.

## Development Setup

Prerequisites:

- Node.js 22 or newer
- npm
- Docker, if you want to test the self-hosted stack

Install dependencies from the repository root:

```sh
npm install
```

Useful commands:

```sh
npm run dev:web
npm run build:web
npm run test:web
npm run dev:server
npm run build:server
npm run dev:docs
npm run check:docs
```

For local self-hosting:

```sh
docker compose up -d --build
```

Then open `http://localhost`.

## Project Structure

- `apps/web`: Vite React web client and Cloudflare static worker entrypoint.
- `apps/server`: Hono API, auth, database access, AI tools, integrations, and serverful runtime.
- `apps/mobile`: Expo mobile client.
- `apps/desktop`: Tauri desktop shell.
- `apps/docs`: Mint documentation site.
- `packages/features`: shared client-side feature queries, hooks, and cache logic.
- `packages/connectors`: connector implementations and connector UI surfaces.
- `packages/page-context`: editor/page context extraction and markdown helpers.
- `packages/markdown-text-splitter`: standalone markdown splitting utilities.

See `ARCHITECTURE.md` for a deeper walkthrough.

## Issues

Before opening an issue, search existing issues to avoid duplicates.

Bug reports should include:

- Operating system and browser, when relevant
- Node.js and npm versions
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots, logs, or stack traces if useful

Feature requests should include:

- The problem or workflow you want to improve
- The proposed behavior
- Any alternatives you considered

Security issues should not be reported in public issues. See `SECURITY.md`.

## Pull Requests

Use a focused branch name:

```sh
git checkout -b fix/page-title-save
git checkout -b feature/mobile-inbox-filter
```

Before opening a PR:

- Keep the PR focused on one change.
- Add or update tests for behavior changes.
- Update docs when setup, public APIs, or user-facing behavior changes.
- Run the relevant checks from the root workspace.
- Include screenshots or screen recordings for UI changes.

PR descriptions should explain:

- What changed
- Why the change is needed
- How it was tested
- Any known limitations or follow-up work

## Coding Standards

- Use TypeScript for new JavaScript code.
- Follow existing file and component patterns in the area you touch.
- Prefer shared package APIs over duplicating app-specific logic.
- Keep server state in TanStack Query patterns used by `packages/features`.
- Keep UI changes consistent with the existing design system and component style.
- Avoid unrelated refactors in feature or bug-fix PRs.

## License

By contributing to Notelab, you agree that your contributions are licensed under the MIT License that covers this repository.
