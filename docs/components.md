# Bounded UI catalog

The model selects a shape; application-owned React code implements it. `src/protocol.ts` is the source of truth. Import `componentJSONSchema` for a component-only catalog or `publicSchema` for the NDJSON event schema. These values are generated from the actual Zod validators; do not maintain a separate model-facing schema. `componentSchema.parse()` must run on every untrusted component before rendering.

## Renderer integration

```tsx
import { UIRenderer } from './components';
<UIRenderer key={`${responseId}-${spec.id}`} spec={spec} idPrefix={responseId} />
```

`UIRenderer` accepts a validated `ComponentSpec` and an optional application-owned `idPrefix`. React instance IDs ensure that two answers using the same component ID cannot collide within one React root. Independent React roots must have distinct React `identifierPrefix` values or distinct renderer prefixes. Remount with a new key for a new response or replacement spec: checklist and simulator initial state belongs to the mounted instance. Both controls update only local memory. Reloading or remounting resets them. Nothing is saved or sent.

## Selection guidelines and limits

- `text`: default for an explanation that does not benefit from structure. Title and body: 1–1,200 characters.
- `notice`: a short caveat with the same text limits. It is not an alert or a command.
- `skew`: the existing synthetic partition simulator. 4–16 partitions, 1,000–100,000 rows, integer hot-key percentage 0–90. It is not measured production data.
- `metrics`: 1–6 labeled values, each with a short detail. Use for a few established facts, never invent measurements.
- `table`: 1–6 column labels and 1–12 rows of plain string cells. Every row must have exactly the column count. This cross-field rule is enforced by Zod at runtime and is not expressible by the generated JSON Schema alone.
- `bar-chart`: 1–12 labeled nonnegative numeric values, each no greater than 1,000,000,000. Unit is at most 30 characters. Use only for comparable quantities with a shared unit. Zero remains zero; decorative bar width does not replace readable numeric values.
- `checklist`: 1–16 labels and required boolean initial checked values. Use for optional local task exploration, never to imply a task has been completed externally.
- `disclosure`: 1–8 native expandable sections. Summary up to 120 characters; body 1–600 characters. Native summary controls support keyboard operation.
- `comparison`: 2–3 named alternatives with a summary (1–400 characters), up to five advantages and five limitations each. Use for balanced differences, not unsupported recommendations.

New-kind titles and labels are 1–120 characters; cells, metric details, advantages, and limitations are at most 240 characters. IDs match `^[a-z][a-z0-9-]{0,39}$`. Every object is strict, including nested items. Empty collections are rejected except comparison advantages/limitations, where the renderer says “None listed.”

The stream's existing 8,192-code-unit record cap and 30-event cap still apply independently. A maximally filled schema-valid table or comparison can exceed the record cap; keep examples compact and split explanations across components. No recursive layout, arbitrary HTML/JS/CSS, external link/action fields, generated expressions, or evaluation is supported. URL-looking strings are displayed as escaped text, never navigated. CSS dimensions derive only from validated bounded numeric values and fixed application formulas.

## Examples

Each object below is a component payload. Wrap it in `{"type":"component","component":...}` and end an NDJSON stream with `{"type":"done"}`.

```json
{"kind":"metrics","id":"summary","title":"Sample overview","items":[{"label":"Rows","value":"24,000","detail":"Synthetic example"}]}
{"kind":"table","id":"sample","title":"Sample rows","columns":["Partition","Rows"],"rows":[["P1","100"],["P2","200"]]}
{"kind":"bar-chart","id":"distribution","title":"Sample distribution","unit":"rows","items":[{"label":"P1","value":100},{"label":"P2","value":200}]}
{"kind":"checklist","id":"preparation","title":"Before comparing","items":[{"label":"Use equal sample sizes","checked":false}]}
{"kind":"disclosure","id":"method","title":"Method notes","items":[{"summary":"Why equal samples?","body":"Equal sizes make raw counts easier to compare."}]}
{"kind":"comparison","id":"options","title":"Partition options","items":[{"name":"Fewer partitions","summary":"A smaller arrangement.","advantages":["Less coordination"],"limitations":["Less parallelism"]},{"name":"More partitions","summary":"A wider arrangement.","advantages":["More parallelism"],"limitations":["More coordination"]}]}
```

## Verification

`npm run check` covers strict types, schema acceptance/rejection, framing, server-rendered escaping, semantic table/disclosure structure, zero-valued bars, and repeated-ID isolation. The renderer tests use React server rendering and do not prove browser layout or interactive state transitions. Real-browser keyboard, checkbox/reset, slider/reset, small-screen overflow, and disclosure behavior remain required visual/interaction checks before calling the UI browser-verified. No new testing dependencies are introduced here.

## Icon-led sections and explicit choices

`icon-sections` uses 1–8 rows containing `title` (1–120 characters), `body` (1–600), `icon`, and `color`. Dividers separate rows. `choice-group` uses 2–8 uniquely identified options, `selection: "single" | "multiple"`, and optional integer `maxSelections` (1–8, no more than the option count, and only 1 for single selection). Each option has `id`, `title` (1–120), optional `body` (1–240), and optional paired `icon` and `color`. The same application-owned row primitive renders both shapes; composition does not permit recursive layouts. Plain options omit both icon and color.

Allowed icon names: `check-circle`, `triangle-alert`, `octagon-alert`, `info`, `lightbulb`, `book-open`, `code`, `target`, `clock`, `list-checks`, `chart-column`, `shield-check`.

Allowed colors: `neutral`, `green`, `amber`, `red`, `blue`, `purple`. The model chooses a token; fixed theme-friendly CSS implements its color. Icon meaning is also conveyed by visible text. Lucide uses static named imports; there are no model-selected import paths, custom SVG strings, arbitrary CSS colors, URLs or styles. See the [official Lucide React guide](https://lucide.dev/guide/react/) for the underlying SVG library.

The generated schema includes these exact enums. Runtime refinements additionally enforce unique option IDs, paired icon/color, and selection-limit cross-field constraints; the generation prompt states all three explicitly.

```json
{"kind":"icon-sections","id":"study-notes","title":"Study approaches","items":[{"title":"Start with theory","body":"Establish the main idea before practicing.","icon":"book-open","color":"blue"}]}
{"kind":"choice-group","id":"study-focus","title":"Choose a focus","selection":"single","options":[{"id":"theory","title":"Explain the concept"},{"id":"practice","title":"Work through an example"}]}
{"kind":"choice-group","id":"topics","title":"Choose engineering topics","selection":"multiple","maxSelections":2,"options":[{"id":"validation","title":"Validation","body":"Check bounded inputs.","icon":"check-circle","color":"green"},{"id":"races","title":"Request races","body":"Ignore older responses.","icon":"triangle-alert","color":"amber"}]}
```

The renderer's optional `choiceAction` is application-owned, never model data. Without it, choices are read-only. With it, native labeled radios/checkboxes store selection locally. An explicit fixed “Send choices and continue” button calls the parent with selected IDs only. A preview shows the exact message before sending. The parent rebuilds it from the stored validated spec in declaration order, including complete selected titles and bodies. Maximum allowed content fits within the 4,000-character request budget; nothing is silently truncated. Selection alone never starts a request. No model-defined action, endpoint, hidden prompt, button label or preselected option is accepted.

UI DOM tests cover both input types, exclusive radios, multi-selection limits and deselection, independent groups, previews, double-click submission, stale choices and retries. These supplement, but do not replace, the still-pending real-browser keyboard and layout checks.
