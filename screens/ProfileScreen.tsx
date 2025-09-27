import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../theme/colors';
import { loadJoinedMap } from '../utils/joinState';
import { useAuth } from '../providers/AuthProvider';
import api, { getBalance, getUserJoins, grantCredits } from '../services/api';
import IdChip from '../components/IdChip';

async function normalizeJoins(email: string) {
  try {
    const raw = await getUserJoins(email);
    console.log('[Profile][joins] raw =', raw);

    // 1) Try API shapes
    const arr: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.joins)
        ? (raw as any).joins
        : Array.isArray((raw as any)?.events)
          ? (raw as any).events
          : [];

    let ids: string[] = arr
      .map((x) => (typeof x === 'string' ? x : (x?.eventId || x?.id || null)))
      .filter((v): v is string => !!v);

    // 2) Fallback to local persisted join map if API gave us nothing
    if (!ids.length) {
      try {
        const local = await loadJoinedMap(email);
        const fromLocal =
          local && typeof local === 'object'
            ? Object.keys(local).filter((k) => !!(local as any)[k])
            : [];
        console.log('[Profile][joins][fallback local] ids =', fromLocal);
        ids = fromLocal;
      } catch (e) {
        console.log('[Profile][joins][fallback local] error', e);
      }
    }

    console.log('[Profile][joins] ids =', ids);
    return ids;
  } catch (e) {
    console.log('[Profile][joins] error', e);
    // 3) Fallback on error as well
    try {
      const local = await loadJoinedMap(email);
      const fromLocal =
        local && typeof local === 'object'
          ? Object.keys(local).filter((k) => !!(local as any)[k])
          : [];
      console.log('[Profile][joins][fallback on error] ids =', fromLocal);
      return fromLocal;
    } catch {
      return [];
    }
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

  // STEP3: balance-only loading flag
  const [balLoading, setBalLoading] = useState(false);
  const [joinsLoading, setJoinsLoading] = useState(false);
  const balanceDollars = useMemo(
    () => (balanceCents != null ? (balanceCents / 100).toFixed(2) : null),
    [balanceCents]
  );

  const [filter, setFilter] = useState<JoinFilter>('SOONEST');
  const [query, setQuery] = useState<string>('');

  const hydrate = useCallback((ids: string[]): CatalogEvent[] => {
    return ids.map(id => catMap.get(id)).filter(Boolean) as CatalogEvent[];
  }, []);

  const load = useCallback(async () => {
    if (!hasEmail) {
      setBalanceCents(null);
      setJoinedIds([]);
      return;
    }
    setLoading(true);
    setJoinsLoading(true);
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
      setJoinsLoading(false);
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

  const rows = useMemo(() => {
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
    if (!hasEmail) return;
    Alert.alert(
      'Unjoin event',
      `Refund $${ev.fee} and remove “${ev.title}”?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unjoin',
          style: 'destructive',
          onPress: async () => {
            try {
              await grantCredits(email, ev.fee * 100, `unjoin:${ev.id}`); // refund in cents
              await api.unrecordJoin(ev.id, email);                       // remove join
              setJoinedIds(prev => prev.filter(id => id !== ev.id));      // remove from list
              const b = await getBalance(email).catch(() => null);        // refresh balance
              setBalanceCents(b as any);
              Alert.alert('Unjoined', `Refunded $${ev.fee}.`);
            } catch (e: any) {
              Alert.alert('Failed', e?.message || 'Could not unjoin');
            }
          }
        }
      ]
    );
  }, [email, hasEmail]);

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

        {joinsLoading ? (
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
                <Pressable onPress={() => onUnjoin(ev)} style={({ pressed }) => [s.unBtn, pressed && { opacity: 0.85 }]}>
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
