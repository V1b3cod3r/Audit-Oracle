const state = {
  briefing: null,
  saved: [],
  tab: 'today',
  refreshing: false,
};

const $ = (sel) => document.querySelector(sel);

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function savedSet() {
  return new Set(state.saved.map((a) => a.url));
}

function articleRow(article, savedUrls) {
  const isSaved = savedUrls.has(article.url);
  const rel = article.relevance || 3;
  const tags = (article.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
  return `
    <article class="article">
      <div class="relevance-badge relevance-${rel}">${rel}</div>
      <div class="article-body">
        <div class="article-meta">
          <span class="source">${article.source}</span>
          <span class="dot"></span>
          <span>${article.section}</span>
          <span class="dot"></span>
          <span>${relativeTime(article.publishedAt)}</span>
        </div>
        <h2 class="article-title">
          <a href="${article.url}" target="_blank" rel="noopener">${article.title}</a>
        </h2>
        <p class="article-summary">${article.summary || article.excerpt || ''}</p>
        ${article.key_insight ? `<p class="article-insight">${article.key_insight}</p>` : ''}
        ${tags ? `<div class="article-tags">${tags}</div>` : ''}
      </div>
      <div class="article-actions">
        <span class="read-time">${article.read_time_minutes || '?'} min</span>
        <button class="save-btn ${isSaved ? 'saved' : ''}" data-url="${article.url}">
          ${isSaved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  `;
}

function renderStats() {
  const el = $('#stats');
  if (state.tab === 'saved') {
    el.innerHTML = `
      <div class="stat">
        <div class="stat-label">Saved for Later</div>
        <div class="stat-value">${state.saved.length}<span class="unit">articles</span></div>
      </div>
    `;
    return;
  }
  const b = state.briefing;
  if (!b) { el.innerHTML = ''; return; }
  const totalReadTime = b.articles.reduce((sum, a) => sum + (a.read_time_minutes || 0), 0);
  el.innerHTML = `
    <div class="stat">
      <div class="stat-label">Articles Curated</div>
      <div class="stat-value">${b.articleCount}<span class="unit">total</span></div>
    </div>
    <div class="stat">
      <div class="stat-label">Key Stories</div>
      <div class="stat-value">${b.keyStories}<span class="unit">must-read</span></div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Read Time</div>
      <div class="stat-value">${totalReadTime}<span class="unit">minutes</span></div>
    </div>
    <div class="stat">
      <div class="stat-label">Generated</div>
      <div class="stat-value" style="font-size: 18px; padding-top: 10px;">${formatTime(b.generatedAt)}</div>
    </div>
  `;
}

function renderContent() {
  const main = $('#content');
  const savedUrls = savedSet();

  if (state.tab === 'saved') {
    if (state.saved.length === 0) {
      main.innerHTML = `<div class="empty"><h2>Nothing saved</h2><p>Save articles from today's briefing to read them later.</p></div>`;
      return;
    }
    main.innerHTML = state.saved.map((a) => articleRow(a, savedUrls)).join('');
    return;
  }

  if (state.refreshing && !state.briefing) {
    main.innerHTML = `<div class="loading-bar"></div><div class="empty"><h2>Curating</h2><p>Fetching feeds and scoring articles…</p></div>`;
    return;
  }

  if (!state.briefing || state.briefing.articles.length === 0) {
    main.innerHTML = `<div class="empty"><h2>No briefing yet</h2><p>Hit "Refresh Briefing" to generate one.</p></div>`;
    return;
  }

  const articles = state.briefing.articles;
  const topStories = articles.filter((a) => a.relevance >= 4);
  const rest = articles.filter((a) => a.relevance < 4);
  let html = '';
  if (state.refreshing) html += '<div class="loading-bar"></div>';
  if (topStories.length) {
    html += '<div class="section-label">Top Stories</div>';
    html += topStories.map((a) => articleRow(a, savedUrls)).join('');
  }
  if (rest.length) {
    html += '<div class="section-label">Also Noted</div>';
    html += rest.map((a) => articleRow(a, savedUrls)).join('');
  }
  main.innerHTML = html;
}

function render() {
  $('#today-date').textContent = formatDate(new Date().toISOString());
  $('#generated-at').textContent = state.briefing
    ? `Generated ${formatTime(state.briefing.generatedAt)}`
    : 'Awaiting first briefing';
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.tab);
  });
  $('#refresh-btn').disabled = state.refreshing;
  $('#refresh-btn').textContent = state.refreshing ? 'Refreshing…' : 'Refresh Briefing';
  renderStats();
  renderContent();
}

async function loadBriefing() {
  const res = await fetch('/api/briefing');
  const data = await res.json();
  state.briefing = data.briefing;
  state.refreshing = !!data.running;
}

async function loadSaved() {
  const res = await fetch('/api/saved');
  state.saved = await res.json();
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  render();
  try {
    await fetch('/api/briefing/refresh', { method: 'POST' });
  } catch (err) {
    console.error(err);
    state.refreshing = false;
    render();
    return;
  }
  pollUntilDone();
}

async function pollUntilDone() {
  const interval = setInterval(async () => {
    await loadBriefing();
    render();
    if (!state.refreshing) clearInterval(interval);
  }, 3000);
}

async function toggleSave(url) {
  const isSaved = savedSet().has(url);
  if (isSaved) {
    const res = await fetch('/api/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    state.saved = await res.json();
  } else {
    const article = state.briefing?.articles.find((a) => a.url === url);
    if (!article) return;
    const res = await fetch('/api/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article }),
    });
    state.saved = await res.json();
  }
  render();
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });
  $('#refresh-btn').addEventListener('click', refresh);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.save-btn');
    if (btn) toggleSave(btn.dataset.url);
  });
}

async function init() {
  bindEvents();
  await Promise.all([loadBriefing(), loadSaved()]);
  render();
  if (state.refreshing) pollUntilDone();
}

init();
