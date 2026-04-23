import { getSettings, saveSettings } from '../src/store.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const settings = await getSettings();
      return res.status(200).json(settings);
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const saved = await saveSettings(body);
      return res.status(200).json(saved);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/settings] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
