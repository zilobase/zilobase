# Database automation shared semantics

Pass 1 establishes one environment-neutral implementation for predicates,
formulas, and automation row snapshots. Browser view filtering now adapts its
row cache to the shared predicate context instead of evaluating filters itself.
Server evaluators use the same context with an injected clock and IANA timezone.

## Determinism boundary

- Callers capture one `now` instant at the beginning of evaluation.
- Relative dates, `now()`, `today()`, and date-part functions receive that
  instant and an explicit IANA timezone.
- Text predicates normalize with Unicode NFKC, trim whitespace, and compare
  case-insensitively.
- Missing values remain distinct from numeric zero and boolean false.
- Filter trees are normalized to at most 100 entries per level and five nested
  group levels before evaluation.

## Row snapshots

`createDatabaseRowSnapshot` materializes raw and computed property values from
a revision-consistent row input. Relation lookup stays adapter-owned, while the
shared traversal enforces cycle detection, a depth limit, and a total related
row limit. Formula failures remain field-addressable results instead of being
silently converted into values.

Pass 4 will consume these primitives when it closes event windows, evaluates
saved-view scope, and runs revision-pinned actions.
