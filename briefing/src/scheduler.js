import cron from 'node-cron';
import { generateBriefing } from './briefing.js';

export function startScheduler() {
  const expr = process.env.BRIEFING_CRON || '0 6 * * *';
  if (!cron.validate(expr)) {
    console.warn(`[scheduler] invalid cron "${expr}", skipping schedule`);
    return null;
  }
  const task = cron.schedule(expr, async () => {
    try {
      await generateBriefing();
    } catch (err) {
      console.error('[scheduler] briefing failed:', err.message);
    }
  });
  console.log(`[scheduler] scheduled briefing at "${expr}"`);
  return task;
}
