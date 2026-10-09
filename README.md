# Intelligent UI Lab

An independent, local experiment in choosing an appropriate interface for an answer. A deterministic provider streams a small, validated UI vocabulary into a React renderer. **This is not a live AI service, an OpenAI implementation, or a reproduction of an unpublished protocol.** No account, API key, external backend, or payment is needed.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. The server binds to loopback by default. Do not expose the development server publicly. For a production bundle:

```sh
npm run check
npm run preview
```

`check` runs strict TypeScript checking, unit tests, and a production build. `npm run test:watch` is available for development. CI runs the same check on Node 22. Dependency versions are recorded in `package-lock.json`.

## Try the three scenarios

1. **Explore data skew:** run the stream, then adjust the hot-key share. The chart and max/average metric update entirely on the client. Reset restores the fixture's initial value.
2. **A simple definition:** the provider emits only a text card. A question does not always need an interactive answer.
3. **Reject an unsafe component:** an unsupported `html` component is rejected by the schema before rendering. This is an intentional error fixture.

During streaming, cancel retains the partial preview; restart aborts the older run and clears its state. Changing a scenario cancels an active stream but keeps the last preview until the next run. The event log shows validated events, and the schema inspector shows the actual generated JSON Schema.

## Architecture

```text
UIProvider (AsyncIterable<Uint8Array>, AbortSignal)
  -> UTF-8 + NDJSON framing
  -> strict Zod event/component validation
  -> run identity and duplicate-ID guard
  -> allowlisted React component renderer
  -> controlled local state
```

- `src/provider.ts`: provider interface, deterministic fixtures, deliberately split byte chunks, and abortable timing.
- `src/protocol.ts`: schemas, bounded NDJSON decoder, and pure synthetic data model.
- `src/main.tsx`: stream lifecycle, allowlisted component switch, and local simulator controls.
- `src/protocol.test.ts`: byte boundary, Unicode, validation, limits, truncation, cancellation, and data fixture tests.
- `src/style.css`: responsive layout, visible focus styles, native controls, and reduced-motion support. No remote assets are loaded.

### Protocol v0

Every line is one complete JSON event. Supported events are `component` and terminal `done`. Components are `text`, `skew`, and `notice`. IDs must be unique within a run. Each schema is strict: extra fields, arbitrary actions, URLs, HTML, and scripts are not supported. React renders text as escaped text.

```json
{"type":"component","component":{"kind":"text","id":"answer","title":"Hello","body":"A short explanation."}}
{"type":"done"}
```

A final newline is optional. Blank lines and CRLF are accepted. The decoder handles split UTF-8 characters and split JSON records, but **only renders complete validated events**, not incomplete JSON, JSX, or token fragments. Limits: 8,192 UTF-16 code units per record, 30 events per response, 1,200 characters per text field, 4–16 partitions, and 1,000–100,000 rows. Malformed UTF-8, malformed JSON, invalid schemas, missing completion, duplicate IDs, and records after completion reject the stream. Already rendered valid components remain inspectable on a later error. The final `done` event is recorded immediately, but the response is only marked complete after clean transport EOF.

### Deterministic skew fixture

The base fixture has 24,000 rows, 8 partitions, and a 45% hot-key share. First reserve `floor(rows * hotPercent / 100)` rows for partition 1, then distribute the remaining rows evenly; integer remainders go to the earliest partitions. Expected counts are `[12450, 1650, 1650, 1650, 1650, 1650, 1650, 1650]`. Max/average is `4.15`. At 0%, each partition has 3,000 rows. This model is an educational simplification, not a Spark planner, throughput estimate, or production dataset.

## Adding a real model provider

1. Implement `UIProvider.stream(scenario, signal)` or generalize its request type with explicit application-owned fields. Keep the mock for offline demos and regression tests.
2. Put model calls behind a server endpoint. Keep credentials server-side; never put secrets in browser code or `VITE_*` variables. Add authentication, rate/usage limits, a timeout, and an explicit spending policy before enabling paid requests.
3. Map the chosen model's output into this repository's NDJSON protocol. Do not assume a vendor has an equivalent transport or schema. Pass cancellation through the server, and bound input/output bytes at the transport layer.
4. Continue validating all events on the client and server. Treat model output as untrusted. Test malformed output and interrupted streams. No dynamic imports, `eval`, generated JavaScript, or HTML injection.
5. Add component capabilities deliberately. Each new component needs a strict schema, a handwritten renderer, accessibility checks, and tests. Actions must map to application-owned handlers. External mutations require explicit authorization and server-side checks; this demo has none.

The current provider chooses scenarios from a dropdown. It does not reason, call a model, use natural-language prompts, or learn interface selection. That is the next experiment to design, not a capability claimed by this starter.

## Inspiration and limits

The [OpenAI GPT-6 announcement](https://openai.com/zh-Hans-CN/index/gpt-6-for-everyone/) describes streamable native components, rendering as generation arrives, and choosing when text is enough. This repository explores those broad ideas with its own tiny event protocol. The announcement does not publish an internal schema or compiler algorithm; this project makes no claims about either.

This is a starter, not production infrastructure. It has no persistence, server, model integration, rich-text parser, recursive layout language, arbitrary executable output, telemetry, production monitoring, or deployment setup. The in-memory event list and local controls reset on reload. Validation limits protect this small demo; a future network provider also needs byte-level transport limits and server enforcement.

## Verification

Unit tests and browser verification are described in `VERIFICATION.md`. CI runs `npm run check` on pushes and pull requests; check the Actions tab for results against a specific commit. Local checks do not substitute for CI or real-browser verification. This repository has no deployment workflow.
