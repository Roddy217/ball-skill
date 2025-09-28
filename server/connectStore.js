// server/connectStore.js
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const FILE = path.join(DATA_DIR, 'connect.json');

async function ensureFile() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try { await fs.access(FILE); } catch { await fs.writeFile(FILE, '{}', 'utf8'); }
}

export async function readStore() {
  await ensureFile();
  try {
    const txt = await fs.readFile(FILE, 'utf8');
    return JSON.parse(txt || '{}') || {};
  } catch {
    return {};
  }
}

export async function writeStore(obj) {
  await ensureFile();
  await fs.writeFile(FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export async function upsert(email, patch) {
  const e = String(email || '').trim().toLowerCase();
  const s = await readStore();
  const prev = s[e] || {};
  s[e] = { ...prev, ...patch, email: e };
  await writeStore(s);
  return s[e];
}

export async function get(email) {
  const e = String(email || '').trim().toLowerCase();
  const s = await readStore();
  return s[e] || null;
}

export async function byAccountId(accountId) {
  const s = await readStore();
  for (const [email, rec] of Object.entries(s)) {
    if (rec && rec.accountId === accountId) {
      return { email, ...rec };
    }
  }
  return null;
}
