import { fetchAllFeeds } from './feeds.js';
import { curateArticles } from './claude.js';
import { saveBriefing, setRunning, getSettings } from './store.js';

const STOPWORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'about', 'as', 'is', 'it', 'its', '&',
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordMatchers(interests) {
  const tokens = new Set();
  for (const interest of interests) {
    for (const raw of interest.toLowerCase().split(/[\s,/&–—-]+/)) {
      const word = raw.trim();
      if (word.length >= 3 && !STOPWORDS.has(word)) tokens.add(word);
    }
  }
  return [...tokens].map((t) => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i'));
}

function prefilter(articles, interests) {
  const matchers = buildKeywordMatchers(interests);
  if (matchers.length === 0) return articles;
  return articles.filter((a) => {
    const text = `${a.title} ${a.excerpt || ''}`;
    return matchers.some((rx) => rx.test(text));
  });
}

export async function generateBriefing() {
  await setRunning(true);
  const startedAt = new Date().toISOString();
  try {
    const settings = await getSettings();
    console.log(`[briefing] fetching feeds at ${startedAt} (interests: ${settings.interests.length}, length: ${settings.summaryLength})`);
    const all = await fetchAllFeeds();
    const filtered = prefilter(all, settings.interests);
    const dropped = all.length - filtered.length;
    console.log(`[briefing] fetched ${all.length}, ${filtered.length} matched prefilter (${dropped} dropped), curating...`);
    const { articles: curated, usage, estimatedCost, model } = await curateArticles(filtered, settings);
    curated.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });
    const keyStories = curated.filter((a) => a.relevance >= 4).length;
    const briefing = {
      generatedAt: new Date().toISOString(),
      articleCount: curated.length,
      keyStories,
      articles: curated,
      stats: {
        fetched: all.length,
        prefiltered: filtered.length,
        curated: curated.length,
        dropped,
        model,
        usage,
        estimatedCost,
      },
    };
    await saveBriefing(briefing);
    const costStr = estimatedCost != null ? ` (~$${estimatedCost.toFixed(4)})` : '';
    console.log(`[briefing] done: ${curated.length} articles, ${keyStories} key stories${costStr}`);
    return briefing;
  } finally {
    await setRunning(false);
  }
}
