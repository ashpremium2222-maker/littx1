# Vibora AI setup

The Vibora chat in `vibora-littx.html` sends messages to `/api/ai/chat`. The
server keeps the model key private, supplies published LITTX event data as
grounding context, and returns matching live event cards. The selected provider
is Google's Gemini API using its OpenAI-compatible Chat Completions endpoint.

## Turn on the free Gemini API tier

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Vercel project, open **Settings → Environment Variables** and add
   `GEMINI_API_KEY` with that value for the Production environment.
3. Save and redeploy the project. The app selects `gemini-2.5-flash-lite` by
   default; no model or base URL variable is required.

Keep the key server-side. Do not paste it into `vibora-littx.html`, a public
GitHub commit, or this chat. The free tier has provider-set quotas and can
return rate-limit errors when those limits are reached. Google's pricing page
currently lists free token usage for selected models, including Flash-Lite;
free-tier prompts and responses may be used to improve Google products. Avoid
sending sensitive personal information. The app sends recent conversation
context to Gemini for each reply whether or not chat-history saving is enabled.

For local development, put the key in `staging/server/.env`. The environment
example has a blank `GEMINI_API_KEY` entry. `GEMINI_MODEL` can optionally
override the default model. The legacy `LITTX_AI_*` variables remain supported
for an existing OpenAI-compatible provider, but are not needed for Gemini.

The shared request limiter also needs the application's existing
`BOOKING_OTP_SECRET` or `SCANNER_SESSION_SECRET` (at least 32 characters) and
the configured database. This limits public AI usage to 15 requests per
five-minute window per IP. Requests and provider failures are bounded and the
server does not return provider error bodies or keys to the browser.

## About the supplied GitHub AI projects

`airi-0.14.1.zip` and `Open-LLM-VTuber-main.zip` contain application code, not a
hosted AI account or included model server. With a zero hosting budget, neither
runtime is deployed as an always-on service. The Vercel website uses Gemini's
free API tier for replies instead. Open-LLM-VTuber remains a possible later
self-hosted option if a computer/server is available; its voice and avatar
features are not part of the current website chat.

## Profiles, matches, and check-ins

Vibora accounts use a one-time code sent to the user's email. This identity is
separate from ticket purchase data. New profiles are private and discoverability
is off by default. People matching only returns profiles that opted in; users
can turn discovery off, block or report a profile, and send messages after a
connection is accepted. Vibora profile, connection, message, and opted-in chat
data are stored in the application's MongoDB database. Saved chat and the
user-entered memory are only synced after the user enables chat memory.

Check-in emails are disabled by default. Users may enable them in Vibora profile
settings and choose their timezone and quiet hours. The Vercel cron in
`vercel.json` checks daily and sends at most one check-in every 48 hours after
24 hours without an authenticated chat interaction. It uses the configured
model to write each message and may include only verified published event data.
Set `CRON_SECRET` (a random secret of at least 32 characters) and configure an
existing email delivery provider (`BREVO_API_KEY`, Mailgun, or SMTP) before
enabling this job. Vercel cron support depends on the project's Vercel plan.

The social and verified-profile features require the existing MongoDB and
`BOOKING_OTP_SECRET`, as well as working outbound email for verification codes.
The code is present in this project, but the feature cannot sign in, send email,
or generate AI replies until the deployment environment is configured.
