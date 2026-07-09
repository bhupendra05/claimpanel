const $ = (sel) => document.querySelector(sel);

const claimInput = $('#claimInput');
const checkBtn = $('#checkBtn');
const statusLine = $('#statusLine');
const consensusBox = $('#consensusBox');
const resultsGrid = $('#resultsGrid');
const historyList = $('#historyList');
const activityDrawer = $('#activityDrawer');
const activityList = $('#activityList');
const examplesEl = $('#examples');

let MODEL_PANEL = [];
async function loadModelPanel() {
  const res = await fetch('/api/models');
  const { models } = await res.json();
  MODEL_PANEL = models;
}

function renderSkeletons() {
  resultsGrid.innerHTML = MODEL_PANEL.map((m, i) => `
    <div class="model-card skeleton" style="animation-delay:${i * 70}ms">
      <div class="model-head">
        <div>
          <div class="model-name">${escapeHtml(m.label)}</div>
          <div class="model-provider">${escapeHtml(m.provider)} · thinking…</div>
        </div>
        <span class="badge-skeleton"></span>
      </div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `).join('');
}

const EXAMPLES = [
  'Drinking hot water with lemon every morning detoxifies the liver.',
  '5G towers are linked to increased health risks.',
  'भारत में हर साल 2 करोड़ इंजीनियरिंग ग्रेजुएट बनते हैं।',
  'The Great Wall of China is visible from space with the naked eye.',
];

function verdictClass(v) {
  return `v-${String(v || 'unverifiable').toLowerCase()}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderConsensus(consensus) {
  if (!consensus) {
    consensusBox.className = 'consensus-box hidden';
    return;
  }
  if (consensus.respondedCount === 0) {
    consensusBox.className = 'consensus-box v-false';
    consensusBox.innerHTML = `
      <div class="consensus-title">⚠ All ${consensus.totalModels} models failed to respond</div>
      <div class="consensus-sub">This usually means the Mesh API key has no balance left, or the models are temporarily unreachable. Open the Mesh Activity Log to see the exact error per model.</div>
    `;
    return;
  }
  if (!consensus.verdict) {
    consensusBox.className = 'consensus-box hidden';
    return;
  }
  consensusBox.className = `consensus-box ${verdictClass(consensus.verdict)}`;
  const pct = Math.round(consensus.agreement * 100);
  consensusBox.innerHTML = `
    <div class="consensus-title">Consensus: ${escapeHtml(consensus.verdict)}${consensus.disagreement ? ' (models disagree)' : ''}</div>
    <div class="consensus-sub">${consensus.respondedCount}/${consensus.totalModels} models responded ·
      ${pct}% agreement on the majority verdict ·
      breakdown: ${Object.entries(consensus.tally).map(([k, v]) => `${escapeHtml(k)} ${v}`).join(', ') || 'n/a'}
    </div>
  `;
}

function renderResults(results) {
  resultsGrid.innerHTML = results.map((r, i) => {
    const delay = `style="animation-delay:${i * 70}ms"`;
    if (!r.ok) {
      return `
        <div class="model-card err" ${delay}>
          <div class="model-head">
            <div>
              <div class="model-name">${escapeHtml(r.label)}</div>
              <div class="model-provider">${escapeHtml(r.provider)} · ${escapeHtml(r.model)}</div>
            </div>
          </div>
          <div class="model-reasoning">⚠ ${escapeHtml(r.error)}</div>
        </div>`;
    }
    const conf = r.confidence ?? 0;
    return `
      <div class="model-card" ${delay}>
        <div class="model-head">
          <div>
            <div class="model-name">${escapeHtml(r.label)}</div>
            <div class="model-provider">${escapeHtml(r.provider)} · ${escapeHtml(r.model)}</div>
          </div>
          <span class="badge ${verdictClass(r.verdict)}">${escapeHtml(r.verdict)}</span>
        </div>
        <div class="model-reasoning">${escapeHtml(r.reasoning || '')}</div>
        ${r.key_points?.length ? `<ul class="model-points">${r.key_points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
        <div class="confidence-bar"><div class="confidence-fill" style="width:${conf}%"></div></div>
        <div class="model-meta">
          <span>confidence ${conf}%</span>
          <span>${r.latencyMs ?? '?'}ms</span>
          <span>${(r.usage?.total_tokens) ?? '?'} tok</span>
        </div>
      </div>`;
  }).join('');
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const { history } = await res.json();
  historyList.innerHTML = history.map((h) => `
    <div class="history-item" data-id="${h.id}">
      <span class="history-claim">${escapeHtml(h.claim)}</span>
      <span class="badge ${verdictClass(h.consensus?.verdict)}">${escapeHtml(h.consensus?.verdict || '—')}</span>
    </div>
  `).join('') || '<div class="status-line">No checks yet.</div>';

  historyList.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => {
      const h = history.find((x) => x.id === el.dataset.id);
      if (!h) return;
      claimInput.value = h.claim;
      renderConsensus(h.consensus);
      renderResults(h.results);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

async function loadActivity() {
  const res = await fetch('/api/activity');
  const { activity } = await res.json();
  activityList.innerHTML = activity.map((a) => `
    <div class="activity-item ${a.status}">
      <div class="a-top"><span>${escapeHtml(a.model)}</span><span>${escapeHtml(a.status)}</span></div>
      <div class="a-meta">
        POST ${escapeHtml(a.endpoint)}<br/>
        ${a.latencyMs != null ? `${a.latencyMs}ms` : ''}
        ${a.promptTokens != null ? ` · ${a.promptTokens}+${a.completionTokens} tok` : ''}
        ${a.costUsd != null ? ` · $${a.costUsd}` : ''}
        ${a.error ? ` · ${escapeHtml(a.error)}` : ''}
      </div>
    </div>
  `).join('') || '<div class="status-line">No Mesh API calls yet.</div>';
}

async function checkClaim() {
  const claim = claimInput.value.trim();
  if (!claim) return;

  checkBtn.disabled = true;
  statusLine.classList.remove('hidden');
  statusLine.textContent = 'Routing your claim to 5 models via Mesh API…';
  consensusBox.className = 'consensus-box hidden';
  renderSkeletons();

  try {
    const res = await fetch('/api/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'request failed');

    statusLine.textContent = `Done · ${new Date(data.timestamp).toLocaleTimeString()}`;
    renderConsensus(data.consensus);
    renderResults(data.results);
    await Promise.all([loadHistory(), loadActivity()]);
  } catch (err) {
    statusLine.textContent = `Error: ${err.message}`;
  } finally {
    checkBtn.disabled = false;
  }
}

checkBtn.addEventListener('click', checkClaim);
claimInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) checkClaim();
});

examplesEl.innerHTML = EXAMPLES.map((e) => `<span class="example-chip">${e.length > 40 ? e.slice(0, 40) + '…' : e}</span>`).join('');
examplesEl.querySelectorAll('.example-chip').forEach((el, i) => {
  el.addEventListener('click', () => { claimInput.value = EXAMPLES[i]; });
});

$('#toggleActivity').addEventListener('click', () => activityDrawer.classList.toggle('hidden'));
$('#closeActivity').addEventListener('click', () => activityDrawer.classList.add('hidden'));
$('#openActivityInline').addEventListener('click', () => activityDrawer.classList.remove('hidden'));

const THEME_KEY = 'truthmesh-theme';
const themeToggle = $('#themeToggle');
function applyTheme(theme) {
  if (theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  } else {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(THEME_KEY);
  }
  themeToggle.textContent = theme === 'dark' ? '●' : theme === 'light' ? '○' : '◐';
}
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  applyTheme(current === 'dark' ? 'light' : current === 'light' ? null : 'dark');
});
applyTheme(localStorage.getItem(THEME_KEY));

loadModelPanel();
loadHistory();
loadActivity();
