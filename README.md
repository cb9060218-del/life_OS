# LifeOS

LifeOS is a private life-management progressive web app for routines, activities, focus sessions, challenges, goals, health logs, reflections, weekly progress, and achievements.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are public client credentials; never use a Supabase service-role key in browser configuration.
4. Apply the SQL files under `supabase/migrations` to your Supabase project in numeric order. The combined SQL Editor script at `supabase/sql-editor/20261014_remaining_setup.sql` applies migrations 2–6 after migration 1.
5. Enable email/password sign-in in Supabase Auth.
6. Run `npm run dev`.

## Deploy to Vercel

This repository includes `vercel.json` with the Vite build and output settings. Import the GitHub repository into Vercel and add these Environment Variables for Production (and Preview if desired):

- `VITE_SUPABASE_URL`: your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: your Supabase publishable/anon key

Deploy with the Vercel Git integration, or run `vercel` followed by `vercel --prod` from an authenticated Vercel CLI. Vite embeds these public values into the browser bundle at build time, so redeploy after changing them.

## Build

`npm run build` type-checks the app and produces the deployable `dist/` directory.

## Account security and data

The app uses Supabase Row Level Security for user-owned records and a four-digit local convenience PIN after sign-in. Supabase email/password remains the account security boundary; the PIN is stored locally and can be reset by signing in again. The client must only receive a publishable/anon key, never a service-role key.
