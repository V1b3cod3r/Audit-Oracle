import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = resolve(HERE, '..', 'data');
const LOCAL_FILE = resolve(LOCAL_DIR, 'briefing.json');
const LOCAL_SETTINGS = resolve(LOCAL_DIR, 'settings.json');
const BRIEFING_KEY = 'briefing:current';
const RUNNING_KEY = 'briefing:running';
const SETTINGS_KEY = 'briefing:settings';

const DEFAULT_INTERESTS = [
  'AI policy & regulation',
  'Federal Reserve & monetary policy',
  'Prediction markets & trading',
  'Tech & startup news',
  'Market volatility & financial markets',
];

export const DEFAULT_SETTINGS = {
  interests: DEFAULT_INTERESTS,
  summaryLength: 'short',
};

function envInterests() {
  const raw = (process.env.BRIEFING_INTERESTS || '').trim();
  if (!raw) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function envDefaults() {
  return {
    interests: envInterests() || DEFAULT_INTERESTS,
    summaryLength: (process.env.SUMMARY_LENGTH || 'short').toLowerCase(),
  };
}

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

let redisClient = null;
let redisChecked = false;

async function getRedis() {
  if (redisChecked) return redisClient;
  redisChecked = true;
  const env = redisEnv();
  if (!env) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis(env);
    return redisClient;
  } catch (err) {
    console.warn('[store] @upstash/redis unavailable, using filesystem:', err.message);
    return null;
  }
}

export async function getBriefing() {
  const redis = await getRedis();
  if (redis) {
    const value = await redis.get(BRIEFING_KEY);
    return value || null;
  }
  try {
    const raw = await readFile(LOCAL_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveBriefing(briefing) {
  const redis = await getRedis();
  if (redis) {
    await redis.set(BRIEFING_KEY, briefing);
    return briefing;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(briefing, null, 2));
  return briefing;
}

export async function setRunning(running) {
  const redis = await getRedis();
  if (!redis) return;
  if (running) {
    await redis.set(RUNNING_KEY, { since: Date.now() }, { ex: 600 });
  } else {
    await redis.del(RUNNING_KEY);
  }
}

export async function isRunning() {
  const redis = await getRedis();
  if (!redis) return false;
  return !!(await redis.get(RUNNING_KEY));
}

function normalizeSettings(input) {
  const env = envDefaults();
  const interests = Array.isArray(input?.interests)
    ? input.interests.map((s) => String(s).trim()).filter(Boolean)
    : null;
  const validLengths = ['short', 'medium', 'long'];
  const summaryLength = validLengths.includes(input?.summaryLength)
    ? input.summaryLength
    : env.summaryLength;
  return {
    interests: interests && interests.length ? interests : env.interests,
    summaryLength: validLengths.includes(summaryLength) ? summaryLength : 'short',
  };
}

export async function getSettings() {
  const redis = await getRedis();
  if (redis) {
    const stored = await redis.get(SETTINGS_KEY);
    return normalizeSettings(stored);
  }
  try {
    const raw = await readFile(LOCAL_SETTINGS, 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return normalizeSettings(null);
    throw err;
  }
}

export async function saveSettings(input) {
  const settings = normalizeSettings(input);
  const redis = await getRedis();
  if (redis) {
    await redis.set(SETTINGS_KEY, settings);
    return settings;
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_SETTINGS, JSON.stringify(settings, null, 2));
  return settings;
}
