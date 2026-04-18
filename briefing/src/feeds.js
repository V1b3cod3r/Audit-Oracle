import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'MorningBriefing/1.0 (+https://audit-oracle.local)',
    'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  },
});

export const FEEDS = [
  { source: 'WSJ', section: 'Technology', url: 'https://feeds.content.dowjones.io/public/rss/RSSWSJD' },
  { source: 'WSJ', section: 'Markets', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain' },
  { source: 'WSJ', section: 'World', url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews' },
  { source: 'WSJ', section: 'Opinion', url: 'https://feeds.content.dowjones.io/public/rss/RSSOpinion' },
  { source: 'FT', section: 'Home', url: 'https://www.ft.com/rss/home' },
  { source: 'FT', section: 'World', url: 'https://www.ft.com/world?format=rss' },
  { source: 'FT', section: 'Companies', url: 'https://www.ft.com/companies?format=rss' },
  { source: 'Economist', section: 'Business', url: 'https://www.economist.com/business/rss.xml' },
  { source: 'Economist', section: 'Finance', url: 'https://www.economist.com/finance-and-economics/rss.xml' },
  { source: 'Economist', section: 'Leaders', url: 'https://www.economist.com/leaders/rss.xml' },
];

const MAX_PER_FEED = parseInt(process.env.MAX_ARTICLES_PER_FEED || '15', 10);

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExcerpt(item) {
  const candidates = [
    item['content:encoded'],
    item.content,
    item.contentSnippet,
    item.summary,
    item.description,
  ].filter(Boolean);
  if (candidates.length === 0) return '';
  return stripHtml(candidates[0]).slice(0, 2000);
}

function normalize(item, feed) {
  const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
  const excerpt = extractExcerpt(item);
  return {
    id: `${feed.source}:${item.guid || item.link || item.title}`,
    source: feed.source,
    section: feed.section,
    title: (item.title || '').trim(),
    url: item.link,
    publishedAt,
    excerpt,
    content: excerpt,
  };
}

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const items = (parsed.items || []).slice(0, MAX_PER_FEED);
    return items.map((item) => normalize(item, feed));
  } catch (err) {
    console.warn(`[feeds] Failed ${feed.source}/${feed.section}: ${err.message}`);
    return [];
  }
}

export async function fetchAllFeeds() {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const flat = results.flat();
  const seen = new Set();
  const deduped = [];
  for (const article of flat) {
    if (!article.url || seen.has(article.url)) continue;
    seen.add(article.url);
    deduped.push(article);
  }
  const cutoff = Date.now() - 1000 * 60 * 60 * 36;
  return deduped.filter((a) => {
    const ts = Date.parse(a.publishedAt);
    return Number.isNaN(ts) || ts >= cutoff;
  });
}
