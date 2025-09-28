import AsyncStorage from '@react-native-async-storage/async-storage';

export type JoinedMap = Record<string, boolean>;

const KEY = (email: string) =>
  `joinedMap:${String(email || '').trim().toLowerCase()}`;

/** Load the full joined map for an email */
export async function loadJoinedMap(email: string): Promise<JoinedMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY(email));
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/** Save the full joined map for an email */
export async function saveJoinedMap(email: string, map: JoinedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY(email), JSON.stringify(map || {}));
  } catch {
    // ignore
  }
}

/**
 * Local-only setter for a single event id. NO server mutations here.
 * Call this immediately after a successful server join/unjoin so both
 * screens read the same persisted state.
 */
export async function setJoinedLocal(
  email: string,
  eventId: string,
  value: boolean
): Promise<JoinedMap> {
  const map = await loadJoinedMap(email);
  if (value) map[eventId] = true;
  else delete map[eventId];
  await saveJoinedMap(email, map);
  console.log('[joinState.setLocal]', email, eventId, value);
  return map;
}

/** Convenience: return just the joined ids */
export async function loadJoinedIds(email: string): Promise<string[]> {
  const map = await loadJoinedMap(email);
  return Object.keys(map).filter((id) => !!map[id]);
}

/** Utility to convert a map to ids, if needed elsewhere */
export function joinedIds(map: JoinedMap): string[] {
  return Object.keys(map || {}).filter((id) => !!map[id]);
}
