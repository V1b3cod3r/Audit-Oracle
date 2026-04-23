import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const EXCERPT_LIMIT = parseInt(process.env.EXCERPT_CHARS || '800', 10);

const SUMMARY_PROFILES = {
  short:  { instr: '2-3 tight sentences.',                desc: '2-3 sentence summary.',                                                            tokens: 1024 },
  medium: { instr: '4-5 sentences, one short paragraph.', desc: '4-5 sentence summary covering what happened, the key numbers, and context.',       tokens: 1600 },
  long:   { instr: '6-8 sentences, 2 short paragraphs.',  desc: '6-8 sentence summary: what happened, the key numbers, the context, and who is affected.', tokens: 2400 },
};

function buildPrompt(settings) {
  const profile = SUMMARY_PROFILES[settings.summaryLength] || SUMMARY_PROFILES.short;
  const systemPrompt = `You are a sharp morning-briefing editor. Your reader is a finance- and tech-literate professional who wants signal, not noise.

Their interests, in priority order:
${settings.interests.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

For each article you score:
- Summary: ${profile.instr} State the news, not the framing. No throat-clearing.
- Key insight: one sentence on why it matters — the second-order implication, not a restatement.
- Read time: whole minutes, based on ~225 wpm of the full article (estimate from excerpt length and topic depth).
- Relevance: 1 (skip) to 5 (must-read). Score against the interests above — articles matching the top interests should score 4 or 5. Generic macro headlines without a clear tie-in are 2 at best.

Tone: direct, professional, readable. No hype. No "in a world where". No "this could mean".`;

  const tool = {
    name: 'classify_article',
    description: 'Produce the curated briefing entry for a single article.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: profile.desc },
        key_insight: { type: 'string', description: 'One sentence on why it matters — the implication, not a restatement.' },
        read_time_minutes: { type: 'integer', minimum: 1, maximum: 30, description: 'Estimated reading time in whole minutes.' },
        relevance: { type: 'integer', minimum: 1, maximum: 5, description: 'Relevance to the reader interests. 5 = must-read, 1 = skip.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Short topic tags (lowercase, 1-3 words each).' },
      },
      required: ['summary', 'key_insight', 'read_time_minutes', 'relevance', 'tags'],
    },
  };

  return { systemPrompt, tool, tokens: profile.tokens };
}

async function curateOne(article, ctx) {
  const excerpt = (article.excerpt || '').slice(0, EXCERPT_LIMIT);
  const userContent = `Source: ${article.source} — ${article.section}
Headline: ${article.title}
Published: ${article.publishedAt}
URL: ${article.url}

Excerpt:
${excerpt || '(no excerpt available)'}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: ctx.tokens,
    system: [
      { type: 'text', text: ctx.systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    tools: [ctx.tool],
    tool_choice: { type: 'tool', name: 'classify_article' },
    messages: [{ role: 'user', content: userContent }],
  });

  if (response.usage) {
    ctx.usage.input += response.usage.input_tokens || 0;
    ctx.usage.output += response.usage.output_tokens || 0;
    ctx.usage.cacheRead += response.usage.cache_read_input_tokens || 0;
    ctx.usage.cacheWrite += response.usage.cache_creation_input_tokens || 0;
  }

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

const PRICING = {
  'claude-haiku-4-5':       { input: 1.00, output: 5.00,  cacheRead: 0.10, cacheWrite: 1.25 },
  'claude-sonnet-4-6':      { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-7':        { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
};

function estimateCost(usage, model) {
  const p = PRICING[model];
  if (!p) return null;
  const cost =
    (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite) / 1_000_000;
  return cost;
}

export async function curateArticles(articles, settings) {
  const ctx = buildPrompt(settings);
  ctx.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const concurrency = parseInt(process.env.CURATION_CONCURRENCY || '4', 10);
  const curations = await mapLimit(articles, concurrency, (a) => curateOne(a, ctx));
  const enriched = [];
  for (let i = 0; i < articles.length; i++) {
    const c = curations[i];
    if (!c || c.__error) {
      console.warn(`[claude] curation failed for "${articles[i].title}": ${c?.__error || 'unknown'}`);
      continue;
    }
    enriched.push({ ...articles[i], ...c });
  }
  const cost = estimateCost(ctx.usage, MODEL);
  const costStr = cost != null ? ` (~$${cost.toFixed(4)})` : '';
  console.log(`[claude] usage: ${ctx.usage.input} in (${ctx.usage.cacheRead} cached) + ${ctx.usage.output} out${costStr} using ${MODEL}`);
  return { articles: enriched, usage: ctx.usage, estimatedCost: cost, model: MODEL };
}
