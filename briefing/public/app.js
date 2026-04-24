const SAVED_KEY = 'briefing.saved.v1';

const state = {
  briefing: null,
  saved: loadSaved(),
  tab: 'today',
  refreshing: false,
  settings: { interests: [], summaryLength: 'short' },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch { return []; }
}
function persistSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); } catch {}
}
function savedSet() {
  return new Set(state.saved.map((a) => a.url));
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHtml;

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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

const BOOKMARK_OUTLINE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;
const BOOKMARK_FILLED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>`;

function articleCard(article, savedUrls, { hero = false } = {}) {
  const isSaved = savedUrls.has(article.url);
  return `
    <article class="card ${hero ? 'hero-card' : ''}" data-url="${escapeAttr(article.url)}">
      <div class="card-meta">
        <span class="source">${escapeHtml(article.source)}</span>
        <span class="meta-sep">·</span>
        <span>${escapeHtml(article.section)}</span>
        <span class="meta-sep">·</span>
        <span>${relativeTime(article.publishedAt)}</span>
      </div>
      <h2 class="card-title">
        <a href="${escapeAttr(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>
      </h2>
      <p class="card-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${article.key_insight ? `
        <div class="insight">
          <span class="insight-label">Why it matters</span>
          <div class="insight-body">${escapeHtml(article.key_insight)}</div>
        </div>` : ''}
      <div class="card-footer">
        <span class="read-time">${article.read_time_minutes ? `${article.read_time_minutes} min` : ''}</span>
        <div class="card-actions">
          <button class="save-btn ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Unsave' : 'Save'}">
            ${isSaved ? BOOKMARK_FILLED : BOOKMARK_OUTLINE}
          </button>
        </div>
      </div>
    </article>
  `;
}

function skeleton(n = 3) {
  return Array.from({ length: n }, () => `
    <div class="skeleton">
      <div class="skeleton-line w-30"></div>
      <div class="skeleton-line w-80"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  `).join('');
}

function renderHero() {
  const kicker = $('#kicker');
  const title = $('#display-title');
  const sub = $('#subhead');

  if (state.tab === 'saved') {
    kicker.textContent = 'Library';
    title.textContent = 'Saved';
    sub.textContent = state.saved.length
      ? `${state.saved.length} article${state.saved.length === 1 ? '' : 's'} set aside.`
      : 'Nothing set aside yet.';
    return;
  }

  kicker.textContent = formatDate(new Date().toISOString());
  title.textContent = 'Briefing';
  sub.textContent = state.briefing
    ? `Updated ${formatTime(state.briefing.generatedAt)} · ${state.briefing.articleCount} article${state.briefing.articleCount === 1 ? '' : 's'}`
    : 'Tap refresh for today’s briefing.';
}

function renderMetrics() {
  const el = $('#metrics');
  if (state.tab === 'saved' || !state.briefing) { el.innerHTML = ''; return; }
  const b = state.briefing;
  const readTime = b.articles.reduce((s, a) => s + (a.read_time_minutes || 0), 0);
  const cost = b.stats?.estimatedCost;
  const costLabel = cost != null ? `$${cost.toFixed(3)}` : '—';
  el.innerHTML = `
    <div class="metric">
      <div class="metric-label">Articles</div>
      <div class="metric-value">${b.articleCount}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Must-read</div>
      <div class="metric-value">${b.keyStories}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Read time</div>
      <div class="metric-value">${readTime}<span class="unit">m</span></div>
    </div>
    <div class="metric">
      <div class="metric-label">Run cost</div>
      <div class="metric-value">${costLabel}</div>
    </div>
  `;
}

function renderContent() {
  const main = $('#content');
  const savedUrls = savedSet();

  if (state.tab === 'saved') {
    if (state.saved.length === 0) {
      main.innerHTML = `<div class="empty"><h2>Nothing saved yet</h2><p>Bookmark stories from today’s briefing to read them later.</p></div>`;
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
    main.innerHTML = `<div class="empty"><h2>No briefing yet</h2><p>Tap the refresh button to generate today’s edition.</p></div>`;
    return;
  }

  const articles = state.briefing.articles;
  const top = articles.filter((a) => a.relevance >= 4);
  const rest = articles.filter((a) => a.relevance < 4);

  let html = '';
  if (top.length) {
    const [hero, ...others] = top;
    html += '<div class="section-head">Lead Story</div>';
    html += articleCard(hero, savedUrls, { hero: true });
    if (others.length) {
      html += '<div class="section-head">Also Essential</div>';
      html += others.map((a) => articleCard(a, savedUrls)).join('');
    }
  }
  if (rest.length) {
    html += '<div class="section-head">Also Noted</div>';
    html += rest.map((a) => articleCard(a, savedUrls)).join('');
  }
  main.innerHTML = html;
}

function moveSegThumb() {
  const active = $('.seg.active');
  const thumb = $('.seg-thumb');
  if (!active || !thumb) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 2}px)`;
}

function render() {
  $$('.seg').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const refresh = $('#refresh-btn');
  refresh.disabled = state.refreshing;
  refresh.classList.toggle('spinning', state.refreshing);
  renderHero();
  renderMetrics();
  renderContent();
  requestAnimationFrame(moveSegThumb);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function loadBriefing() {
  try {
    const res = await fetch('/api/briefing');
    const data = await res.json();
    state.briefing = data.briefing;
    state.refreshing = !!data.running;
  } catch (err) { console.error(err); }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    state.settings = await res.json();
  } catch (err) { console.error(err); }
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

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  render();
  try {
    const res = await fetch('/api/briefing/refresh', { method: 'POST' });
    if (!res.ok) throw new Error('refresh failed');
    toast('Curating…');
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
      if (state.briefing) toast(`Ready · ${state.briefing.articleCount} articles`);
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

/* ---- Settings sheet ---- */

function openSettings() {
  $('#interests-input').value = (state.settings.interests || []).join('\n');
  $$('.option').forEach((b) => b.classList.toggle('active', b.dataset.val === state.settings.summaryLength));
  $('#settings-modal').classList.add('open');
  $('#settings-modal').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  $('#settings-modal').classList.remove('open');
  $('#settings-modal').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function commitSettings() {
  const interests = $('#interests-input').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const active = $('.option.active');
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
    toast('Saved');
    await refresh();
  } catch (err) {
    console.error(err);
    toast('Save failed');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

/* ---- Scroll-aware chrome ---- */

function onScroll() {
  const y = window.scrollY;
  const chrome = $('.chrome');
  chrome.classList.toggle('scrolled', y > 8);
  chrome.classList.toggle('show-title', y > 80);
}

function bind() {
  $$('.seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });
  $('#refresh-btn').addEventListener('click', refresh);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#settings-cancel').addEventListener('click', closeSettings);
  $('#settings-save').addEventListener('click', commitSettings);
  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettings();
  });
  $$('.option').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#settings-modal').classList.contains('open')) closeSettings();
  });
  document.addEventListener('click', (e) => {
    const save = e.target.closest('.save-btn');
    if (save) {
      const url = save.closest('.card')?.dataset.url;
      if (url) toggleSave(url);
    }
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', moveSegThumb);
}

async function init() {
  bind();
  render();
  onScroll();
  await Promise.all([loadBriefing(), loadSettings()]);
  render();
  if (state.refreshing) pollUntilDone();
}

init();
