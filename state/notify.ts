import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationItem = {
  id: string;
  ts: number;
  title: string;
  body?: string;
};

const STORAGE_KEY = 'notifications_v1';
let items: NotificationItem[] = [];
const listeners = new Set<() => void>();

export async function loadNotifications() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) items = JSON.parse(raw) || [];
  } catch {}
  emit();
  return items;
}

function emit() { listeners.forEach(fn => fn()); }

async function persist() {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 200))); } catch {}
}

export function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
export function getNotifications() { return items; }

export async function addNotification(n: Omit<NotificationItem,'id'|'ts'> & Partial<Pick<NotificationItem,'id'|'ts'>>) {
  const m = { id: n.id || Math.random().toString(36).slice(2), ts: n.ts || Date.now(), title: n.title, body: n.body };
  items = [m, ...items].slice(0, 200);
  await persist();
  emit();
}

export async function clearNotifications() {
  items = [];
  await persist();
  emit();
}
