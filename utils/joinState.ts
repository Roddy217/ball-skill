import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (email: string) =>
  `joinedMap:${String(email || '').trim().toLowerCase()}`;

export async function loadJoinedMap(email: string): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(email));
    const obj = raw ? JSON.parse(raw) : {};
    console.log('[joinState][load]', keyFor(email), obj);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    console.log('[joinState][load][err]', e);
    return {};
  }
}

export async function saveJoinedMap(email: string, map: Record<string, boolean>) {
  try {
    await AsyncStorage.setItem(keyFor(email), JSON.stringify(map || {}));
    console.log('[joinState][save]', keyFor(email), Object.keys(map || {}));
  } catch (e) {
    console.log('[joinState][save][err]', e);
  }
}

export function joinedIds(map: Record<string, boolean>): string[] {
  return Object.keys(map || {}).filter(Boolean);
}
