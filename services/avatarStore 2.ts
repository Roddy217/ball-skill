import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const keyFor = (email: string) =>
  `avatar:${String(email || '').trim().toLowerCase()}`;

function safeName(email: string) {
  return String(email || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

/**
 * Ensure an avatars/ directory exists under the app sandbox and
 * return a stable absolute file path for the user's avatar.
 */
export async function ensureAvatarPath(email: string) {
  const base: string = (FileSystem.documentDirectory || FileSystem.cacheDirectory || '').toString();
  if (!base) throw new Error('No filesystem base directory available');
  const dir = base + 'avatars/';
  try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch {}
  return dir + `${safeName(email)}.jpg`;
}

export async function saveAvatarUri(email: string, uri: string) {
  await AsyncStorage.setItem(keyFor(email), uri || '');
}

export async function getAvatarUri(email: string) {
  const uri = await AsyncStorage.getItem(keyFor(email));
  if (uri) return uri;

  // Fallback if a file already exists at the stable path
  try {
    const dest = await ensureAvatarPath(email);
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) return dest;
  } catch {}
  return null;
}

export async function clearAvatar(email: string) {
  try {
    const dest = await ensureAvatarPath(email);
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {}
  await AsyncStorage.removeItem(keyFor(email));
}
