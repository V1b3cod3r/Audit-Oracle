import 'dotenv/config';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBriefing, isRunning } from './src/briefing.js';
import { getBriefing, getSaved, saveArticle, unsaveArticle } from './src/store.js';
import { startScheduler } from './src/scheduler.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(resolve(HERE, 'public')));

app.get('/api/briefing', async (req, res) => {
  const briefing = await getBriefing();
  res.json({ briefing, running: isRunning() });
});

app.post('/api/briefing/refresh', async (req, res) => {
  if (isRunning()) {
    return res.status(409).json({ error: 'Briefing generation already in progress' });
  }
  generateBriefing().catch((err) => console.error('[server] refresh failed:', err.message));
  res.json({ started: true });
});

app.get('/api/saved', async (req, res) => {
  res.json(await getSaved());
});

app.post('/api/saved', async (req, res) => {
  const { article } = req.body || {};
  if (!article?.url) return res.status(400).json({ error: 'article.url required' });
  const saved = await saveArticle(article);
  res.json(saved);
});

app.delete('/api/saved', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const saved = await unsaveArticle(url);
  res.json(saved);
});

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, () => {
  console.log(`[server] morning briefing listening on http://localhost:${port}`);
  startScheduler();
});
