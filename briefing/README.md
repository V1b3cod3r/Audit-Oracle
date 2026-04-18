# Morning Briefing

Curated daily briefing from WSJ, FT, and The Economist. Claude ranks articles against your interests, writes a 2-3 sentence summary, extracts the "why it matters" insight, and estimates read time.

## Interests (ranked)

1. AI policy & regulation
2. Federal Reserve & monetary policy
3. Prediction markets & trading
4. Tech & startup news
5. Market volatility & financial markets

## Setup

```bash
cp .env.example .env   # paste your ANTHROPIC_API_KEY
npm install
npm start              # server on :3000
```

Open `http://localhost:3000`, hit **Refresh Briefing**. The scheduler runs daily at 6 AM (configurable via `BRIEFING_CRON`).

## One-shot CLI

```bash
npm run brief
```

Generates a briefing and writes it to `data/briefing.json`.

## Notes

- WSJ / FT / Economist feeds are paywalled; the tool uses the RSS excerpt as the article context.
- Saved articles persist to `data/saved.json`.
- Default model is `claude-sonnet-4-20250514`; override via `ANTHROPIC_MODEL`.
