# Daily Logical Reasoning

A private daily trainer for LSAT-style Logical Reasoning. One question is available at a time. After you submit, the next question unlocks exactly 24 hours later. The timer is a timestamp in Postgres, not a midnight reset and not a browser clock.

These are not official LSAC questions. The question text comes from [ooakdata/lsat-reasoning](https://huggingface.co/datasets/ooakdata/lsat-reasoning), which reports a CC BY 4.0 license. Attribute **ooakdata**. Confirm the current license before any public or commercial distribution.

## Architecture

The browser talks to Next.js route handlers with the signed-in user's Supabase session. Those handlers call Postgres functions. `get_daily_question()` returns the stimulus and choices only. `submit_daily_attempt()` reads `correct_answer` inside the database, inserts the attempt, and sets `next_available_at` to `submitted_at + interval '24 hours'`.

Row level security lets a user read their own profile, attempts, and progress. There is no client policy that can insert or edit an attempt, and there is no select policy on `questions`, so the answer key is not readable with the anon key. The service-role key is only for the import script.

Streaks count consecutive completion dates in the timezone stored on the profile. The cooldown is a fixed 24-hour duration, so daylight saving does not shorten it.

The dataset has no difficulty field. Questions are stored with `difficulty = null` and shown as Unrated.

## Run it on this computer, without an account

No Supabase keys are required for a local look at the question and the answer check.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose **Start today’s question**. Pick an answer and submit. The explanation appears immediately. The next question stays locked for 24 hours. Progress is stored in `data/local/session.json`, which is not committed. Use **Reset this computer and try again** on the dashboard to clear that lock while you are trying the app.

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, the app uses Supabase accounts instead of this local file.

## Setup

1. Create a Supabase project and turn on email/password auth. For a single private user, disabling email confirmation avoids an extra step.
2. Paste `supabase/migrations/001_init.sql` into the Supabase SQL editor and run it.
3. Copy `.env.example` to `.env` and fill in the project URL, anon key, and service-role key.
4. Build the question bank, then import it:

```bash
python scripts/fetch_questions.py
python scripts/validate_questions.py
python scripts/export_questions.py
python scripts/import_questions.py
```

`import_questions.py` upserts `data/processed/selected.json`. You can instead paste `supabase/seed.sql` after the export step. Raw pages stay in `data/raw` and are never overwritten with filtered rows.

5. `npm run dev`, create an account, and open the dashboard.

## Checks

```bash
npm test
python -m unittest scripts.test_question_bank
npm run build
```

## Deploy

Deploy the Next.js app to Vercel. Set the same three environment variables in the project settings. Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
