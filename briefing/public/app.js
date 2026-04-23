const SAVED_KEY = 'briefing.saved.v1';

const state = {
  briefing: null,
  saved: loadSaved(),
  tab: 'today',
  refreshing: false,
  settings: { interests: [], summaryLength: 'short' },
  settingsDraft: null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); } catch {}
}

function savedSet() {
  return new Set(state.saved.map((a) => a.url));
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const BOOKMARK_OUTLINE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;
const BOOKMARK_FILLED = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;

function articleCard(article, savedUrls) {
  const isSaved = savedUrls.has(article.url);
  const rel = article.relevance || 3;
  const isKey = rel >= 4;
  const tags = (article.tags || []).slice(0, 3).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `
    <article class="article ${isKey ? 'key' : ''}" data-url="${escapeAttr(article.url)}">
      <div class="article-meta">
        <span class="source-chip">${escapeHtml(article.source)}</span>
        <span class="meta-dot"></span>
        <span>${escapeHtml(article.section)}</span>
        <span class="meta-dot"></span>
        <span>${relativeTime(article.publishedAt)}</span>
        <span class="relevance-pill">${rel}/5</span>
      </div>
      <h2 class="article-title">
        <a href="${escapeAttr(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>
      </h2>
      <p class="article-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${article.key_insight ? `
        <div class="article-insight">
          <span class="article-insight-label">Why it matters</span>
          ${escapeHtml(article.key_insight)}
        </div>` : ''}
      <div class="article-footer">
        <div class="article-tags">${tags}</div>
        <div class="article-actions">
          <span class="read-time">${article.read_time_minutes || '?'} min</span>
          <button class="save-btn ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Unsave' : 'Save'}">
            ${isSaved ? BOOKMARK_FILLED : BOOKMARK_OUTLINE}
          </button>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHtml;

function skeleton(n = 3) {
  return Array.from({ length: n }, () => `
    <div class="skeleton">
      <div class="skeleton-line w-30"></div>
      <div class="skeleton-line w-80"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  `).join('');
}

function renderStats() {
  const el = $('#stats');
  if (state.tab === 'saved') {
    el.innerHTML = `
      <div class="stat" style="grid-column: 1 / -1;">
        <div class="stat-label">Saved</div>
        <div class="stat-value">${state.saved.length}<span class="unit">articles</span></div>
      </div>
    `;
    return;
  }
  const b = state.briefing;
  if (!b) { el.innerHTML = ''; return; }
  const readTime = b.articles.reduce((s, a) => s + (a.read_time_minutes || 0), 0);
  el.innerHTML = `
    <div class="stat">
      <div class="stat-label">Articles</div>
      <div class="stat-value">${b.articleCount}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Key Stories</div>
      <div class="stat-value">${b.keyStories}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Read Time</div>
      <div class="stat-value">${readTime}<span class="unit">min</span></div>
    </div>
  `;
}

function renderContent() {
  const main = $('#content');
  const savedUrls = savedSet();

  if (state.tab === 'saved') {
    if (state.saved.length === 0) {
      main.innerHTML = `<div class="empty"><h2>Nothing saved</h2><p>Bookmark articles from today's briefing to read them later.</p></div>`;
      return;
    }
    main.innerHTML = state.saved.map((a) => articleCard(a, savedUrls)).join('');
    return;
  }

  if (state.refreshing && !state.briefing) {
    main.innerHTML = skeleton(4);
    return;
  }

  if (!state.briefing || state.briefing.articles.length === 0) {
    main.innerHTML = `<div class="empty"><h2>No briefing yet</h2><p>Tap refresh to generate today's briefing.</p></div>`;
    return;
  }

  const articles = state.briefing.articles;
  const top = articles.filter((a) => a.relevance >= 4);
  const rest = articles.filter((a) => a.relevance < 4);
  let html = '';
  if (top.length) {
    html += '<div class="section-label">Top Stories</div>';
    html += top.map((a) => articleCard(a, savedUrls)).join('');
  }
  if (rest.length) {
    html += '<div class="section-label">Also Noted</div>';
    html += rest.map((a) => articleCard(a, savedUrls)).join('');
  }
  main.innerHTML = html;
}

function moveIndicator() {
  const active = $('.tab.active');
  const indicator = $('.tab-indicator');
  if (!active || !indicator) return;
  indicator.style.width = `${active.offsetWidth}px`;
  indicator.style.transform = `translateX(${active.offsetLeft - 4}px)`;
}

function render() {
  $('#today-date').textContent = formatDate(new Date().toISOString());
  $('#generated-at').textContent = state.briefing
    ? `Updated ${formatTime(state.briefing.generatedAt)}`
    : 'No briefing yet';
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const btn = $('#refresh-btn');
  btn.disabled = state.refreshing;
  btn.classList.toggle('spinning', state.refreshing);
  renderStats();
  renderContent();
  requestAnimationFrame(moveIndicator);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

async function loadBriefing() {
  try {
    const res = await fetch('/api/briefing');
    const data = await res.json();
    state.briefing = data.briefing;
    state.refreshing = !!data.running;
  } catch (err) {
    console.error(err);
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    state.settings = await res.json();
  } catch (err) {
    console.error(err);
  }
}

async function saveSettingsApi(settings) {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  state.settings = await res.json();
}

function openSettings() {
  state.settingsDraft = {
    interests: [...state.settings.interests],
    summaryLength: state.settings.summaryLength,
  };
  $('#interests-input').value = state.settingsDraft.interests.join('\n');
  $$('#length-segment .segment-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.val === state.settingsDraft.summaryLength);
  });
  $('#settings-modal').classList.add('open');
  $('#settings-modal').setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  $('#settings-modal').classList.remove('open');
  $('#settings-modal').setAttribute('aria-hidden', 'true');
  state.settingsDraft = null;
}

async function commitSettings() {
  const interests = $('#interests-input').value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const active = $('#length-segment .segment-btn.active');
  const summaryLength = active?.dataset.val || 'short';

  if (interests.length === 0) {
    toast('Add at least one interest');
    return;
  }

  const saveBtn = $('#settings-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    await saveSettingsApi({ interests, summaryLength });
    closeSettings();
    toast('Preferences saved');
    await refresh();
  } catch (err) {
    console.error(err);
    toast('Save failed');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save & regenerate';
  }
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  render();
  try {
    const res = await fetch('/api/briefing/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('refresh failed');
    toast('Refreshing briefing…');
    pollUntilDone();
  } catch (err) {
    console.error(err);
    toast('Refresh failed');
    state.refreshing = false;
    render();
  }
}

function pollUntilDone() {
  const iv = setInterval(async () => {
    await loadBriefing();
    render();
    if (!state.refreshing) {
      clearInterval(iv);
      if (state.briefing) toast(`Briefing ready · ${state.briefing.articleCount} articles`);
    }
  }, 4000);
}

function toggleSave(url) {
  const urls = savedSet();
  if (urls.has(url)) {
    state.saved = state.saved.filter((a) => a.url !== url);
    toast('Removed');
  } else {
    const article = state.briefing?.articles.find((a) => a.url === url)
      || state.saved.find((a) => a.url === url);
    if (!article) return;
    state.saved = [{ ...article, savedAt: new Date().toISOString() }, ...state.saved];
    toast('Saved');
  }
  persistSaved();
  render();
}

function bind() {
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });
  $('#refresh-btn').addEventListener('click', refresh);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-cancel').addEventListener('click', closeSettings);
  $('#settings-save').addEventListener('click', commitSettings);
  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettings();
  });
  $$('#length-segment .segment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('#length-segment .segment-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#settings-modal').classList.contains('open')) closeSettings();
  });
  document.addEventListener('click', (e) => {
    const save = e.target.closest('.save-btn');
    if (save) {
      const url = save.closest('.article')?.dataset.url;
      if (url) toggleSave(url);
    }
  });
  window.addEventListener('resize', moveIndicator);
}

async function init() {
  bind();
  render();
  await Promise.all([loadBriefing(), loadSettings()]);
  render();
  if (state.refreshing) pollUntilDone();
}

init();
