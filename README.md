# DeepSeek Chat

A focused, single-user DeepSeek V4 chat application built with Next.js and Supabase.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase, DeepSeek, Brave Search, and Tavily values. Multiple Brave or Tavily keys may be provided as comma-separated ordered fallbacks.
2. Create `erholovachuk@gmail.com` in Supabase Authentication and disable public sign-ups.
3. Add `http://localhost:3000/auth/callback` and the production equivalent to the Supabase redirect allow list.
4. Run `npm install` to install the app and the pinned Supabase CLI.
5. Run `npx supabase login`, then link the hosted project with
   `npx supabase link --project-ref <project-ref>`.
6. Preview pending migrations with `npx supabase db push --linked --dry-run`, then apply them with
   `npx supabase db push --linked`.
7. Run `npm run dev`.

## Memory worker

The production memory pipeline uses Postgres outbox rows, the `memory_jobs` PGMQ queue,
`pg_cron`/`pg_net`, and the `memory-worker` Edge Function. The worker reads these Vault
secrets; do not expose them to the browser:

- `memory_worker_url` — the deployed Edge Function URL
- `memory_worker_secret` — a random shared secret used only by cron and the worker
- `deepseek_api_key` — the DeepSeek key used for extraction, summaries, and profiles

Deploy with `npx supabase functions deploy memory-worker --no-verify-jwt`. The function
implements its own constant-time shared-secret authentication. Run database tests with
`npx supabase test db`; they cover RLS, grants, private jobs, queue routines, indexes,
and the installed cron schedule.

## Browser Python analysis

DeepSeek can call `run_python` to verify calculations, analyze CSV/TSV/JSON/XLSX/TXT
attachments, and create plots or downloadable files. Python runs in a sandboxed browser
iframe and Web Worker using the pinned Pyodide runtime, so no separate Python server is
required. The first run downloads the runtime and requested compatible packages from the
Pyodide/PyPI CDNs.

Inputs and generated artifacts are stored in the private `chat-files` Supabase Storage
bucket and remain until their chat is deleted. Runs allow 25 MiB of total inputs, 30 seconds
of Python execution, and up to five 10 MiB outputs. Network calls run automatically but are
limited by normal browser CORS rules. Only pure-Python wheels and packages built for
Pyodide/WebAssembly can be installed; native CPython-only wheels will fail clearly.

## Commands

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript validation
- `npm test` — unit tests
- `npm run build` — production build
- `npx supabase migration list --linked` — compare local and hosted migrations
- `npx supabase db push --linked --dry-run` — preview hosted database changes

DeepSeek and Supabase credentials are always read from environment variables and must not be committed.
Supabase CLI link state and access tokens are local-only and ignored by Git.
