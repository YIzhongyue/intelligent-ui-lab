# Local API

Run `npm install` and `npm run dev` to start the loopback API and Vite UI together. `npm run start:api` runs only the API. This is a local development service, not a public deployment or multi-user authentication system. Do not expose or tunnel its ports.

Copy `.env.example` to `.env` yourself. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` only on the server. No real key is needed for tests. `OPENAI_ALLOWED_MODELS` optionally sets a comma-separated allowlist (default: the configured model). `CHAT_MOCK=1` explicitly enables deterministic, no-network responses without a key. `/api/config` exposes readiness, mode, default model and model choices only. With no configured model or key, live mode is unavailable.

The API binds to `127.0.0.1`. Vite proxies `/api` without rewriting the Host header. Exact local Host and Origin checks reject foreign browser origins and DNS rebinding; POST requests must include their same-origin Origin header. Only the configured API and web ports are accepted. Do not put secrets in `VITE_*` variables. No custom OpenAI endpoint is supported.

Limits in `.env.example` are validated at startup. Invalid configuration produces a generic error without environment values. This service does not log prompts, raw SDK errors, or credentials.
