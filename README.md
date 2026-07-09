# TruthMesh

A multi-model fact-checker built on [Mesh API](https://meshapi.ai) for the **Mesh API Hackathon 2026**.

Paste a claim, headline, or social post (Hindi or English) and TruthMesh routes it to **5 LLMs from 5 different providers** in parallel — OpenAI, Anthropic, Google, DeepSeek, and xAI — then shows each model's verdict side by side with a consensus score, so you can see where models agree and where (and why) they don't.

## Why this exists

Single-model fact-checks inherit a single model's blind spots. TruthMesh treats disagreement between models as signal, not noise: if 4/5 models call a claim false and one disagrees, that's more useful than a single confident-sounding answer.

## Track fit

- **Multi-model** (primary) — same prompt, 5 providers, live side-by-side comparison
- **Bharat** (secondary) — claims can be submitted and reasoned about in Hindi

## Every AI call routes through Mesh API

All model calls go through a single function, [`meshChatCompletion`](./mesh.mjs), which always hits `https://api.meshapi.ai/v1/chat/completions`. There is no direct call to any provider's SDK or API anywhere in this codebase. Every call is also logged to an in-memory activity log, visible live in the UI via the **"Mesh Activity Log"** drawer (top right) — showing the exact model, endpoint, latency, tokens, and estimated cost for each request.

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
- `GET /api/activity` → last 40 raw Mesh API calls (for judge visibility)
- `GET /api/models` → the model panel in use

## Model panel

| Model | Provider |
|---|---|
| `openai/gpt-4.1-nano` | OpenAI |
| `anthropic/claude-3-haiku` | Anthropic |
| `google/gemini-2.5-flash-lite` | Google |
| `deepseek/deepseek-chat-v3.1` | DeepSeek |
| `xai/grok-4.1-fast-non-reasoning` | xAI |

Picked for provider diversity + low cost, so a 5-way check stays cheap and fast enough for live demos.
