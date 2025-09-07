import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { getRegistrationStatus, joinEventWithCredits, loadApiBase, getApiBase, getBalance } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';

type EventItem = {
  id: string;
  title: string;
  date: string;
  startTs: number;
  locationType: 'in_person' | 'online';
  venue?: string;
  fee: number;
  spotsLeft: number;
  drills?: string[];
};

type SortFilter =
  | 'ALL'
  | 'SOONEST'
  | 'NEWEST'
  | 'IN_PERSON'
  | 'ONLINE'
  | 'PRICE_ASC'
  | 'PRICE_DESC';

const baseSeed: EventItem[] = [
  { id: 'evt_001', title: 'Ball Skill Combine', date: 'Sat, Sep 20 • 10:00 AM', startTs: new Date('2025-09-20T10:00:00-04:00').getTime(), locationType: 'in_person', venue: 'Hoop City Gym', fee: 10, spotsLeft: 8, drills: ['3PT','Midrange','Handles'] },
  { id: 'evt_002', title: 'Virtual Shooting Clinic', date: 'Sun, Sep 21 • 6:00 PM', startTs: new Date('2025-09-21T18:00:00-04:00').getTime(), locationType: 'online', fee: 10, spotsLeft: 20, drills: ['Form','Release'] },
  { id: 'evt_003', title: 'Guard Skills Lab', date: 'Tue, Sep 23 • 7:30 PM', startTs: new Date('2025-09-23T19:30:00-04:00').getTime(), locationType: 'in_person', venue: 'Downtown Rec Center', fee: 10, spotsLeft: 3, drills: ['Handles','Finishing','Footwork'] },
];

function generateEvent(idx: number): EventItem {
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
    spotsLeft: Math.max(1, 20 - (idx % 7)),
    drills: isOnline ? ['Form','Release'] : ['Handles','Footwork'],
  };
}

export default function EventsScreen() {
  const [filter, setFilter] = useState<SortFilter>('SOONEST');
  const [apiBase, setApiBaseState] = useState<string>('');

  // TODO(auth): replace with real user email
  const userEmail = 'demo@ballskill.app';

  const [pool, setPool] = useState<EventItem[]>(() => {
    const first: EventItem[] = [...baseSeed];
    for (let i = 4; i <= 20; i++) first.push(generateEvent(i));
    return first;
  });

  const PAGE_SIZE = 10;
  const [page, setPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [joinedMap, setJoinedMap] = useState<Record<string, boolean>>({});
  const [joiningMap, setJoiningMap] = useState<Record<string, boolean>>({});

  const ensurePoolSize = useCallback((targetSize: number) => {
    if (pool.length >= targetSize) return;
    const next: EventItem[] = [...pool];
    for (let i = pool.length + 1; i <= targetSize; i++) next.push(generateEvent(i));
    setPool(next);
  }, [pool]);

  const { visibleRows, totalAfterFilter } = useMemo(() => {
    let rows = [...pool];
    if (filter === 'IN_PERSON') rows = rows.filter(r => r.locationType === 'in_person');
    if (filter === 'ONLINE')    rows = rows.filter(r => r.locationType === 'online');
    if (filter === 'SOONEST')   rows.sort((a, b) => a.startTs - b.startTs);
    if (filter === 'NEWEST')    rows.sort((a, b) => b.startTs - a.startTs);
    if (filter === 'PRICE_ASC') rows.sort((a, b) => a.fee - b.fee);
    if (filter === 'PRICE_DESC')rows.sort((a, b) => b.fee - a.fee);
    const total = rows.length;
    const end = Math.min(page * PAGE_SIZE, total);
    return { visibleRows: rows.slice(0, end), totalAfterFilter: total };
  }, [pool, filter, page]);

  const hasMore = visibleRows.length < totalAfterFilter;

  const onSelectFilter = (f: SortFilter) => { setFilter(f); setPage(1); };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      ensurePoolSize((page + 1) * PAGE_SIZE + 5);
      setPage(p => p + 1);
      setLoadingMore(false);
    }, 350);
  };

  // Load saved API base on mount
  useEffect(() => {
    (async () => {
      await loadApiBase();
      setApiBaseState(getApiBase());
    })();
  }, []);

  // Also refresh API base whenever this screen gains focus (after Admin Save)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await loadApiBase();
        setApiBaseState(getApiBase());
        // Clear and refetch “joined” flags when API base changes
        setJoinedMap({});
      })();
    }, [])
  );

  // Prefetch registration status for visible items
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const evt of visibleRows) {
        if (joinedMap[evt.id] !== undefined) continue;
        try {
          const joined = await getRegistrationStatus(evt.id, userEmail);
          if (!cancelled) setJoinedMap(prev => ({ ...prev, [evt.id]: joined }));
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [visibleRows, userEmail, joinedMap]);

  const onJoin = async (evt: EventItem) => {
    if (joiningMap[evt.id]) return;

    // If already joined, surface the info (no extra charge)
    if (joinedMap[evt.id]) {
      Alert.alert('Already joined', 'You are already registered for this event.');
      return;
    }

    setJoiningMap(prev => ({ ...prev, [evt.id]: true }));
    try {
      const res = await joinEventWithCredits(evt.id, userEmail, evt.fee);
      if (res.success) {
        setJoinedMap(prev => ({ ...prev, [evt.id]: true }));
        // Show balance after join (or after noticing we were already joined)
        const bal = await getBalance(userEmail);
        if (res.already) {
          Alert.alert('Already joined', `No additional charge.\nCurrent balance: ${bal ?? '—'}`);
        } else {
          Alert.alert('Joined', `Fee: ${res.fee ?? evt.fee}\nNew balance: ${bal ?? '—'}`);
        }
      } else {
        Alert.alert('Join failed', res.error || res.message || 'Unknown error');
      }
    } catch (e: any) {
      Alert.alert('Join failed', e?.message || 'Unknown error');
    } finally {
      setJoiningMap(prev => ({ ...prev, [evt.id]: false }));
    }
  };

  // Chips header with API base badge
  const ChipsHeader = (
    <View style={s.chipsSticky}>
      <View style={s.chipsRowTop}>
        <Text style={s.apiBadge} numberOfLines={1}>API: {apiBase ? apiBase.replace(/^https?:\/\//,'') : '—'}</Text>
      </View>
      <View style={s.chipsGroup}>
        <Chip label="All"        active={filter==='ALL'}        onPress={() => onSelectFilter('ALL')} />
        <Chip label="Soonest"    active={filter==='SOONEST'}    onPress={() => onSelectFilter('SOONEST')} />
        <Chip label="Newest"     active={filter==='NEWEST'}     onPress={() => onSelectFilter('NEWEST')} />
        <Chip label="In-Person"  active={filter==='IN_PERSON'}  onPress={() => onSelectFilter('IN_PERSON')} />
        <Chip label="Online"     active={filter==='ONLINE'}     onPress={() => onSelectFilter('ONLINE')} />
        <Chip label="Price ↑"    active={filter==='PRICE_ASC'}  onPress={() => onSelectFilter('PRICE_ASC')} />
        <Chip label="Price ↓"    active={filter==='PRICE_DESC'} onPress={() => onSelectFilter('PRICE_DESC')} />
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <FlatList
        data={visibleRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        renderItem={({ item }) => (
          <EventCard
            item={item}
            joined={!!joinedMap[item.id]}
            joining={!!joiningMap[item.id]}
            onJoin={() => onJoin(item)}
          />
        )}
        ListHeaderComponent={ChipsHeader}
        stickyHeaderIndices={[0]}
        ListHeaderComponentStyle={s.chipsSticky}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore
            ? <View style={s.footerLoading}><ActivityIndicator /></View>
            : !hasMore
              ? <View style={s.footerEnd}><Text style={s.endText}>You’re all caught up</Text></View>
              : null
        }
      />
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ s.chip, active && s.chipActive, pressed && { opacity: 0.9 } ]}
      hitSlop={8}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EventCard({ item, joined, joining, onJoin }: {
  item: EventItem; joined: boolean; joining: boolean; onJoin: () => void;
}) {
  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text style={s.title} numberOfLines={1}>{item.title}</Text>
        <View style={s.priceBadge}><Text style={s.priceText}>${item.fee}</Text></View>
      </View>

      <View style={s.metaRow}>
        <Ionicons name="time-outline" size={16} color={colors.MUTED_TEXT} style={s.metaIcon} />
        <Text style={s.metaText}>{item.date}</Text>
      </View>
      <View style={s.metaRow}>
        <Ionicons name={item.locationType === 'online' ? 'wifi-outline' : 'location-outline'} size={16} color={colors.MUTED_TEXT} style={s.metaIcon} />
        <Text style={s.metaText}>{item.locationType === 'online' ? 'Online' : item.venue ?? 'In person'}</Text>
      </View>

      {item.drills?.length ? (
        <View style={s.drillChipsRow}>
          {item.drills.map(d => <View key={d} style={s.drillChip}><Text style={s.drillChipText}>{d}</Text></View>)}
        </View>
      ) : null}

      <View style={s.footerRow}>
        <Text style={s.spotsText}>{item.spotsLeft} spot{item.spotsLeft === 1 ? '' : 's'} left</Text>
        <Pressable
          onPress={onJoin}
          disabled={joining} // NOTE: only disable while joining (allow taps when already joined)
          style={({ pressed }) => [
            s.ctaBtn,
            (joined || joining) && s.ctaBtnDisabled,
            pressed && !joining && { opacity: 0.9 },
          ]}
        >
          {joining ? (
            <ActivityIndicator color={colors.WHITE} />
          ) : joined ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color={colors.WHITE} />
              <Text style={s.ctaText}>Joined</Text>
            </>
          ) : (
            <>
              <Text style={s.ctaText}>Join Event</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.WHITE} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  chipsSticky: { backgroundColor: colors.CANVAS },
  chipsRowTop: { paddingHorizontal: 16, paddingTop: 8 },
  apiBadge: { maxWidth: '100%', color: colors.MUTED_TEXT, fontSize: 11 },
  chipsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
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

  sep: { height: 12 },

  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.TEXT, fontSize: 18, fontWeight: '800', flex: 1, paddingRight: 8 },
  priceBadge: {
    backgroundColor: '#1f1f22',
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 58,
    alignItems: 'center',
  },
  priceText: { color: colors.TEXT, fontWeight: '800' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  metaIcon: { marginRight: 6, marginTop: 1 },
  metaText: { color: colors.MUTED_TEXT, fontSize: 13 },

  drillChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  drillChip: {
    backgroundColor: '#1b1b1e',
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  drillChipText: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },

  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  spotsText: { color: colors.MUTED_TEXT, fontSize: 13 },

  ctaBtn: {
    backgroundColor: colors.ORANGE,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctaBtnDisabled: { backgroundColor: '#a9a9a9' },
  ctaText: { color: colors.WHITE, fontWeight: '800', fontSize: 14 },

  footerLoading: { paddingVertical: 18, alignItems: 'center' },
  footerEnd: { paddingVertical: 14, alignItems: 'center' },
  endText: { color: colors.MUTED_TEXT, fontSize: 12 },
});
