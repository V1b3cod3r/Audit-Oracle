import { generateBriefing } from '../../src/briefing.js';
import { isRunning } from '../../src/store.js';

export const config = {
  maxDuration: 300,
};

function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  const isCron = req.method === 'GET' && isAuthorizedCron(req);
  if (req.method !== 'POST' && !isCron) {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await isRunning()) {
    return res.status(409).json({ error: 'Briefing generation already in progress' });
  }

  try {
    const briefing = await generateBriefing();
    return res.status(200).json({
      ok: true,
      articleCount: briefing.articleCount,
      keyStories: briefing.keyStories,
      generatedAt: briefing.generatedAt,
    });
  } catch (err) {
    console.error('[api/briefing/refresh] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
