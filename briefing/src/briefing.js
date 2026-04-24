import { fetchAllFeeds } from './feeds.js';
import { triageArticles, curateArticles, runCost } from './claude.js';
import { saveBriefing, setRunning, getSettings, getSeenUrls, addSeenUrls } from './store.js';

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

const FULL_CURATE_THRESHOLD = 3;
const MIN_KEEP_RELEVANCE = 2;

export async function generateBriefing() {
  await setRunning(true);
  const startedAt = new Date().toISOString();
  try {
    const settings = await getSettings();
    console.log(`[briefing] started ${startedAt} (interests: ${settings.interests.length}, length: ${settings.summaryLength})`);

    const fetched = await fetchAllFeeds();
    const seen = await getSeenUrls();
    const fresh = fetched.filter((a) => !seen.has(a.url));
    const filtered = prefilter(fresh, settings.interests);
    console.log(`[briefing] fetched ${fetched.length} → ${fresh.length} fresh → ${filtered.length} matched prefilter`);

    const { articles: triaged, usage: triageUsage } = await triageArticles(filtered, settings);
    const toCurate = triaged.filter((a) => a.relevance >= FULL_CURATE_THRESHOLD);
    const minimal = triaged.filter((a) => a.relevance === MIN_KEEP_RELEVANCE);
    console.log(`[briefing] triage scored ${triaged.length} → ${toCurate.length} fully curated, ${minimal.length} kept minimal`);

    const { articles: curated, usage: curateUsage } = await curateArticles(toCurate, settings);

    const all = [...curated, ...minimal];
    all.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });

    const cost = runCost([triageUsage, curateUsage]);
    const keyStories = all.filter((a) => a.relevance >= 4).length;
    const briefing = {
      generatedAt: new Date().toISOString(),
      articleCount: all.length,
      keyStories,
      articles: all,
      stats: {
        fetched: fetched.length,
        fresh: fresh.length,
        prefiltered: filtered.length,
        triaged: triaged.length,
        fullyCurated: curated.length,
        keptMinimal: minimal.length,
        droppedAsSeen: fetched.length - fresh.length,
        ...cost,
      },
    };

    await saveBriefing(briefing);
    await addSeenUrls(filtered.map((a) => a.url));

    const costStr = cost.estimatedCost != null ? ` (~$${cost.estimatedCost.toFixed(4)})` : '';
    console.log(`[briefing] done: ${all.length} articles, ${keyStories} key stories${costStr}`);
    return briefing;
  } finally {
    await setRunning(false);
  }
}
