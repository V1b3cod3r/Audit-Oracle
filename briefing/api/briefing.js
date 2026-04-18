import { getBriefing, isRunning } from '../src/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const [briefing, running] = await Promise.all([getBriefing(), isRunning()]);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ briefing, running });
  } catch (err) {
    console.error('[api/briefing] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
