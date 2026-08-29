# Zilobase color token catalog

`color-tokens.css` is the only human-edited source of application UI color. Change a semantic value there; do not add a literal color to a component. Run `npm run tokens:sync` after changes and commit the generated authorization fragments.

Canonical names use `--zb-color-{concept}-{property}-{variant}-{state}`. Tailwind aliases are intentionally shorter and map one-to-one to canonical tokens. Default values apply to `:root` and `.light`; `.dark` changes appearance; `[data-theme-family="notion"]` changes the neutral family. Action, feedback, and content-palette hues are shared by Default and Notion.

## Core roles

| Canonical token | Tailwind alias / utility example | Allowed use | Replaces |
|---|---|---|---|
| `surface-background-canvas` | `surface-canvas` / `bg-surface-canvas` | Page and application canvas | `background` |
| `surface-background-card` | `surface-card` | Cards | `card` |
| `surface-background-overlay` | `surface-overlay` | Menus, dialogs, popovers | `popover` |
| `surface-background-navigation` | `surface-navigation` | Sidebar and navigation chrome | `sidebar` |
| `surface-background-subtle` | `surface-subtle` | Quiet grouped panels | `subtle-surface` |
| `surface-background-muted` | `surface-muted` | Muted sections and skeletons | `muted`, structural `secondary` |
| `content-text-primary` | `content-primary` / `text-content-primary` | Primary text and icons | `foreground`, card/popover foreground |
| `content-text-secondary` | `content-secondary` | Supporting text and icons | `muted-foreground`, sidebar item foreground |
| `content-text-inverse` | `content-inverse` | Content on semantically inverse backgrounds | `text-background` |
| `border-stroke-default` | `stroke-default` / `border-stroke-default` | Dividers and ordinary outlines | `border` |
| `control-background-default` | `control-background` | Inputs and unchecked controls | `bg-input`, accent-filled controls |
| `control-border-default` | `control-border` | Input and control boundaries; aliases the shared default stroke | `border-input` |

## Actions

| Canonical token suffix | Alias | Allowed use | Replaces |
|---|---|---|---|
| `action-background-primary[-hover]` | `action-primary[-hover]` | Primary calls to action | `action-primary`, primary button literals |
| `action-text-on-primary` | `action-on-primary` | Text/icons on primary actions | `action-primary-foreground` |
| `action-text-link` | `action-link` | Links only | link uses of `primary` |
| `action-background-secondary[-hover]` | `action-secondary[-hover]` | Secondary buttons | action uses of `secondary` |
| `action-text-on-secondary` | `action-on-secondary` | Content on secondary actions | `secondary-foreground` |
| `action-background-neutral-hover` | `action-neutral-hover` | Neutral hover/open state | `accent`, sidebar control hover |
| `action-background-neutral-pressed` | `action-neutral-pressed` | Neutral pressed state | `active` |
| `action-text-on-neutral` | `action-on-neutral` | Content on neutral interaction states | `accent-foreground`, `active-foreground` |
| `action-background-selected[-subtle]` | `action-selected[-subtle]` | Checked, selected, and highlighted state | selected uses of `primary`, `primary-subtle` |
| `action-text-selected` | `action-selected-text` | Selected labels | text uses of `primary` |
| `action-text-on-selected` | `action-on-selected` | Content on a selected fill | `primary-foreground` |
| `action-border-selected` | `action-selected-border` | Selected borders | border/ring uses of `primary` |
| `action-ring-focus` | `action-focus-ring` | Keyboard focus only | `ring`, `selection-focus-ring` |
| `action-background-danger[-hover]` | `action-danger[-hover]` | Destructive controls only | destructive button uses |
| `action-text-on-danger` | `action-on-danger` | Content on destructive fills | `destructive-foreground` |
| `action-text-danger`, `action-border-danger` | `action-danger-text`, `action-danger-border` | Destructive labels and boundaries | text/border uses of `destructive` |

## Feedback and shared content palette

`feedback-{text|background}-{success|warning|error}[-subtle]` maps to `feedback-{success|warning|error}[-text|-subtle]`. Use these only for validation or outcome feedback; they replace every `status-*` token. `feedback-text-favorite` maps to `feedback-favorite` and is reserved for favorite indicators.

The persisted palette IDs are `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, and `red`:

| Canonical pattern | Alias pattern | Allowed use | Replaces |
|---|---|---|---|
| `palette-text-{id}` | `palette-{id}` | Editor text, charts, cursors, icons | `editor-{id}` |
| `palette-background-{id}-subtle` | `palette-{id}-subtle` | Editor highlights and database tags | `editor-{id}-surface` |
| `palette-text-on-subtle` | `palette-on-subtle` | Text/icons on any subtle palette fill | `editor-color-foreground` |
| `palette-background-{id}-variant-{82|68|54|88|74|60|46}` | none (runtime chart token) | Derived chart series shades only | runtime chart color mixing |

## Derived roles

All derivation happens in `color-tokens.css`.

| Canonical token | Alias | Purpose / replacement |
|---|---|---|
| `effect-background-backdrop` | `effect-backdrop` | Translucent canvas backdrop / `backdrop` |
| `effect-background-scrim` | `effect-scrim` | Modal scrim / `scrim` |
| `effect-scrollbar-{default|firefox|hover}` | none | Browser scrollbar paint |
| `indicator-background-muted` | `indicator-muted` | Low-emphasis indicator / `muted-indicator` |
| `selection-background-editor` | `selection-editor` | Editor selection / `editor-selection-overlay` |
| `selection-background-row` | `selection-row` | Database selection / `database-selection-row` |
| `data-border-timeline-grid` | `data-grid` | Timeline grid / `timeline-grid-border` |
| `data-background-bar`, `data-text-on-bar` | `data-bar`, `data-bar-text` | Timeline/chart bars |
| `data-background-media`, `data-text-label` | `data-media`, `data-label` | Media canvas and chart labels |
| `effect-shadow-pane` | none | Side-pane shadow color |
| `effect-shadow-base` | none | Semantic black source for scrims and shadows |
| `effect-shadow-{2xs|xs|sm|default|md|lg|xl|2xl}` | none | Semantic color used by shadow geometry in `design-tokens.css` |

## Workflow

1. Choose the existing role by purpose, not by its current value.
2. If no role fits, add one canonical token and, only when class utilities need it, one direct `@theme inline` alias.
3. Change all four theme combinations when the role is family-dependent.
4. Run `npm run tokens:sync`, `npm run tokens:check`, the web tests, and the relevant builds.
5. Literal exceptions require an entry in `color-exceptions.json` with an owner and reason.
