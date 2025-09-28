import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (email: string) => `bs:joins:${(email||'').toLowerCase()}`;

export type JoinedMap = Record<string, boolean>;

/** Load full joined map (id -> boolean) from local storage */
export async function loadJoinedMap(email: string): Promise<JoinedMap> {
  try {
    const s = await AsyncStorage.getItem(KEY(email));
    return s ? JSON.parse(s) as JoinedMap : {};
  } catch {
    return {};
  }
}

/** Save full joined map to local storage */
export async function saveJoinedMap(email: string, map: JoinedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(email), JSON.stringify(map));
  } catch {/* ignore */}
}

/** Convenience: return just the joined ids */
export async function loadJoinedIds(email: string): Promise<string[]> {
  const map = await loadJoinedMap(email);
  return Object.keys(map).filter(k => !!map[k]);
}

/**
 * Local-only setter. NO server mutations here.
 * Use this from button handlers after the server call succeeds.
 */
export async function setJoinedLocal(email: string, eventId: string, value: boolean): Promise<JoinedMap> {
  const map = await loadJoinedMap(email);
  map[eventId] = !!value;
  await saveJoinedMap(email, map);
  console.log('[joinState.local]', email, eventId, value);
  return map;
}
