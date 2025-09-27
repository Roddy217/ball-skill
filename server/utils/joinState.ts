import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (email: string) => `joinedMap:${(email || '').toLowerCase()}`;

export async function loadJoinedMap(email: string): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(key(email));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveJoinedMap(email: string, map: Record<string, boolean>) {
  try {
    await AsyncStorage.setItem(key(email), JSON.stringify(map || {}));
  } catch {}
}

export async function updateJoined(email: string, eventId: string, joined: boolean) {
  const map = await loadJoinedMap(email);
  if (joined) map[eventId] = true; else delete map[eventId];
  await saveJoinedMap(email, map);
  return map;
}
