import 'dotenv/config';
import express from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANEL_MODELS, meshChatCompletion, getActivityLog } from './mesh.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const MAX_HISTORY = 50;

const VERDICTS = ['True', 'False', 'Misleading', 'Unverifiable'];

const SYSTEM_PROMPT = `You are a rigorous, neutral fact-checking assistant.
Analyze the claim given by the user and judge its truthfulness using your own knowledge.
Respond with ONLY a single valid JSON object — no markdown, no code fences, no text outside the JSON.
Schema:
{
  "verdict": one of "True" | "False" | "Misleading" | "Unverifiable",
  "confidence": integer from 0 to 100,
  "reasoning": "2-4 sentence explanation, written in the same language as the claim",
  "key_points": ["short supporting point", "short supporting point"]
}`;

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const verdict = VERDICTS.find(
    (v) => v.toLowerCase() === String(parsed.verdict || '').toLowerCase()
  );
  if (!verdict) return null;
  const confidence = Number.isFinite(parsed.confidence)
    ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
    : null;
  return {
    verdict,
    confidence,
    reasoning: String(parsed.reasoning || '').slice(0, 1000),
    key_points: Array.isArray(parsed.key_points) ? parsed.key_points.slice(0, 6).map(String) : [],
  };
}

async function runFactCheck(claim) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: claim },
  ];

  const settled = await Promise.allSettled(
    PANEL_MODELS.map((m) => meshChatCompletion(m.id, messages))
  );

  const results = settled.map((outcome, i) => {
    const model = PANEL_MODELS[i];
    if (outcome.status !== 'fulfilled') {
      return { model: model.id, label: model.label, provider: model.provider, ok: false, error: outcome.reason?.message || 'request failed' };
    }
    const parsed = normalizeVerdict(extractJson(outcome.value.content));
    if (!parsed) {
      return { model: model.id, label: model.label, provider: model.provider, ok: false, error: 'could not parse model response' };
    }
    return {
      model: model.id,
      label: model.label,
      provider: model.provider,
      ok: true,
      latencyMs: outcome.value.latencyMs,
      usage: outcome.value.usage,
      ...parsed,
    };
  });

  const ok = results.filter((r) => r.ok);
  const tally = {};
  for (const r of ok) tally[r.verdict] = (tally[r.verdict] || 0) + 1;

  const tallyEntries = Object.entries(tally);
  const majorityCount = tallyEntries.length ? Math.max(...tallyEntries.map(([, c]) => c)) : 0;
  const topVerdicts = tallyEntries.filter(([, c]) => c === majorityCount).map(([v]) => v);
  const isTie = topVerdicts.length > 1;

  const consensus = {
    verdict: isTie ? null : topVerdicts[0] ?? null,
    isTie,
    tiedVerdicts: isTie ? topVerdicts : [],
    agreement: ok.length ? +(majorityCount / ok.length).toFixed(2) : 0,
    respondedCount: ok.length,
    totalModels: PANEL_MODELS.length,
    tally,
    disagreement: ok.length > 0 && (isTie || majorityCount < ok.length),
  };

  return { results, consensus };
}

async function loadHistory() {
  try {
    const raw = await readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveHistoryEntry(entry) {
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  const history = await loadHistory();
  history.unshift(entry);
  await writeFile(HISTORY_FILE, JSON.stringify(history.slice(0, MAX_HISTORY), null, 2));
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateBuckets = new Map();

// Each request fans out to 5 paid, metered Mesh calls — throttle per IP so a
// double-click (or a scripted judge test) can't silently burn through balance.
function rateLimitFactCheck(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: `Too many fact-checks — max ${RATE_LIMIT_MAX} per minute. Please wait a moment.` });
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  next();
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/models', (_req, res) => {
  res.json({ models: PANEL_MODELS });
});

app.post('/api/fact-check', rateLimitFactCheck, async (req, res) => {
  const claim = (req.body?.claim || '').trim();
  if (!claim) {
    return res.status(400).json({ error: 'claim is required' });
  }
  if (claim.length > 2000) {
    return res.status(400).json({ error: 'claim is too long (max 2000 chars)' });
  }

  try {
    const { results, consensus } = await runFactCheck(claim);
    const entry = { id: `fc_${Date.now()}`, claim, timestamp: new Date().toISOString(), results, consensus };
    await saveHistoryEntry(entry);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', async (_req, res) => {
  const history = await loadHistory();
  res.json({ history: history.slice(0, 20) });
});

app.get('/api/activity', (_req, res) => {
  res.json({ activity: getActivityLog().slice(0, 40) });
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`TruthMesh running at http://localhost:${port}`);
});
