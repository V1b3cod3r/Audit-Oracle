import { fetchAllFeeds } from './feeds.js';
import { curateArticles } from './claude.js';
import { saveBriefing } from './store.js';

let running = false;

export async function generateBriefing() {
  if (running) throw new Error('Briefing generation already in progress');
  running = true;
  const startedAt = new Date().toISOString();
  try {
    console.log(`[briefing] fetching feeds at ${startedAt}`);
    const articles = await fetchAllFeeds();
    console.log(`[briefing] fetched ${articles.length} articles, curating...`);
    const curated = await curateArticles(articles);
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
    running = false;
  }
}

export function isRunning() {
  return running;
}
