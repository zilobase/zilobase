# Mail implementation verification — 2026-09-09

## Implemented

Ten implementation passes are recorded as separate commits; the runtime-parity
pass has separate core and adapter commits because they are different repositories.
The existing mail layout and styling are preserved. The browser suite compares
styled composer screenshots with the pre-change implementation byte for byte.

Changes include effective development configuration, transactional OAuth binding,
draft resume/save coordination, send receipt recovery and fingerprints, reply and
forward corrections, MIME hydration, receive polling/recovery, indexed list
reconciliation, bounded offline cache reads, and a same-origin push tunnel profile.

## Verification

- Full server quality run: 1,122 tests passed; four opt-in integration tests skipped
  in the ordinary suite. Query regression run: 310 passed. Coverage thresholds passed.
- Dedicated disposable PostgreSQL mail integration: three scenarios exercise route
  transport, six concurrent send claims, and concurrent OAuth credential binding.
- Chrome acceptance: eight tests, including a styled screenshot equality check.
- Web test harness, architecture links/exports and deployment checks passed.
- Adapter: 90 tests plus 22 hosted-runtime tests passed; TypeScript build passed.
- Desktop: formatting, Clippy and 44 Rust tests passed.
- Web production build and bundle budget passed: initial bundle approximately 0.96 MB.
- Fake IndexedDB fixture with 10,000 threads: bounded query materialized 51 rows in
  approximately 4 ms versus approximately 50 ms and 10,000 materialized rows for
  the full read. These are local fixture timings, not production benchmarks.

## Remaining interactive verification

Real mail has not been sent. Google consent, recipient delivery, authenticated
Pub/Sub push through an operator-controlled tunnel, and desktop interactive OAuth
remain pending the two controlled test accounts and configuration.

- At inspection time, Node had its runtime mail flag disabled and no Gmail OAuth
  credentials. The hosted adapter profile had the three OAuth values and runtime
  mail enabled, but its frontend flag disabled. No credentials are copied into this
  report. Follow
  [gmail-deployment.md](gmail-deployment.md) to enable the desired local profile and
  complete the real-Google acceptance matrix.
