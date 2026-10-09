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
