# Local API

Run `npm install` and `npm run dev` to start the loopback API and Vite UI together. `npm run start:api` runs only the API. This is a local development service, not a public deployment or multi-user authentication system. Do not expose or tunnel its ports.

Copy `.env.example` to `.env` yourself. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` only on the server. No real key is needed for tests. `OPENAI_ALLOWED_MODELS` optionally sets a comma-separated allowlist (default: the configured model). `CHAT_MOCK=1` explicitly enables deterministic, no-network responses without a key. `/api/config` exposes readiness, mode, default model and model choices only. With no configured model or key, live mode is unavailable.

The API binds to `127.0.0.1`. Vite proxies `/api` without rewriting the Host header. Exact local Host and Origin checks reject foreign browser origins and DNS rebinding; POST requests must include their same-origin Origin header. Only the configured API and web ports are accepted. Do not put secrets in `VITE_*` variables. No custom OpenAI endpoint is supported.

Limits in `.env.example` are validated at startup. Invalid configuration produces a generic error without environment values. This service does not log prompts, raw SDK errors, or credentials.

## Chat protocol and safeguards

`POST /api/chat` accepts `{messages:[{role:"user"|"assistant",content:string}],model?:string}`. Maximum 20 messages, 8,000 characters per message, 24,000 total characters, 100,000 request bytes; the last message must be a user message. System roles and unknown fields/models are rejected.

Responses use `application/x-ndjson`. Events are `text_delta` with `delta`, `component` with a validated catalog component, and exactly one terminal `done` or safe `error` with `message`. Clients must use `ChatDecoder` from `src/chat-protocol.ts`; never render partial JSON. Maximum 100 events, 12 unique-ID components, 65,536 characters per record and 262,144 stream bytes. Only complete validated events are forwarded. The model's done event is withheld until upstream has completed successfully.

Requests have a global local-server rate window, concurrent request ceiling, bounded input/output and a deadline. Disconnects/timeouts abort the upstream request. Automatic SDK retries are disabled. OpenAI receives only the submitted conversation plus the generation schema/instructions; `store:false` is set. No tool calls, custom base URLs or client-supplied credentials are accepted. These local limits are not a substitute for account-level spending controls. Restarting resets rate limits.

`npm run check` includes decoder, configuration, HTTP lifecycle and SDK-mocked tests. They use synthetic credentials and never call the paid API. No live model behavior has been validated by those tests.

References: [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [official TypeScript SDK](https://developers.openai.com/api/reference/typescript).
