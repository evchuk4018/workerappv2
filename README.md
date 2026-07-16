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
