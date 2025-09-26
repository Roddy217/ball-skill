import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'bs_recent_emails_v1';
const DEFAULTS = ['test@ballskill.com', 'alice@ballskill.com', 'bob@ballskill.com'];

export async function getEmails(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) as string[] : [];
    // Dedup + keep recent first, cap to 50
    const merged = Array.from(new Set([...saved, ...DEFAULTS]));
    return merged.slice(0, 50);
  } catch {
    return DEFAULTS.slice();
  }
}

export async function addEmail(email: string) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return;
  try {
    const existing = await getEmails();
    const next = [e, ...existing.filter(x => x !== e)].slice(0, 50);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
