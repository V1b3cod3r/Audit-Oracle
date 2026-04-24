import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const EXCERPT_LIMIT = parseInt(process.env.EXCERPT_CHARS || '800', 10);
const TRIAGE_EXCERPT_LIMIT = parseInt(process.env.TRIAGE_EXCERPT_CHARS || '280', 10);

const SUMMARY_PROFILES = {
  short:  { instr: '2-3 tight sentences.',                desc: '2-3 sentence summary.',                                                            tokens: 1024 },
  medium: { instr: '4-5 sentences, one short paragraph.', desc: '4-5 sentence summary covering what happened, the key numbers, and context.',       tokens: 1600 },
  long:   { instr: '6-8 sentences, 2 short paragraphs.',  desc: '6-8 sentence summary: what happened, the key numbers, the context, and who is affected.', tokens: 2400 },
};

const PRICING = {
  'claude-haiku-4-5':         { input: 1.00, output: 5.00,  cacheRead: 0.10, cacheWrite: 1.25 },
  'claude-sonnet-4-6':        { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-4-7':          { input: 5.00, output: 25.00, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
};

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function addUsage(target, response) {
  if (!response?.usage) return;
  target.input += response.usage.input_tokens || 0;
  target.output += response.usage.output_tokens || 0;
  target.cacheRead += response.usage.cache_read_input_tokens || 0;
  target.cacheWrite += response.usage.cache_creation_input_tokens || 0;
}

function estimateCost(usage, model) {
  const p = PRICING[model];
  if (!p) return null;
  return (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite) / 1_000_000;
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

/* -------- Stage 1: Triage (cheap relevance scoring) -------- */

const TRIAGE_TOOL = {
  name: 'score_relevance',
  description: 'Score article relevance to the reader interests on a 1-5 scale.',
  input_schema: {
    type: 'object',
    properties: {
      relevance: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: '1=skip (off-topic), 2=low, 3=on-topic, 4=important, 5=must-read.',
      },
    },
    required: ['relevance'],
  },
};

function triagePrompt(settings) {
  return `You are a sharp editor scoring article relevance for a reader.

Their interests, in priority order:
${settings.interests.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

Score 1-5:
1 = skip (off-topic or generic noise)
2 = low priority (tangentially related)
3 = on-topic
4 = important (directly hits a top interest)
5 = must-read (top interest + significant news)

Top interests should score 4 or 5. Generic macro headlines without a tie-in: 2 max.`;
}

async function triageOne(article, ctx) {
  const excerpt = (article.excerpt || '').slice(0, TRIAGE_EXCERPT_LIMIT);
  const userContent = `Source: ${article.source} — ${article.section}
Title: ${article.title}
Brief: ${excerpt || '(no excerpt)'}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 64,
    system: [{ type: 'text', text: ctx.systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: [TRIAGE_TOOL],
    tool_choice: { type: 'tool', name: 'score_relevance' },
    messages: [{ role: 'user', content: userContent }],
  });

  addUsage(ctx.usage, response);
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use in triage response');
  return toolUse.input.relevance;
}

export async function triageArticles(articles, settings) {
  if (articles.length === 0) return { articles: [], usage: emptyUsage() };
  const ctx = { systemPrompt: triagePrompt(settings), usage: emptyUsage() };
  const concurrency = parseInt(process.env.CURATION_CONCURRENCY || '4', 10);
  const scores = await mapLimit(articles, concurrency, (a) => triageOne(a, ctx));
  const triaged = [];
  for (let i = 0; i < articles.length; i++) {
    const score = scores[i];
    if (typeof score === 'number') {
      triaged.push({ ...articles[i], relevance: score });
    } else {
      console.warn(`[claude] triage failed for "${articles[i].title}": ${score?.__error || 'unknown'}`);
    }
  }
  return { articles: triaged, usage: ctx.usage };
}

/* -------- Stage 2: Full curation (summary + insight) -------- */

function buildCuratePrompt(settings) {
  const profile = SUMMARY_PROFILES[settings.summaryLength] || SUMMARY_PROFILES.short;
  const systemPrompt = `You are a sharp morning-briefing editor. Your reader is a finance- and tech-literate professional who wants signal, not noise.

Their interests, in priority order:
${settings.interests.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

You are summarizing articles that have already been judged relevant. For each:
- Summary: ${profile.instr} State the news, not the framing. No throat-clearing.
- Key insight: one sentence on why it matters — the second-order implication, not a restatement.
- Read time: whole minutes, ~225 wpm of the full article.

Tone: direct, professional, readable. No hype.`;

  const tool = {
    name: 'curate_article',
    description: 'Produce the curated briefing entry for a relevant article.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: profile.desc },
        key_insight: { type: 'string', description: 'One sentence on why it matters.' },
        read_time_minutes: { type: 'integer', minimum: 1, maximum: 30, description: 'Whole minutes.' },
      },
      required: ['summary', 'key_insight', 'read_time_minutes'],
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
    system: [{ type: 'text', text: ctx.systemPrompt, cache_control: { type: 'ephemeral' } }],
    tools: [ctx.tool],
    tool_choice: { type: 'tool', name: 'curate_article' },
    messages: [{ role: 'user', content: userContent }],
  });

  addUsage(ctx.usage, response);
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use in curate response');
  return toolUse.input;
}

export async function curateArticles(articles, settings) {
  if (articles.length === 0) return { articles: [], usage: emptyUsage() };
  const ctx = { ...buildCuratePrompt(settings), usage: emptyUsage() };
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
  return { articles: enriched, usage: ctx.usage };
}

/* -------- Run summary -------- */

export function runCost(usages) {
  const total = emptyUsage();
  for (const u of usages) {
    total.input += u.input;
    total.output += u.output;
    total.cacheRead += u.cacheRead;
    total.cacheWrite += u.cacheWrite;
  }
  return { usage: total, estimatedCost: estimateCost(total, MODEL), model: MODEL };
}
