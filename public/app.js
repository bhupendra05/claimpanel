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

const EXAMPLES = [
  'Drinking hot water with lemon every morning detoxifies the liver.',
  '5G towers are linked to increased health risks.',
  'भारत में हर साल 2 करोड़ इंजीनियरिंग ग्रेजुएट बनते हैं।',
  'The Great Wall of China is visible from space with the naked eye.',
];

function verdictClass(v) {
  return `v-${String(v || 'unverifiable').toLowerCase()}`;
}

function renderConsensus(consensus) {
  if (!consensus || !consensus.verdict) {
    consensusBox.className = 'consensus-box hidden';
    return;
  }
  consensusBox.className = `consensus-box ${verdictClass(consensus.verdict)}`;
  const pct = Math.round(consensus.agreement * 100);
  consensusBox.innerHTML = `
    <div class="consensus-title">Consensus: ${consensus.verdict}${consensus.disagreement ? ' (models disagree)' : ''}</div>
    <div class="consensus-sub">${consensus.respondedCount}/${consensus.totalModels} models responded ·
      ${pct}% agreement on the majority verdict ·
      breakdown: ${Object.entries(consensus.tally).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'}
    </div>
  `;
}

function renderResults(results) {
  resultsGrid.innerHTML = results.map((r) => {
    if (!r.ok) {
      return `
        <div class="model-card err">
          <div class="model-head">
            <div>
              <div class="model-name">${r.label}</div>
              <div class="model-provider">${r.provider} · ${r.model}</div>
            </div>
          </div>
          <div class="model-reasoning">⚠ ${r.error}</div>
        </div>`;
    }
    const conf = r.confidence ?? 0;
    return `
      <div class="model-card">
        <div class="model-head">
          <div>
            <div class="model-name">${r.label}</div>
            <div class="model-provider">${r.provider} · ${r.model}</div>
          </div>
          <span class="badge ${verdictClass(r.verdict)}">${r.verdict}</span>
        </div>
        <div class="model-reasoning">${r.reasoning || ''}</div>
        ${r.key_points?.length ? `<ul class="model-points">${r.key_points.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
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
      <span class="history-claim">${h.claim}</span>
      <span class="badge ${verdictClass(h.consensus?.verdict)}">${h.consensus?.verdict || '—'}</span>
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
      <div class="a-top"><span>${a.model}</span><span>${a.status}</span></div>
      <div class="a-meta">
        POST ${a.endpoint}<br/>
        ${a.latencyMs != null ? `${a.latencyMs}ms` : ''}
        ${a.promptTokens != null ? ` · ${a.promptTokens}+${a.completionTokens} tok` : ''}
        ${a.costUsd != null ? ` · $${a.costUsd}` : ''}
        ${a.error ? ` · ${a.error}` : ''}
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
  resultsGrid.innerHTML = '';

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

loadHistory();
loadActivity();
