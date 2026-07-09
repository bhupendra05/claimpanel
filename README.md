# ClaimPanel

A multi-model fact-checker. Paste a claim, headline, or social post (Hindi or English) and ClaimPanel routes it to **5 LLMs from 5 different providers** in parallel — OpenAI, Anthropic, Google, DeepSeek, and xAI — then shows each model's verdict side by side with a consensus score, so you can see where models agree and where (and why) they don't.

## Why this exists

Single-model fact-checks inherit a single model's blind spots. ClaimPanel treats disagreement between models as signal, not noise: if 4/5 models call a claim false and one disagrees, that's more useful than a single confident-sounding answer. It's aimed at claims that spread as WhatsApp/social forwards — health myths, financial scams, "forward this or else" hoaxes — where a quick, multi-angle sanity check is more useful than a single AI's confident-sounding guess.

## How it's built

Every model call goes through one function, [`meshChatCompletion()`](./mesh.mjs), which calls [Mesh API](https://meshapi.ai) — a single gateway to 1000+ models across providers, so the app needs one API key instead of five separate provider accounts. `server.mjs`'s `runFactCheck()` fans a claim out to the 5-model panel via `Promise.allSettled`, computes a majority-verdict consensus, and flags ties/disagreement explicitly instead of silently picking a winner.

A live **Mesh Activity Log** in the UI streams every request made — model, latency, tokens, and estimated cost — for full transparency into what each check actually costs and how long it takes.

## Stack

- Node.js + Express backend (`server.mjs`, `mesh.mjs`)
- Zero-build vanilla HTML/CSS/JS frontend (`public/`)
- Local JSON file for fact-check history (`data/history.json`, gitignored)

## Setup

```bash
npm install
cp .env.example .env   # add your Mesh API key (rsk_...)
npm start
```

Open http://localhost:8787

## API

- `POST /api/fact-check` `{ claim: string }` → runs the claim through the 5-model panel, returns per-model verdicts + consensus
- `GET /api/history` → last 20 fact-checks
- `GET /api/activity` → last 40 raw model API calls
- `GET /api/models` → the model panel in use
- `GET /api/leaderboard` → per-model stats aggregated from history — agreement rate with the group consensus, average confidence, and how often each model was the lone dissenter

## Model panel

| Model | Provider |
|---|---|
| `openai/gpt-4.1-nano` | OpenAI |
| `anthropic/claude-3-haiku` | Anthropic |
| `google/gemini-2.5-flash-lite` | Google |
| `deepseek/deepseek-chat-v3.1` | DeepSeek |
| `xai/grok-4.1-fast-non-reasoning` | xAI |

Picked for provider diversity + low cost, so a 5-way check stays cheap and fast enough for everyday use.
