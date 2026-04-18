import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

const INTERESTS = [
  'AI policy & regulation',
  'Federal Reserve & monetary policy',
  'Prediction markets & trading',
  'Tech & startup news',
  'Market volatility & financial markets',
];

const SYSTEM_PROMPT = `You are a sharp morning-briefing editor. Your reader is a finance- and tech-literate professional who wants signal, not noise.

Their interests, in priority order:
${INTERESTS.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

For each article you score:
- Summary: 2-3 tight sentences. State the news, not the framing. No throat-clearing.
- Key insight: one sentence on why it matters — the second-order implication, not a restatement.
- Read time: whole minutes, based on ~225 wpm of the full article (estimate from excerpt length and topic depth).
- Relevance: 1 (skip) to 5 (must-read). Score against the interests above. Generic macro headlines without a clear tie-in are 2 at best.

Tone: direct, professional, readable. No hype. No "in a world where". No "this could mean".`;

const CLASSIFY_TOOL = {
  name: 'classify_article',
  description: 'Produce the curated briefing entry for a single article.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '2-3 sentence summary of the article. Direct, no fluff.',
      },
      key_insight: {
        type: 'string',
        description: 'One sentence on why it matters — the implication, not a restatement.',
      },
      read_time_minutes: {
        type: 'integer',
        minimum: 1,
        maximum: 30,
        description: 'Estimated reading time in whole minutes.',
      },
      relevance: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: 'Relevance to the reader interests. 5 = must-read, 1 = skip.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short topic tags (lowercase, 1-3 words each).',
      },
    },
    required: ['summary', 'key_insight', 'read_time_minutes', 'relevance', 'tags'],
  },
};

async function curateOne(article) {
  const userContent = `Source: ${article.source} — ${article.section}
Headline: ${article.title}
Published: ${article.publishedAt}
URL: ${article.url}

Excerpt:
${article.excerpt || '(no excerpt available)'}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_article' },
    messages: [{ role: 'user', content: userContent }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use block in response');
  return toolUse.input;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { __error: err.message };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function curateArticles(articles) {
  const concurrency = parseInt(process.env.CURATION_CONCURRENCY || '4', 10);
  const curations = await mapLimit(articles, concurrency, curateOne);
  const enriched = [];
  for (let i = 0; i < articles.length; i++) {
    const c = curations[i];
    if (!c || c.__error) {
      console.warn(`[claude] curation failed for "${articles[i].title}": ${c?.__error || 'unknown'}`);
      continue;
    }
    enriched.push({ ...articles[i], ...c });
  }
  return enriched;
}
