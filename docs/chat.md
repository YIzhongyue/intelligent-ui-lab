# Streaming conversation

The browser starts in **Local mock** mode. It makes no model calls and works without a server or API key. Pick a fixture, enter any question, and send. The fixture ignores the question intentionally; it is a transport and rendering demo, not an AI answer. The unsafe-component fixture intentionally produces an error.

Select **Chat server** for multi-turn requests to the local backend. The model list comes only from `GET /api/config`; there is no browser key field or editable model identifier. If the server has no key/model configured, sending is disabled. After configuring and restarting the backend, select **Refresh server settings**. An unavailable server does not prevent local mock use. When the server reports mock mode, the settings explicitly say that its responses are deterministic. Live mode sends your current question and recent completed context through the server to OpenAI. API charges and provider data policies apply; the app does not promise zero retention by the provider. Live OpenAI requests can incur API charges; this project does not make them until a user sends in the configured server mode.

## Conversation controls

- Enter sends; Shift+Enter inserts a newline. IME composition does not send prematurely.
- Text arrives incrementally; interleaved text and component records keep their original order. Only complete, schema-validated component records render. Plain text is escaped by React; Markdown and raw HTML are not executed or parsed.
- **Stop response** aborts the fetch and cancels the reader. Valid partial output stays visible with a stopped status.
- **Retry with current settings** replaces the latest stopped/failed attempt without adding another user turn. It uses the currently selected provider, model, and fixture. Earlier completed turns stay intact.
- Changing provider, model, or fixture stops an active request. Each displayed turn retains the settings used for that attempt.
- **Reset conversation** aborts the active request and clears the transcript and draft. Late callbacks cannot restore reset or stopped output.
- Component controls are local to each response. Identical model-provided component IDs in different turns do not share control state or DOM IDs.

The transcript is in memory only. Reloading loses it. There is no persistence, account, conversation synchronization, file upload, or tool execution.

## Context and limits

Every server request contains `{ messages, model }`. Context includes only complete exchanges from the same browser provider mode preceding the current turn, followed by the current question. Failed, stopped, and still-streaming responses are excluded. Local mock turns are never included in server context. Switching server models retains prior completed server exchanges deliberately.

The client includes at most five prior exchanges (11 messages including the new question), at most 16,000 total UTF-16 code units, and at most 4,000 code units in each assistant context entry. Questions are limited to 4,000. Oldest exchanges are dropped first. Component specifications are serialized alongside response text for context; long responses are truncated for the next request. Current local control interactions are not sent back. The displayed transcript itself is not truncated by this context window.

The backend independently validates request and response limits. Clean EOF is required after the terminal event before the UI marks a response complete. Missing completion, invalid records, duplicate IDs, server error events, HTTP failures, and interrupted responses produce an error or stopped status. Partial valid output remains visible.

## Verification

`npm run check` runs TypeScript, unit/DOM tests, and a production build. Focused coverage lives in:

- `src/chat-state.test.ts`: bounded context, retries, and stale-event rejection.
- `src/chat-transport.test.ts`: byte-split UTF-8, truncation, terminal errors, invalid records, request payloads, aborts, and reader cleanup.
- `src/ChatApp.test.tsx`: escaped streamed text, follow-up context, stop/retry/reset, late callbacks, mode/model changes, server configuration, and keyboard controls.

DOM tests run in jsdom with mocked transport. They are not real-browser interaction or visual verification. Real browser validation was attempted separately but blocked by `ERR_BLOCKED_BY_CLIENT`; this change does not claim that stage passed. No paid API request, real credential, deployment, or production data is used by the tests.

## Explicit choice continuation

Choose **Choose a study focus** in Local mock for icon-led sections followed by plain single-select options. Choose **Choose engineering topics** for multi-select options composed with icon rows. Both fixtures are synthetic and require no key. As with every local fixture, continuation repeats the selected deterministic fixture; it does not interpret your selections using AI.

Selections remain local until **Send choices and continue**. The visible preview becomes a normal user bubble and starts the next response. The action uses the current settings only while their identity is unchanged from the source answer. Every provider/model/fixture change or server-config refresh permanently invalidates older choice buttons, even when values are changed back or the server switches from mock to live using the same model name. Ask again to receive new choices. Initial background configuration loading does not invalidate local mock choices. This conservatively prevents silent routing or billing changes.

The parent validates source turn, attempt, component ID, completion, latest-turn position, live readiness, and selected IDs against its stored spec. A synchronous one-shot token plus the active-request guard prevents repeated clicks from producing multiple requests. Incomplete, stopped, failed, historical or stale choices cannot submit. A successful submission makes all groups in the old answer historical. Failure or cancellation of the next response uses the ordinary **Retry with current settings** flow, retaining one selection message; reset clears the conversation and action state. All pre-existing attempt isolation, cancellation and bounded context rules still apply.
