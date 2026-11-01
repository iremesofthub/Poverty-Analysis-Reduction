# Setup

The app has no third-party app builder behind it. It is a static Vite/React site plus a Supabase project.

## 1. Supabase project (database and sign-in)

1. Create a project at https://supabase.com.
2. Project Settings > API: copy the **Project URL** and the **publishable (anon) key**.
3. Put them in `.env.local` (never commit this file):

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   VITE_IREME_API_URL=http://127.0.0.1:8020
   GROQ_API_KEY=your-groq-key
   ```

   `.env.example` lists every supported variable with placeholders; copy it to `.env.local` and fill
   in real values. Provider credentials may be supplied from several authorized accounts: use
   `GROQ_API_KEY`, `GROQ_API_KEY_2` … `GROQ_API_KEY_9` (same pattern for `NVIDIA_API_KEY`,
   `OLLAMA_API_KEY`). Keys are tried in order and the engine fails over to the next key when one is
   rejected or rate-limited; extra keys never raise the provider's account quota. Never commit
   `.env.local` or paste key values into issues, logs or the browser bundle.

   `VITE_IREME_API_URL` is the address of the governed Ireme API. Provider keys
   such as `GROQ_API_KEY` are read by that server and must never use a `VITE_`
   prefix. The API loads the git-ignored root `.env.local` for local development
   when `python-dotenv` is installed; process and deployment environment values
   take precedence. The browser forwards only the signed-in Supabase access token.

4. Authentication > Providers: Email is on by default. Turn on **Confirm email** and set the email template to include the 6-digit `{{ .Token }}` (the sign-up screen asks for that code).
5. Authentication > URL Configuration: set **Site URL** to your deployed address, and add `http://localhost:5173/**` and the deployed address to **Redirect URLs** (needed for password reset and Google sign-in).
6. Optional Google sign-in: Authentication > Providers > Google, using a client ID and secret from Google Cloud Console.
7. Apply and review `supabase/migrations/20261030235858_create_signup_profiles.sql` in a local or staging Supabase project before production. It creates a `profiles` row for new Auth users with the fixed, low-privilege `job_applicant` role. User metadata supplies display name and language only; it never grants a platform role. Existing Auth users without a profile need separate, verified administrator provisioning. Do not grant staff roles through signup metadata or browser code.

## 2. Edge functions

Install the Supabase CLI, then:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set GROQ_API_KEY=your-groq-key
supabase functions deploy chart-insight
supabase functions deploy ussd --no-verify-jwt
```

`chart-insight` requires a signed-in user. `ussd` is called by the USSD gateway, so it skips JWT checks; rebuild it first with `node tools/ussd/build-function.mjs` if the USSD logic changed.

### Checking provider keys and credit

```bash
python scripts/check_provider_accounts.py
```

The script reads key *names* from `.env.local`, authenticates every `PROVIDER_API_KEY[_2.._9]` slot against
`/models`, then makes one `max_tokens=1` call to confirm completion credit is available. It prints and
stores only slot names, HTTP statuses, model counts and rate-limit headers — never a key value — in
`docs/implementation/evidence/provider_credentials.json`. A `QUOTA_EXHAUSTED` line means the account is
rate-limited or out of tokens; `KEY_REJECTED` means the key is invalid or revoked. All keys failed over
during normal operation are tried in suffix order, so one exhausted key does not take the provider down.

## 3. Hosting the site

Any static host works (Vercel, Netlify, Cloudflare Pages). Build command `npm run build`, output folder `dist`, and add the two `VITE_SUPABASE_*` values as environment variables. Add a rewrite of all paths to `/index.html` so deep links like `/login` work.

For the AI Engine, host the Python governed API as a separate server service.
Install `engine/requirements.txt`, configure its issuer, audience, JWKS, catalog,
and audit database settings, then run it locally with:

```bash
python -m uvicorn ireme.api:configured_app --factory --app-dir engine --host 127.0.0.1 --port 8020
```

For deployment, set `VITE_IREME_API_URL` to the API's HTTPS address in the
frontend build environment and set `IREME_CORS_ORIGINS` on the API to the exact
frontend origin. Static GitHub Pages can host the frontend, but it cannot host
the Python API or safely hold provider credentials.

The API keeps its catalog, jobs, reports and artifacts in SQLite and on disk, so
it needs a host with a persistent volume (Render, Railway, Fly.io) rather than a
serverless function with an ephemeral filesystem. When `VITE_IREME_API_URL` is
absent the AI Engine still renders and states that no governed API is configured
instead of showing sample data or an endless loading state.

### Vercel

The frontend deploys from `main` with `vercel.json` already in the repository
(Vite build, `dist` output, single-page rewrite). Set these project environment
variables for Production and Preview:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's publishable (anon) key |
| `VITE_IREME_API_URL` | the HTTPS address of the hosted governed API |

Redeploy after changing any of them: Vite inlines `VITE_*` values at build time.

## 4. Local run

```bash
npm install
npm run dev
```

Checks: `npm test`, `npm run lint`, `npm run build`.
