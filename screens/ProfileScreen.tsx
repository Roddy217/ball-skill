import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import api, { getBalance, getUserJoins, grantCredits, getCreditsHistory } from '../services/api';
import { loadJoinedMap, saveJoinedMap, setJoinedLocal } from '../utils/joinState';
import IdChip from '../components/IdChip';

async function normalizeJoins(email: string) {
  try {
    const raw = await getUserJoins(email);
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

type CreditEntry = {
  ts: number;
  delta: number;           // cents, positive or negative
  note?: string | null;
  balanceAfter: number;    // cents
};

// --- UI ---
type JoinFilter = 'ALL' | 'SOONEST' | 'NEWEST' | 'IN_PERSON' | 'ONLINE';

export default function ProfileScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);

  const [loading, setLoading] = useState(false);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

    // Transaction history
    const [histLoading, setHistLoading] = useState(false);
    const [history, setHistory] = useState<CreditEntry[]>([]);
    const [groupBy, setGroupBy] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY');

  // Prevent double-taps / duplicate refunds
  const [unjoiningSet, setUnjoiningSet] = useState<Set<string>>(new Set());
  const isUnjoining = React.useCallback((id: string) => unjoiningSet.has(id), [unjoiningSet]);

  // STEP3: balance-only loading flag
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
    const list = await getCreditsHistory(email, { limit: 100 });
    console.log('[Profile][History] loaded', list.length);
    setHistory(list);
  } catch (e) {
    console.log('[Profile][History][err]', e);
    setHistory([]);
  } finally {
    setHistLoading(false);
  }
}, [email]);

  // Prevent duplicate unjoin/refund calls (critical exploit guard)

  const [filter, setFilter] = useState<JoinFilter>('SOONEST');
  const [query, setQuery] = useState<string>('');

  const hydrate = useCallback((ids: string[]): CatalogEvent[] => {
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
  }, []);

  const load = useCallback(async () => {
    if (!hasEmail) {
      setBalanceCents(null);
      setJoinedIds([]);
      return;
    }
    
    setLoading(true);
    try {
      const [b, j] = await Promise.all([
        getBalance(email).catch(() => null),
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

 // STEP3: Fetch balance only (separate from joined events)
const loadBalanceOnly = useCallback(async () => {
  if (!hasEmail) {
    setBalanceCents(null);
    return;
  }
  try {
    setBalLoading(true);
    console.log('[Profile][Balance] fetching for:', email);
    const b = await getBalance(email);
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
    loadBalanceOnly(); // STEP3: also pull fresh balance on focus
  }, [load, loadBalanceOnly]));

  useFocusEffect(
    useCallback(() => {
      if (!email) return;
      loadHistory();
    }, [email, loadHistory])
  );

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
      await grantCredits(email, fee * 100, `unjoin:${ev.id}`);
      console.log('[Profile][unjoin] grantCredits OK', ev.id, fee * 100);
    }

    // 4) update UI + balance
    setJoinedIds(prev => prev.filter(id => id !== ev.id));
    const cents = await getBalance(email).catch(() => null);
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
  }, [email, getBalance, grantCredits]
);
  
  const rows = useMemo(() => {
    console.log('[Profile][hydrate] joinedIds =', joinedIds);
    let events = hydrate(joinedIds);
    if (filter === 'IN_PERSON') events = events.filter(e => e.locationType === 'in_person');
    if (filter === 'ONLINE')    events = events.filter(e => e.locationType === 'online');
    if (filter === 'SOONEST')   events = [...events].sort((a, b) => a.startTs - b.startTs);
    if (filter === 'NEWEST')    events = [...events].sort((a, b) => b.startTs - a.startTs);
    const q = query.trim().toLowerCase();
    if (q) events = events.filter(e => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    return events;
  }, [joinedIds, filter, query, hydrate]);

  const onUnjoin = useCallback((ev: CatalogEvent) => {
    // Route all unjoin actions through the single guarded handler to avoid duplicates.
    handleProfileUnjoin(ev);
  }, [handleProfileUnjoin]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

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

        {loading ? (
          <View style={s.loadingRow}><ActivityIndicator color={colors.ORANGE} /></View>
        ) : !hasEmail ? (
          <Text style={s.hint}>Sign in to view and manage your joined events.</Text>
        ) : rows.length === 0 ? (
          <Text style={s.hint}>No joined events match your filters.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {rows.map(ev => (
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
        )}
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
});
