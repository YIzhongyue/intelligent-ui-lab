# Intelligent UI Lab

An independent experiment in multi-turn answers that combine streamed text and allowlisted interactive components. The React client supports an offline fixture mode and an optional local OpenAI backend. **This is not an OpenAI implementation or a reproduction of an unpublished protocol.**

## Run offline

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. The browser starts in **Local mock** mode, which needs no API key and makes no model calls. Enter a question and send to stream the selected deterministic fixture. Mock fixtures intentionally do not answer your question.

The development servers bind to loopback. Do not expose them publicly. For checks and the frontend production bundle:

```sh
npm run check
npm run preview
```

`check` runs strict TypeScript, unit/DOM tests, and the production build. CI runs the same command. Preview serves static frontend assets, not the chat API; local fixture mode still works.

## Optional live server

Follow [backend setup and security notes](server/README.md) for server-only environment variables and model configuration. Keep keys out of browser code and `VITE_*` variables. Select **Chat server** in the app after starting the configured backend. Models are selected from the server-provided list; an unconfigured server disables live sends. Explicit server mock mode is also available for endpoint testing without credentials.

Live sends transmit the current question and recent completed context through your server to OpenAI, can incur API charges, and are subject to provider data policies. No paid requests or deployment are needed for the automated tests. This app does not persist conversations; this is not a promise of zero retention by the external provider.

## Use the conversation

- Enter to send; Shift+Enter for a newline.
- Stream text and validated components into separate conversation turns.
- Stop to retain partial output. Retry the last stopped/error question using current settings without duplicating its user turn.
- Change provider/model/fixture to stop an active response. Reset clears the current transcript and aborts the request.
- Prior completed same-mode exchanges supply bounded context; partial/error output is excluded.
- Interact with generated controls locally. Each turn has independent component state and unique control IDs.

See [chat behavior, limits, and tests](docs/chat.md), [the component vocabulary](docs/components.md), and [verification notes](VERIFICATION.md).

## Architecture

```text
question + bounded completed context
  -> local deterministic fixture OR POST /api/chat
  -> bounded UTF-8 NDJSON framing
  -> strict Zod event/component validation
  -> request identity and cancellation guards
  -> escaped text + allowlisted React renderer
  -> isolated local component state
```

- `src/ChatApp.tsx`: multi-turn UI, configuration, lifecycle, stop/retry/reset.
- `src/chat-state.ts`: transcript updates and bounded model context.
- `src/chat-transport.ts`: safe configuration and streaming fetch/reader cleanup.
- `src/chat-protocol.ts`: shared request and chat-event validation/decoder.
- `src/components.tsx`: handwritten accessible component renderers.
- `src/protocol.ts`: component schema and deterministic partition model.
- `src/provider.ts`: offline fixture streams and intentional unsafe fixture.
- `server/`: server-only model integration and request controls.

No arbitrary HTML, generated JavaScript, remote images, dynamic imports from model output, or external component actions are supported. Components are data, never executable code. Both server and client validate generated output. A terminal event plus clean transport EOF is required for a completed response.

## Inspiration and limits

The [OpenAI GPT-6 announcement](https://openai.com/zh-Hans-CN/index/gpt-6-for-everyone/) describes streamable native components and choosing when text is enough. This repository explores those broad ideas with its own protocol. It makes no claims about unpublished internal schemas or compiler algorithms.

This is a local experiment, not production infrastructure. It has no authentication, durable persistence, account management, production monitoring, deployment workflow, or external tool execution. Read the backend security notes before enabling model access. Automated DOM tests do not substitute for real-browser interaction and visual verification; that stage remains blocked as described in the verification notes.
