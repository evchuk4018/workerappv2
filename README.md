# DeepSeek Chat

A focused, single-user DeepSeek V4 chat application built with Next.js and Supabase.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase and DeepSeek values.
2. Create `erholovachuk@gmail.com` in Supabase Authentication and disable public sign-ups.
3. Add `http://localhost:3000/auth/callback` (and the production equivalent) to the Supabase redirect allow list.
4. Apply `supabase/migrations/20260715000000_create_chat_schema.sql` in the Supabase SQL editor.
5. Run `npm install`, then `npm run dev`.

## Commands

- `npm run dev` — local development
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript validation
- `npm test` — unit tests
- `npm run build` — production build

DeepSeek and Supabase credentials are always read from environment variables and must not be committed.
