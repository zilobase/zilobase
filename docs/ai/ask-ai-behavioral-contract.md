# Ask AI behavioral contract

Status: implemented in code; live provider acceptance remains a release gate

The original Ask AI work established capability and permission parity, but its
runtime behavior still exposed implementation mechanics to users. In
particular, Auto selected by catalog order, new databases had
to be assembled through many atomic tool calls, the turn stopped after 15
steps, and the default output budget was 1,600 tokens. A useful tracker could
therefore require more calls than one turn allowed even though every individual
operation existed.

The product contract is now outcome-oriented:

- Users describe the result in ordinary language, without supplying internal
  IDs, property types, view configuration, or a tool sequence.
- Ask AI infers routine, reversible implementation details and asks one concise
  question only for a consequential choice that cannot be safely inferred.
- New databases use one declarative blueprint covering the host page, schema,
  options, views, filters, sorts, rows, cell values, and row-page content.
- The blueprint requires a placement decision. A database that is the primary
  artifact is standalone/full-page; inline placement is reserved for databases
  requested inside a page, dashboard, brief, or section.
- Native page titles are authoritative. AI-created bodies remove matching
  heading duplicates, and an inline database title is hidden automatically when
  it matches its host page title.
- The result reports the exact properties, views, filters, and rows, while the
  progress UI exposes the concrete completed substeps and partial failures.
- Atomic database tools remain available for edits and recovery.
- Auto selects the best enabled model for the workload and reasoning models use
  the Responses API. The normal output budget is 8,000 tokens.

## Release acceptance prompts

Run these against a workspace with an ordinary member account. Passing means
the requested result exists and is usable, not merely that the assistant
described how to create it.

1. `Create a 1:1 meeting notes database with useful properties and a This week view.`
   Expect a standalone database with Date, Attendees, Status, Tags, and Follow-up
   needed properties; an all meetings table; and a date-filtered This week view.
2. `Create a content calendar for our product launch.`
   Expect a sensible workflow schema, useful status and calendar/timeline views,
   and no request for internal IDs or property mechanics.
3. `Turn this page into an action plan.`
   Expect one combined, reviewable page update after reading the current page.
4. `Add a board grouped by status to the existing project database.`
   Expect inspection of the current schema and an atomic view edit rather than
   creation of a replacement database.
5. `Create a release dashboard page with a release tracker inside it.`
   Expect one native page title, supporting body copy without a duplicate H1,
   and an inline database whose matching block title is hidden.
6. Force a failure after database creation.
   Expect the UI and final answer to identify completed and incomplete steps,
   retain links to created objects, and avoid claiming full success.

Provider-backed smoke tests should cover Auto and one explicitly selected
legacy model before release. Permission and forbidden-capability regression
tests remain required from the main Ask AI plan.
