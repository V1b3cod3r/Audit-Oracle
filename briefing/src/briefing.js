import { fetchAllFeeds } from './feeds.js';
import { curateArticles } from './claude.js';
import { saveBriefing, setRunning, getSettings } from './store.js';

export async function generateBriefing() {
  await setRunning(true);
  const startedAt = new Date().toISOString();
  try {
    const settings = await getSettings();
    console.log(`[briefing] fetching feeds at ${startedAt} (interests: ${settings.interests.length}, length: ${settings.summaryLength})`);
    const articles = await fetchAllFeeds();
    console.log(`[briefing] fetched ${articles.length} articles, curating...`);
    const curated = await curateArticles(articles, settings);
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
    };
    await saveBriefing(briefing);
    console.log(`[briefing] done: ${curated.length} articles, ${keyStories} key stories`);
    return briefing;
  } finally {
    await setRunning(false);
  }
}
