import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(HERE, '..', 'data');
const BRIEFING_FILE = resolve(DATA_DIR, 'briefing.json');
const SAVED_FILE = resolve(DATA_DIR, 'saved.json');

async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

export async function getBriefing() {
  return readJson(BRIEFING_FILE, null);
}

export async function saveBriefing(briefing) {
  await writeJson(BRIEFING_FILE, briefing);
  return briefing;
}

export async function getSaved() {
  return readJson(SAVED_FILE, []);
}

export async function saveArticle(article) {
  const saved = await getSaved();
  if (saved.some((a) => a.url === article.url)) return saved;
  const next = [{ ...article, savedAt: new Date().toISOString() }, ...saved];
  await writeJson(SAVED_FILE, next);
  return next;
}

export async function unsaveArticle(url) {
  const saved = await getSaved();
  const next = saved.filter((a) => a.url !== url);
  await writeJson(SAVED_FILE, next);
  return next;
}
