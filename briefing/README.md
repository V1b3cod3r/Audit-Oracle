# Morning Briefing

Curated daily briefing from WSJ, FT, and The Economist. Claude ranks articles against your interests, writes a 2-3 sentence summary, extracts the "why it matters" insight, and estimates read time. Minimalist dark UI, mobile-first, deploys to Vercel.

## Interests (ranked)

1. AI policy & regulation
2. Federal Reserve & monetary policy
3. Prediction markets & trading
4. Tech & startup news
5. Market volatility & financial markets

## Deploy to Vercel

1. Push the repo to GitHub, import it in Vercel, set the **root directory** to `briefing/`.
2. In the Vercel project, **Storage → Marketplace → Upstash Redis**. Create a free DB; the `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars are wired in automatically.
3. Add two more env vars:
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `CRON_SECRET` — any random string (protects the cron endpoint)
4. Deploy. The cron runs daily at 10:00 UTC (≈ 6 AM ET) and writes the briefing to KV. The UI reads from KV.
5. You can trigger a manual refresh from the UI at any time (requires the Vercel Pro plan for functions >60s).

## Run locally

Requires Node 20+.

```bash
git clone <this-repo>
cd Audit-Oracle/briefing
cp .env.example .env    # edit it: paste your ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:3000
```

Open `http://localhost:3000` in your browser and tap **Refresh**. First run takes ~30-60s to fetch feeds and score everything. Briefings cache to `data/briefing.json`; saved articles live in your browser's localStorage.

KV/Upstash vars are optional locally — leave them blank and it falls back to the filesystem.

## One-shot CLI

```bash
npm run brief
```

Generates a briefing and writes to KV (if configured) or `data/briefing.json`.

## Notes

- Saved articles live in browser `localStorage`; no server persistence needed.
- WSJ / FT / Economist feeds are paywalled; the tool uses the RSS excerpt as the article context.
- Default model is `claude-sonnet-4-20250514`; override via `ANTHROPIC_MODEL`.
