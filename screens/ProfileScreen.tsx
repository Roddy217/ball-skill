import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator, Alert, TextInput, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { getAvatarUri, saveAvatarUri, clearAvatar, ensureAvatarPath } from '../services/avatarStore';
import { useAuth } from '../providers/AuthProvider';
import * as api from '../services/api';
import { loadJoinedMap, saveJoinedMap, setJoinedLocal } from '../utils/joinState';
import IdChip from '../components/IdChip';

console.log('[Profile] api keys:', Object.keys(api));

// ---- Avatar URL validation config ----
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_CT_PREFIX = 'image/';

function extFromUrl(u: string): string {
  try {
    const p = new URL(u).pathname.toLowerCase();
    return ALLOWED_EXTS.find(ext => p.endsWith(ext)) || '';
  } catch {
    return '';
  }
}
function looksPrivateHost(host: string): boolean {
  // blocks localhost, 127.*, 10.*, 192.168.*, 172.16-31.*
  return /(^localhost$)|(^127\.)|(^10\.)|(^192\.168\.)|(^172\.(1[6-9]|2\d|3[0-1])\.)/i.test(host);
}

async function normalizeJoins(email: string) {
  try {
    const raw = await api.getUserJoins(email);
    console.log('[Profile][joins] raw =', raw);

    // Accept array or legacy shapes
    let ids: string[] = [];
    if (Array.isArray(raw)) {
      ids = raw
        .map((it: any) => it?.id || it?.eventId)
        .filter(Boolean);
    } else if (raw && Array.isArray((raw as any).joins)) {
      ids = (raw as any).joins.map((it: any) => it?.id || it?.eventId).filter(Boolean);
    } else if (raw && Array.isArray((raw as any).events)) {
      ids = (raw as any).events.map((it: any) => it?.id || it?.eventId).filter(Boolean);
    }

    if (ids.length > 0) return ids;

    // Fallback to local persisted state if server has no route / returns []
    const localMap = await loadJoinedMap(email);
    const localIds = Object.keys(localMap || {}).filter(k => !!(localMap as any)[k]);
    console.log('[Profile][joins][fallback local] ids =', localIds);
    return localIds;
  } catch (e) {
    console.log('[Profile][joins] error', e);
    const localMap = await loadJoinedMap(email);
    const localIds = Object.keys(localMap || {}).filter(k => !!(localMap as any)[k]);
    console.log('[Profile][joins][fallback local on error] ids =', localIds);
    return localIds;
  }
}

// --- Local catalog to hydrate IDs (until Firestore persistence) ---
type CatalogEvent = {
  id: string;
  title: string;
  date: string;
  startTs: number;
  locationType: 'in_person' | 'online';
  venue?: string;
  fee: number;
};
const baseSeed: CatalogEvent[] = [
  { id: 'evt_001', title: 'Ball Skill Combine', date: 'Sat, Sep 20 • 10:00 AM', startTs: new Date('2025-09-20T10:00:00-04:00').getTime(), locationType: 'in_person', venue: 'Hoop City Gym', fee: 10 },
  { id: 'evt_002', title: 'Virtual Shooting Clinic', date: 'Sun, Sep 21 • 6:00 PM', startTs: new Date('2025-09-21T18:00:00-04:00').getTime(), locationType: 'online', fee: 10 },
  { id: 'evt_003', title: 'Guard Skills Lab', date: 'Tue, Sep 23 • 7:30 PM', startTs: new Date('2025-09-23T19:30:00-04:00').getTime(), locationType: 'in_person', venue: 'Downtown Rec Center', fee: 10 },
];
function generateEvent(idx: number): CatalogEvent {
  const isOnline = idx % 2 === 0;
  const dt = new Date();
  dt.setDate(dt.getDate() + idx);
  dt.setHours(18, 0, 0, 0);
  const startTs = dt.getTime();
  const display = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return {
    id: `evt_${String(idx).padStart(3, '0')}`,
    title: isOnline ? 'Virtual Skills Session' : 'Open Gym Skills Night',
    date: `${display} • ${isOnline ? '6:00 PM' : '7:00 PM'}`,
    startTs,
    locationType: isOnline ? 'online' : 'in_person',
    venue: isOnline ? undefined : 'City Rec Center',
    fee: 10,
  };
}
function buildCatalog(): CatalogEvent[] {
  const first = [...baseSeed];
  for (let i = 4; i <= 50; i++) first.push(generateEvent(i));
  return first;
}
const catalog = buildCatalog();
const catMap = new Map(catalog.map(ev => [ev.id, ev]));

function hydrateIds(ids: string[]): CatalogEvent[] {
  return ids.map(id => {
    const ev = catMap.get(id);
    if (ev) return ev;
    // Fallback placeholder so unknown IDs still render
    return {
      id,
      title: 'Joined Event',
      date: '—',
      startTs: Date.now(),
      locationType: 'in_person',
      fee: 0,
    } as CatalogEvent;
  });
}

// --- Credits types/helpers ---
type CreditEntry = {
  ts: number;
  delta: number;           // cents, positive or negative
  note?: string | null;
  balanceAfter: number;    // cents
};
function centsToDollars(c: number) { return (Number(c || 0) / 100).toFixed(2); }
function formatDelta(c: number) { const sign = c >= 0 ? "+" : "-"; return `${sign}$${centsToDollars(Math.abs(c))}`; }
type GroupMode = 'ALL' | 'DAY' | 'MONTH' | 'YEAR';
function bucketLabel(d: Date, mode: GroupMode) {
  if (mode === 'DAY')   return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (mode === 'MONTH') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return String(d.getFullYear());
}
function groupHistory(list: CreditEntry[], mode: GroupMode) {
  const by: Record<string, CreditEntry[]> = {};
  ;[...list].sort((a,b) => b.ts - a.ts).forEach(it => {
    const label = bucketLabel(new Date(it.ts), mode);
    (by[label] ||= []).push(it);
  });
  return Object.entries(by).map(([label, items]) => ({ label, items }));
}

// ---- Extra helpers: TX filters + Month/Week utilities ----
type TxSort = 'NEWEST' | 'OLDEST';
type TxType = 'ALL' | 'CREDITS' | 'DEBITS';

function monthKeyFromTs(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}
function monthLabelFromKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
function sundayStart(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
function weekEndFromStart(startMs: number) {
  const d = new Date(startMs);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// --- UI ---
type JoinFilter = 'ALL' | 'SOONEST' | 'NEWEST' | 'IN_PERSON' | 'ONLINE';

export default function ProfileScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);
  useEffect(() => { api.loadApiBase().catch(() => {}); }, []);

  const [loading, setLoading] = useState(false);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showUrlBox, setShowUrlBox] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [urlCheck, setUrlCheck] = useState<'idle'|'checking'|'ok'|'bad'>('idle');
  const [urlErr, setUrlErr] = useState<string>('');

  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Transaction history
  const [histLoading, setHistLoading] = useState(false);
  const [history, setHistory] = useState<CreditEntry[]>([]);
  const [groupBy, setGroupBy] = useState<GroupMode>('ALL');

  // TX filters
  const [txSort, setTxSort] = useState<TxSort>('NEWEST');
  const [txType, setTxType] = useState<TxType>('ALL');
  const [txQuery, setTxQuery] = useState<string>('');

  // Pagination (visible counts)
  const [txVisibleCount, setTxVisibleCount] = useState(10);
  const [evVisibleCount, setEvVisibleCount] = useState(5);

  const filteredHistory = useMemo(() => {
    let l = [...history];

    // Type filter
    if (txType === 'CREDITS') l = l.filter(x => x.delta > 0);
    else if (txType === 'DEBITS') l = l.filter(x => x.delta < 0);

    // Note/query filter
    const q = txQuery.trim().toLowerCase();
    if (q) l = l.filter(x => (x.note || '').toLowerCase().includes(q));

    // Date-range filter driven by the quick chips
    if (groupBy !== 'ALL') {
      const now = new Date();
      let startTs: number | null = null;

      if (groupBy === 'DAY') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        startTs = d.getTime();
      } else if (groupBy === 'MONTH') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        startTs = d.getTime();
      } else if (groupBy === 'YEAR') {
        const d = new Date(now.getFullYear(), 0, 1);
        startTs = d.getTime();
      }

      if (startTs != null) {
        l = l.filter(x => x.ts >= startTs);
      }
    }

    // Sort
    l.sort((a, b) => (txSort === 'NEWEST' ? b.ts - a.ts : a.ts - b.ts));
    return l;
  }, [history, txType, txSort, txQuery, groupBy]);

  // Apply pagination to transactions
  const limitedHistory = useMemo(
    () => filteredHistory.slice(0, txVisibleCount),
    [filteredHistory, txVisibleCount]
  );

  // Joined-events date filters
  const [evDateMode, setEvDateMode] = useState<'ALL' | 'MONTH' | 'WEEK'>('ALL');
  const [evMonthKey, setEvMonthKey] = useState<string | null>(null);
  const [evWeekRange, setEvWeekRange] = useState<{ start: number; end: number } | null>(null);

  // Prevent double-taps / duplicate refunds
  const [unjoiningSet, setUnjoiningSet] = useState<Set<string>>(new Set());
  const isUnjoining = React.useCallback((id: string) => unjoiningSet.has(id), [unjoiningSet]);

  // Balance helpers
  const [balLoading, setBalLoading] = useState(false);
  const balanceDollars = useMemo(
    () => (balanceCents != null ? (balanceCents / 100).toFixed(2) : null),
    [balanceCents]
  );

  // Top-level: fetch transaction history (do NOT nest inside other hooks)
  const loadHistory = useCallback(async () => {
    if (!email) return;
    setHistLoading(true);
    try {
      let list: CreditEntry[] = [];
      const maybe = (api as any)?.getCreditsHistory;
  
      if (typeof maybe === 'function') {
        // Preferred path: services layer
        list = await maybe(email, { limit: 100 });
      } else {
        // Fallback: direct fetch so UI keeps working even if services/api
        // doesn't export getCreditsHistory in this build.
        const base =
          (api as any)?.getApiBase?.() ||
          (process.env as any)?.EXPO_PUBLIC_SERVER_URL ||
          'http://localhost:3001/api';
        const res = await fetch(`${base}/credits/${encodeURIComponent(email)}/history?limit=100`);
        if (res.ok) {
          const json = await res.json();
          list = Array.isArray(json?.history) ? json.history : [];
        } else {
          list = [];
        }
      }
  
      console.log('[Profile][History] loaded', list.length);
      setHistory(list);
    } catch (e) {
      console.log('[Profile][History][err]', e);
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  }, [email]);

  const [filter, setFilter] = useState<JoinFilter>('SOONEST');
  const [query, setQuery] = useState<string>('');

  // Build Month/Week choices from ALL joined events
  const allJoinedEvents = useMemo(() => hydrateIds(joinedIds), [joinedIds]);

  const monthChoices = useMemo(() => {
    const map = new Map<string, number>(); // key -> count
    for (const ev of allJoinedEvents) {
      const key = monthKeyFromTs(ev.startTs);
      map.set(key, (map.get(key) || 0) + 1);
    }
    // sort newest month first
    const keys = [...map.keys()].sort((a, b) => {
      const [ya, ma] = a.split('-').map(Number);
      const [yb, mb] = b.split('-').map(Number);
      return yb - ya || mb - ma;
    });
    return keys.map(key => ({ key, label: monthLabelFromKey(key), count: map.get(key) || 0 }));
  }, [allJoinedEvents]);

  const weekChoices = useMemo(() => {
    const map = new Map<number, number>(); // weekStartMs -> count
    for (const ev of allJoinedEvents) {
      const start = sundayStart(ev.startTs);
      map.set(start, (map.get(start) || 0) + 1);
    }
    // newest week first
    const starts = [...map.keys()].sort((a, b) => b - a);
    return starts.map(start => {
      const end = weekEndFromStart(start);
      const sd = new Date(start), ed = new Date(end);
      const label =
        `${sd.toLocaleDateString()} – ${ed.toLocaleDateString()} (${map.get(start)})`;
      return { start, end, label, count: map.get(start) || 0 };
    });
  }, [allJoinedEvents]);


  const load = useCallback(async () => {
    if (!hasEmail) {
      setBalanceCents(null);
      setJoinedIds([]);
      return;
    }

    setLoading(true);
    try {
      const [b, j] = await Promise.all([
        api.getBalance(email).catch(() => null),
        normalizeJoins(email),
      ]);
      setBalanceCents(b as any);
      setJoinedIds(j);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [email, hasEmail]);

  // Fetch balance only (separate from joined events)
  const loadBalanceOnly = useCallback(async () => {
    if (!hasEmail) {
      setBalanceCents(null);
      return;
    }
    try {
      setBalLoading(true);
      console.log('[Profile][Balance] fetching for:', email);
      const b = await api.getBalance(email);
      console.log('[Profile][Balance] result:', b, 'typeof =', typeof b);
      setBalanceCents(b as any);
    } catch (e: any) {
      console.log('[Profile][Balance] error:', e?.message || e);
      Alert.alert('Error', e?.message || 'Failed to fetch balance');
    } finally {
      setBalLoading(false);
    }
  }, [email, hasEmail]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => {
    load();
    loadBalanceOnly(); // also pull fresh balance on focus
  }, [load, loadBalanceOnly]));

  useFocusEffect(
    useCallback(() => {
      if (!email) return;
      loadHistory();
    }, [email, loadHistory])
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!hasEmail) { setAvatarUri(null); return; }
      const uri = await getAvatarUri(email);
      if (alive) setAvatarUri(uri);
    })();
    return () => { alive = false; };
  }, [email, hasEmail]);

  // Robust, single-shot Profile unjoin (guarded against double-fire)
  const handleProfileUnjoin = React.useCallback(async (ev: { id: string; fee: number; title?: string }) => {
    if (!email) { Alert.alert('Sign in', 'Please sign in to unjoin.'); return; }

    if (isUnjoining(ev.id)) {
      console.log('[Profile][unjoin] BLOCKED duplicate tap for', ev.id);
      return;
    }

    // mark busy
    setUnjoiningSet(prev => {
      const next = new Set(prev);
      next.add(ev.id);
      return next;
    });

    const fee = Math.abs(Number(ev.fee) || 0);
    console.log('[Profile][unjoin] START', { id: ev.id, email, fee });

    try {
      // 1) remove join on server (idempotent)
      await api.unrecordJoin(ev.id, email);
      console.log('[Profile][unjoin] server unrecordJoin OK', ev.id);

      // 2) update local cache so Events tab respects the change
      await setJoinedLocal(email, ev.id, false);
      console.log('[Profile][unjoin] setJoinedLocal →', email, ev.id);

      // 3) do ONE refund
      if (fee > 0) {
        await api.grantCredits(email, fee * 100, `unjoin:${ev.id}`);
        console.log('[Profile][unjoin] grantCredits OK', ev.id, fee * 100);
      }

      // 4) update UI + balance
      setJoinedIds(prev => prev.filter(id => id !== ev.id));
      const cents = await api.getBalance(email).catch(() => null);
      if (typeof cents === 'number') setBalanceCents(cents as any);

      Alert.alert('Unjoined', `Refunded $${fee}.`);
    } catch (e: any) {
      console.log('[Profile][unjoin] ERROR', e);
      Alert.alert('Failed', e?.message || 'Could not unjoin');
    } finally {
      // clear busy
      setUnjoiningSet(prev => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
      console.log('[Profile][unjoin] END', ev.id);
    }
  }, [email, isUnjoining]);

  const rows = useMemo(() => {
    console.log('[Profile][hydrate] joinedIds =', joinedIds);
    let events = hydrateIds(joinedIds);

    // Existing type/location filters
    if (filter === 'IN_PERSON') events = events.filter(e => e.locationType === 'in_person');
    if (filter === 'ONLINE')    events = events.filter(e => e.locationType === 'online');

    // Date filters (Month/Week)
    if (evDateMode === 'MONTH' && evMonthKey) {
      events = events.filter(e => monthKeyFromTs(e.startTs) === evMonthKey);
    } else if (evDateMode === 'WEEK' && evWeekRange) {
      events = events.filter(e => e.startTs >= evWeekRange.start && e.startTs <= evWeekRange.end);
    }

    // Sorters
    if (filter === 'SOONEST')   events = [...events].sort((a, b) => a.startTs - b.startTs);
    if (filter === 'NEWEST')    events = [...events].sort((a, b) => b.startTs - a.startTs);

    // Search
    const q = query.trim().toLowerCase();
    if (q) events = events.filter(e =>
      e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    );

    return events;
  }, [joinedIds, filter, query, evDateMode, evMonthKey, evWeekRange]);

  // Apply pagination to joined events
  const limitedRows = useMemo(
    () => rows.slice(0, evVisibleCount),
    [rows, evVisibleCount]
  );

  // Reset paging when joined-event filters or data change
  useEffect(() => {
    setEvVisibleCount(10);
  }, [joinedIds, filter, query, evDateMode, evMonthKey, evWeekRange]);

  // Reset paging when TX filters/data change
  useEffect(() => {
    setTxVisibleCount(10);
  }, [history, txSort, txType, txQuery]);

  const onUnjoin = useCallback((ev: CatalogEvent) => {
    // Route all unjoin actions through the single guarded handler to avoid duplicates.
    handleProfileUnjoin(ev);
  }, [handleProfileUnjoin]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();          // balance + joinedIds
      await loadHistory();   // transaction history
    } finally {
      setRefreshing(false);
    }
  }, [load, loadHistory]);

  const onChangePhoto = useCallback(async () => {
    if (!hasEmail) {
      Alert.alert('Profile photo', 'Please sign in to change your photo.');
      return;
    }
    try {
      setAvatarBusy(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1, // we’ll compress ourselves
      });
      if (res.canceled) return;

      const src = res.assets?.[0]?.uri;
      if (!src) return;

      // Compress & resize to a sane square (max 512)
      const out = await ImageManipulator.manipulateAsync(
        src,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Persist to app storage with a stable filename
      const dest = await ensureAvatarPath(email);
      try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch {}
      await FileSystem.copyAsync({ from: out.uri, to: dest });

      await saveAvatarUri(email, dest);
      setAvatarUri(dest);
    } catch (e: any) {
      console.log('[Profile][avatar] error', e?.message || e);
      Alert.alert('Photo', 'Could not set profile photo. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  }, [email, hasEmail]);
// Validates an image URL using https requirement, extension, HEAD size/type, and an image probe
const validateImageUrl = useCallback(async (url: string): Promise<{ ok: boolean; reason?: string }> => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return { ok: false, reason: 'Use an https:// image URL' };
    if (looksPrivateHost(u.hostname)) return { ok: false, reason: 'Private/local hosts are not allowed' };

    const ext = extFromUrl(url);
    if (!ext) return { ok: false, reason: `Allowed types: ${ALLOWED_EXTS.join(', ')}` };

    // Try HEAD for content-type/length (many CDNs support this; if not, we fallback)
    let contentType = '';
    let contentLength = 0;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 6000);
      const res = await fetch(url, { method: 'HEAD', signal: ac.signal });
      clearTimeout(to);
      if (res.ok) {
        contentType = String(res.headers.get('content-type') || '');
        contentLength = parseInt(String(res.headers.get('content-length') || '0'), 10) || 0;
      }
    } catch {
      // ignore; we'll probe with Image.getSize
    }

    if (contentType && !contentType.startsWith(ALLOWED_CT_PREFIX)) {
      return { ok: false, reason: `Not an image (Content-Type: ${contentType || 'unknown'})` };
    }
    if (contentLength && contentLength > MAX_IMAGE_BYTES) {
      return { ok: false, reason: `Image too large (> ${(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB)` };
    }

    // Fallback probe: try to load dimensions
    await new Promise<void>((resolve, reject) => {
      Image.getSize(url, () => resolve(), () => reject(new Error('not-loadable')));
    });

    return { ok: true };
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
}, []);

// Debounced validation as the user types
useEffect(() => {
  if (!showUrlBox) return;
  const u = urlText.trim();
  if (!u) { setUrlCheck('idle'); setUrlErr(''); return; }

  setUrlCheck('checking');
  let cancelled = false;
  const id = setTimeout(async () => {
    const res = await validateImageUrl(u);
    if (cancelled) return;
    setUrlCheck(res.ok ? 'ok' : 'bad');
    setUrlErr(res.ok ? '' : (res.reason || 'Not a valid image URL'));
  }, 450);

  return () => { cancelled = true; clearTimeout(id); };
}, [urlText, showUrlBox, validateImageUrl]);

  const onSetPhotoFromUrl = useCallback(async () => {
    if (!hasEmail) {
      Alert.alert('Profile photo', 'Please sign in to change your photo.');
      return;
    }
    const url = urlText.trim();
    // If not validated yet, validate once here so one tap always works
if (urlCheck !== 'ok') {
  const res = await validateImageUrl(url);
  if (!res.ok) {
    setUrlCheck('bad');
    setUrlErr(res.reason || 'Invalid image URL');
    Alert.alert('Invalid URL', res.reason || 'Please use a direct image link (jpg/png/webp, ≤5MB, https).');
    return;
  }
  setUrlCheck('ok');
}

    if (!url) {
      Alert.alert('Enter a URL', 'Paste a direct image URL (jpg/png).');
      return;
    }
    if (urlCheck !== 'ok') {
      Alert.alert('Invalid URL', urlErr || 'Please enter a direct image URL (.jpg/.png).');
      return;
    }
    try {
      setAvatarBusy(true);

      // Download to cache
      const tmp = FileSystem.cacheDirectory + 'avatar_remote.jpg';
      try { await FileSystem.deleteAsync(tmp, { idempotent: true }); } catch {}
      const dl = await FileSystem.downloadAsync(url, tmp);

      // Resize/compress to a square
      const out = await ImageManipulator.manipulateAsync(
        dl.uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Persist to stable location
      const dest = await ensureAvatarPath(email);
      try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch {}
      await FileSystem.copyAsync({ from: out.uri, to: dest });

      await saveAvatarUri(email, dest);
      setAvatarUri(dest);
      setShowUrlBox(false);
      setUrlText('');
    } catch (e: any) {
      console.log('[Profile][avatar:url] error', e?.message || e);
      Alert.alert('Photo', 'Could not load image from URL. Make sure it is a direct image link (jpg/png).');
    } finally {
      setAvatarBusy(false);
    }
  }, [email, hasEmail, urlText, urlCheck, urlErr]);
  
  const onRemovePhoto = useCallback(async () => {
    if (!hasEmail) return;
    try {
      setAvatarBusy(true);
      const dest = await ensureAvatarPath(email);
      try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch {}
      await clearAvatar(email);
      setAvatarUri(null);
    } catch (e) {
      // ignore
    } finally {
      setAvatarBusy(false);
    }
  }, [email, hasEmail]);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ORANGE} />}
    >
      <Text style={s.h1}>Profile</Text>
      <Text style={s.sub}>
        {hasEmail ? `Signed in as ${email}` : 'Signed out — sign in to join events and manage balance.'}
      </Text>
      

{/* Profile Photo */}
<View style={s.card}>
  <Text style={s.cardTitle}>Profile photo</Text>
  <View style={s.avatarRow}>
    {avatarUri ? (
      <View style={s.avatarWrap}>
        <Image source={{ uri: avatarUri }} style={s.avatarImg} />
      </View>
    ) : (
      <View style={[s.avatarWrap, s.avatarPlaceholder]}>
        <Text style={s.avatarInitial}>{(user?.email || 'U').charAt(0).toUpperCase()}</Text>
      </View>
    )}

    <View style={{ flex: 1, marginLeft: 14 }}>
      {/* use s.hint or s.subtle if you added it */}
      <Text style={s.hint}>Use a clear headshot. We’ll compress it automatically.</Text>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <Pressable
          disabled={avatarBusy}
          onPress={onChangePhoto}
          style={({ pressed }) => [s.chip, pressed && { opacity: 0.9 }]}
        >
          {avatarBusy ? <ActivityIndicator /> : <Text style={s.chipText}>Change photo</Text>}
        </Pressable>
        {avatarUri ? (
          <Pressable
            disabled={avatarBusy}
            onPress={onRemovePhoto}
            style={({ pressed }) => [s.chipOutline, pressed && { opacity: 0.9 }]}
          >
            <Text style={s.chipOutlineText}>Remove</Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={avatarBusy}
          onPress={() => setShowUrlBox(v => !v)}
          style={({ pressed }) => [s.chipOutline, pressed && { opacity: 0.9 }]}
        >
          <Text style={s.chipOutlineText}>{showUrlBox ? 'Hide URL' : 'Use URL'}</Text>
        </Pressable>
      </View>

      {showUrlBox && (
        <View style={{ marginTop: 10 }}>
          <TextInput
            placeholder="https://example.com/photo.jpg"
            placeholderTextColor={colors.MUTED_TEXT}
            value={urlText}
            onChangeText={setUrlText}
            autoCapitalize="none"
            autoCorrect={false}
            style={s.searchInput}
          />
          {urlCheck === 'checking' && (
            <Text style={s.hint}>Checking URL…</Text>
          )}
          {urlCheck === 'ok' && (
            <Text style={[s.hint, { color: '#4CD964' }]}>
              Looks good ✓ (image, ≤ {(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB)
            </Text>
          )}
          {urlCheck === 'bad' && (
            <Text style={[s.hint, { color: '#FF453A' }]}>
              {urlErr || 'URL is not a valid image'}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Pressable
              disabled={avatarBusy || urlCheck !== 'ok'}
              onPress={onSetPhotoFromUrl}
              style={({ pressed }) => [
                s.chip,
                pressed && { opacity: 0.9 },
                (avatarBusy || urlCheck !== 'ok') && { opacity: 0.5 }
              ]}
            >
              {avatarBusy ? <ActivityIndicator /> : <Text style={s.chipText}>Save URL</Text>}
            </Pressable>
            <Pressable
              disabled={avatarBusy}
              onPress={() => { setShowUrlBox(false); setUrlText(''); }}
              style={({ pressed }) => [s.chipOutline, pressed && { opacity: 0.9 }]}
            >
              <Text style={s.chipOutlineText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
        </View>
      </View>
    </View>

      {/* Balance Card */}
      <View style={s.card}>
        
        <Text style={s.cardTitle}>Balance</Text>
        <View style={s.balanceRow}>
          <Text style={s.balanceText}>
            {balLoading ? 'Loading…' : (balanceDollars == null ? '—' : `$${balanceDollars}`)}
          </Text>
          <Pressable onPress={loadBalanceOnly} style={({ pressed }) => [s.refreshBtn, pressed && { opacity: 0.9 }]}>
            <Text style={s.refreshText}>{balLoading ? '…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {!hasEmail && <Text style={s.hint}>Sign in to see your balance.</Text>}
      </View>

      {/* Joined Events */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Joined Events</Text>

        <View style={s.filtersRow}>
          <Chip label="All"        active={filter==='ALL'}       onPress={() => setFilter('ALL')} />
          <Chip label="Soonest"    active={filter==='SOONEST'}   onPress={() => setFilter('SOONEST')} />
          <Chip label="Newest"     active={filter==='NEWEST'}    onPress={() => setFilter('NEWEST')} />
          <Chip label="In-Person"  active={filter==='IN_PERSON'} onPress={() => setFilter('IN_PERSON')} />
          <Chip label="Online"     active={filter==='ONLINE'}    onPress={() => setFilter('ONLINE')} />
        </View>

        <TextInput
          placeholder="Filter by title or ID"
          placeholderTextColor={colors.MUTED_TEXT}
          value={query}
          onChangeText={setQuery}
          style={s.searchInput}
        />

        {/* Date filter mode */}
        <View style={s.filtersRow}>
          <Chip label="All Dates" active={evDateMode==='ALL'} onPress={() => { setEvDateMode('ALL'); setEvMonthKey(null); setEvWeekRange(null); }} />
          <Chip label="By Month"  active={evDateMode==='MONTH'} onPress={() => { setEvDateMode('MONTH'); setEvWeekRange(null); }} />
          <Chip label="By Week"   active={evDateMode==='WEEK'} onPress={() => { setEvDateMode('WEEK'); setEvMonthKey(null); }} />
        </View>

        {/* Month choices */}
        {evDateMode === 'MONTH' && (
          <View style={s.filtersRow}>
            {monthChoices.map(m => (
              <Chip
                key={m.key}
                label={`${m.label} (${m.count})`}
                active={evMonthKey === m.key}
                onPress={() => { setEvMonthKey(m.key); setEvWeekRange(null); }}
              />
            ))}
          </View>
        )}

        {/* Week choices */}
        {evDateMode === 'WEEK' && (
          <View style={s.filtersRow}>
            {weekChoices.map(w => (
              <Chip
                key={String(w.start)}
                label={w.label}
                active={evWeekRange?.start === w.start}
                onPress={() => { setEvWeekRange({ start: w.start, end: w.end }); setEvMonthKey(null); }}
              />
            ))}
          </View>
        )}

        {loading ? (
          <View style={s.loadingRow}><ActivityIndicator color={colors.ORANGE} /></View>
        ) : !hasEmail ? (
          <Text style={s.hint}>Sign in to view and manage your joined events.</Text>
        ) : rows.length === 0 ? (
          <Text style={s.hint}>No joined events match your filters.</Text>
        ) : (
          <>
            <View style={s.sectionScroll}>
              <ScrollView nestedScrollEnabled>
                <View style={{ gap: 10 }}>
              {limitedRows.map(ev => (
                <View key={ev.id} style={s.joinItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.evTitle} numberOfLines={1}>{ev.title}</Text>
                    <Text style={s.evMeta}>
                      {ev.date} • {ev.locationType === 'online' ? 'Online' : (ev.venue || 'In person')}
                    </Text>
                    <View style={s.idRow}>
                      <IdChip id={ev.id} withCopy />
                      <Text style={s.createdText}>Created {new Date(ev.startTs).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleProfileUnjoin(ev)}
                    disabled={isUnjoining(ev.id)}
                    style={({ pressed }) => [
                      s.unBtn,
                      isUnjoining(ev.id) && { opacity: 0.5 },
                      pressed && !isUnjoining(ev.id) && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={s.unBtnText}>Unjoin</Text>
                  </Pressable>
                </View>
              ))}
                </View>
              </ScrollView>
            </View>

            {(rows.length > evVisibleCount) && (
              <Pressable
                onPress={() => setEvVisibleCount(c => c + 10)}
                style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.loadMoreText}>Load more events ({rows.length - evVisibleCount} more)</Text>
              </Pressable>
            )}
            {(evVisibleCount > 10) && (
              <Pressable
                onPress={() => setEvVisibleCount(10)}
                style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.loadMoreText}>Show less</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* Transactions */}
    <View style={s.card}>
      <Text style={s.cardTitle}>Transactions</Text>

      {/* Sort / Type */}
      <View style={s.filtersRow}>
        <Chip label="Newest"  active={txSort==='NEWEST'}  onPress={() => setTxSort('NEWEST')} />
        <Chip label="Oldest"  active={txSort==='OLDEST'}  onPress={() => setTxSort('OLDEST')} />
        <Chip label="All"     active={txType==='ALL'}     onPress={() => setTxType('ALL')} />
        <Chip label="Credits" active={txType==='CREDITS'} onPress={() => setTxType('CREDITS')} />
        <Chip label="Debits"  active={txType==='DEBITS'}  onPress={() => setTxType('DEBITS')} />
      </View>
      <TextInput
        placeholder="Filter notes…"
        placeholderTextColor={colors.MUTED_TEXT}
        value={txQuery}
        onChangeText={setTxQuery}
        style={s.searchInput}
      />
      {/* Group by period */}
      <View style={s.filtersRow}>
        <Chip label="All"         active={groupBy==='ALL'}   onPress={() => setGroupBy('ALL')} />
        <Chip label="Today"       active={groupBy==='DAY'}   onPress={() => setGroupBy('DAY')} />
        <Chip label="This Month"  active={groupBy==='MONTH'} onPress={() => setGroupBy('MONTH')} />
        <Chip label="This Year"   active={groupBy==='YEAR'}  onPress={() => setGroupBy('YEAR')} />
      </View>

      {histLoading ? (
        <View style={s.loadingRow}><ActivityIndicator color={colors.ORANGE} /></View>
      ) : (history.length === 0 ? (
        <Text style={s.hint}>No transactions yet.</Text>
      ) : (
        <>
          <View style={s.sectionScroll}>
            <ScrollView nestedScrollEnabled>
          {groupHistory(limitedHistory, groupBy === 'ALL' ? 'DAY' : groupBy).map(section => (
            <View key={section.label} style={{ marginTop: 8 }}>
              <Text style={s.sectionLabel}>{section.label}</Text>
              {section.items.map((it, idx) => (
                <View key={idx} style={s.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histNote} numberOfLines={1}>{it.note || '—'}</Text>
                    <Text style={s.histSub}>
                      {new Date(it.ts).toLocaleString()} • Balance: ${centsToDollars(it.balanceAfter)}
                    </Text>
                  </View>
                  <Text style={[s.histAmt, it.delta >= 0 ? s.amtPos : s.amtNeg]}>
                    {formatDelta(it.delta)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
            </ScrollView>
          </View>
          {(filteredHistory.length > txVisibleCount) && (
            <Pressable
              onPress={() => setTxVisibleCount(c => c + 10)}
              style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={s.loadMoreText}>Load more transactions ({filteredHistory.length - txVisibleCount} more)</Text>
            </Pressable>
          )}
          {(txVisibleCount > 10) && (
            <Pressable
              onPress={() => setTxVisibleCount(10)}
              style={({ pressed }) => [s.loadMoreBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={s.loadMoreText}>Show less</Text>
            </Pressable>
          )}
        </>
      ))}
    </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ s.chip, active && s.chipActive, pressed && { opacity: 0.9 } ]} hitSlop={8}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS },
  content: { padding: 16, paddingBottom: 24 },
  h1: { color: colors.TEXT, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.MUTED_TEXT, marginTop: 4, marginBottom: 14 },
  subtle: { color: colors.MUTED_TEXT, fontSize: 12 },

  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: colors.TEXT, fontWeight: '800', fontSize: 16, marginBottom: 8 },

  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceText: { color: colors.TEXT, fontSize: 28, fontWeight: '900' },
  refreshBtn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  refreshText: { color: colors.WHITE, fontWeight: '800' },
  hint: { color: colors.MUTED_TEXT },

  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    backgroundColor: '#1b1b1e',
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.ORANGE, borderColor: colors.ORANGE },
  chipText: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.WHITE },

  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 999,
    overflow: 'hidden',
    borderColor: '#2a2a2a',
    borderWidth: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { backgroundColor: '#1a1a1a' },
  avatarInitial: { color: '#fff', fontWeight: '900', fontSize: 32 },
  
  chipOutline: {
    borderColor: '#3a3a3a',
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  chipOutlineText: { color: colors.WHITE, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },

  searchInput: {
    backgroundColor: '#131316',
    color: colors.TEXT,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  loadingRow: { paddingVertical: 8, alignItems: 'center' },

  joinItem: {
    backgroundColor: '#16161a',
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  evTitle: { color: colors.TEXT, fontSize: 16, fontWeight: '800' },
  evMeta: { color: colors.MUTED_TEXT, fontSize: 12, marginTop: 2 },

  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 },
  createdText: { color: colors.MUTED_TEXT, fontSize: 11 },

  // orange outline Unjoin
  unBtn: {
    borderColor: colors.ORANGE,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'transparent'
  },
  unBtnText: { color: colors.ORANGE, fontWeight: '800' },

  // --- History styles (used soon) ---
  histRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  histNote: { color: colors.TEXT, flex: 1, marginRight: 12, fontSize: 13 },
  histAmt: { fontWeight: '800', fontSize: 13 },
  amtPos: { color: '#4CD964' },
  amtNeg: { color: '#FF453A' },
  sectionLabel: { color: colors.MUTED_TEXT, fontSize: 12, fontWeight: '800', marginBottom: 6 }
  ,histSub: { color: colors.MUTED_TEXT, fontSize: 11, marginTop: 2 }
  ,
  loadMoreBtn: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: '#1b1b1e',
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  loadMoreText: { color: colors.TEXT, fontWeight: '800', fontSize: 13 },
  sectionScroll: { maxHeight: 320 }
});
