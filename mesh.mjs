import 'dotenv/config';

const MESH_BASE_URL = 'https://api.meshapi.ai/v1';
const MESH_API_KEY = process.env.MESH_API_KEY;

if (!MESH_API_KEY) {
  throw new Error('MESH_API_KEY is not set. Copy .env.example to .env and add your key.');
}

// Five models spanning five different providers — the core of the "Multi-model" pitch.
// Picked for low cost + fast response so a 5-way fact-check stays cheap and quick.
export const PANEL_MODELS = [
  { id: 'openai/gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'OpenAI' },
  { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'Google' },
  { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat v3.1', provider: 'DeepSeek' },
  { id: 'xai/grok-4.1-fast-non-reasoning', label: 'Grok 4.1 Fast', provider: 'xAI' },
];

// $ per 1M tokens, for a live cost estimate in the UI (from Mesh's /v1/models catalog).
const PRICING_PER_1M = {
  'openai/gpt-4.1-nano': { prompt: 0.10, completion: 0.40 },
  'anthropic/claude-3-haiku': { prompt: 0.25, completion: 1.25 },
  'google/gemini-2.5-flash-lite': { prompt: 0.10, completion: 0.40 },
  'deepseek/deepseek-chat-v3.1': { prompt: 0.21, completion: 0.79 },
  'xai/grok-4.1-fast-non-reasoning': { prompt: 0.20, completion: 0.50 },
};

// Ring buffer of every Mesh API call this process has made — every AI call in this
// app flows through meshChatCompletion(), so this log doubles as proof-of-routing for judges.
const activityLog = [];
const MAX_LOG = 200;
let callCounter = 0;

export function getActivityLog() {
  return activityLog;
}

function estimateCost(model, usage) {
  const rate = PRICING_PER_1M[model];
  if (!rate || !usage) return null;
  const promptCost = (usage.prompt_tokens || 0) * (rate.prompt / 1_000_000);
  const completionCost = (usage.completion_tokens || 0) * (rate.completion / 1_000_000);
  return +(promptCost + completionCost).toFixed(6);
}

export async function meshChatCompletion(model, messages, { temperature = 0.2, maxTokens = 400 } = {}) {
  const id = `call_${++callCounter}`;
  const startedAt = Date.now();
  const entry = {
    id,
    model,
    startedAt,
    endpoint: `${MESH_BASE_URL}/chat/completions`,
    status: 'pending',
  };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG) activityLog.length = MAX_LOG;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    const res = await fetch(`${MESH_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MESH_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const latencyMs = Date.now() - startedAt;
    const json = await res.json();

    if (!res.ok) {
      entry.status = 'error';
      entry.latencyMs = latencyMs;
      entry.error = json?.error?.message || `HTTP ${res.status}`;
      throw new Error(entry.error);
    }

    const content = json.choices?.[0]?.message?.content ?? '';
    const usage = json.usage;

    entry.status = 'ok';
    entry.latencyMs = latencyMs;
    entry.promptTokens = usage?.prompt_tokens;
    entry.completionTokens = usage?.completion_tokens;
    entry.costUsd = estimateCost(model, usage);

    return { content, usage, latencyMs, raw: json };
  } catch (err) {
    entry.status = entry.status === 'pending' ? 'error' : entry.status;
    entry.latencyMs = entry.latencyMs ?? Date.now() - startedAt;
    entry.error = entry.error || err.message;
    throw err;
  }
}
