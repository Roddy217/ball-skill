import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Switch, TouchableOpacity, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { getRegistrationStatus, loadApiBase, getApiBase, getBalance } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '../services/api';
import IdChip from '../components/IdChip';
import { loadJoinedMap, saveJoinedMap, setJoinedLocal } from '../utils/joinState';
import { useAuth } from '../providers/AuthProvider';

console.log('[Events] api keys:', Object.keys(api));

const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');
const API = `${SERVER}/api`;

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
  totalSpots?: number;
  participantCounts?: ParticipantCounts;
};

type SortFilter =
  | 'ALL'
  | 'SOONEST'
  | 'NEWEST'
  | 'IN_PERSON'
  | 'ONLINE'
  | 'PRICE_ASC'
  | 'PRICE_DESC'
  | 'JOINED';

const baseSeed: EventItem[] = [
  { id: 'evt_001', title: 'Ball Skill Combine', date: 'Sat, Sep 20 • 10:00 AM', startTs: new Date('2025-09-20T10:00:00-04:00').getTime(), locationType: 'in_person', venue: 'Hoop City Gym', fee: 10, spotsLeft: 8, drills: ['3PT','Midrange','Handles'] },
  { id: 'evt_002', title: 'Virtual Shooting Clinic', date: 'Sun, Sep 21 • 6:00 PM', startTs: new Date('2025-09-21T18:00:00-04:00').getTime(), locationType: 'online', fee: 10, spotsLeft: 20, drills: ['Form','Release'] },
  { id: 'evt_003', title: 'Guard Skills Lab', date: 'Tue, Sep 23 • 7:30 PM', startTs: new Date('2025-09-23T19:30:00-04:00').getTime(), locationType: 'in_person', venue: 'Downtown Rec Center', fee: 10, spotsLeft: 3, drills: ['Handles','Finishing','Footwork'] },
];

//Demo event for testing join/unjoin
const TEST_EVENT: EventItem = {
  id: 'evt_TEST',
  title: '🧪 Test Sync Event',
  date: 'Today • 8:00 PM',
  startTs: Date.now() + 60 * 60 * 1000,
  locationType: 'in_person',
  venue: 'Lab Gym',
  fee: 10,
  spotsLeft: 9,
  drills: ['Sync', 'Join', 'Unjoin'],
};

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

type ParticipantCounts = { teen: number; adult: number; pro: number; celebrity: number };

function ParticipantBreakdown({ totalSpots = 100, counts }: { totalSpots?: number; counts: ParticipantCounts }) {
  const teen = counts?.teen || 0;
  const adult = counts?.adult || 0;
  const pro = counts?.pro || 0;
  const celebrity = counts?.celebrity || 0;
  const registered = teen + adult + pro + celebrity;
  const cap = Math.max(1, totalSpots || 1);
  const pct = (n: number) => Math.min(100, Math.round((n / cap) * 100));

  const BAR_BG = '#1b1b1e';
  const TEEN = '#6EA8FF';        // blue
  const ADULT = '#7DFF70';       // green
  const PRO = '#FFB84D';         // orange-gold
  const CELEB = '#FF6B6B';       // red

  return (
    <>
      <View style={{ marginTop: 8 }}>
        <View style={{ height: 10, backgroundColor: BAR_BG, borderRadius: 999, overflow: 'hidden', flexDirection: 'row' }}>
          <View style={{ width: `${pct(teen)}%`, backgroundColor: TEEN }} />
          <View style={{ width: `${pct(adult)}%`, backgroundColor: ADULT }} />
          <View style={{ width: `${pct(pro)}%`, backgroundColor: PRO }} />
          <View style={{ width: `${pct(celebrity)}%`, backgroundColor: CELEB }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ color: '#eaeaea', fontSize: 12 }}>
            {cap} spots available, {registered} registered
          </Text>
          <Text style={{ color: '#eaeaea', fontSize: 12 }}>
            {pct(registered)}%
          </Text>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 6, gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="sparkles" size={14} color={TEEN} />
            <Text style={{ color: '#cfcfcf', fontSize: 12 }}>Teens: <Text style={{ fontWeight: '800', color: '#fff' }}>{teen}</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="person" size={14} color={ADULT} />
            <Text style={{ color: '#cfcfcf', fontSize: 12 }}>Adults: <Text style={{ fontWeight: '800', color: '#fff' }}>{adult}</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trophy" size={14} color={PRO} />
            <Text style={{ color: '#cfcfcf', fontSize: 12 }}>Pro: <Text style={{ fontWeight: '800', color: '#fff' }}>{pro}</Text></Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="star" size={14} color={CELEB} />
            <Text style={{ color: '#cfcfcf', fontSize: 12 }}>Celebrity: <Text style={{ fontWeight: '800', color: '#fff' }}>{celebrity}</Text></Text>
          </View>
        </View>
      </View>
    </>
  );
}

// ---- Server events fetch helper (top-level) ----
async function fetchServerEvents(): Promise<Array<any>> {
  const res = await fetch(`${API}/events`).then(r => r.json()).catch(() => ({ success:false, events:[] }));
  return Array.isArray(res?.events) ? res.events : [];
}

// ---- Live Events Section component ----
function LiveEventsSection({ loading, events, onRefresh }: { loading: boolean; events: any[]; onRefresh: () => void }) {
  return (
    <View style={{ marginTop: 16, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Live Events</Text>
        <TouchableOpacity onPress={onRefresh} disabled={loading} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#1f1f22', borderColor: '#2a2a2a', borderWidth: 1 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <Text style={{ color: '#9a9a9a', marginTop: 8 }}>Loading…</Text>
      ) : events.length === 0 ? (
        <Text style={{ color: '#9a9a9a', marginTop: 8 }}>No live events yet.</Text>
      ) : (
        <View style={{ marginTop: 8, gap: 12 }}>
          {events.map((ev:any) => (
            <View key={ev.id} style={{ backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 12, padding: 12 }}>
              <Text style={{ color:'#fff', fontWeight:'800' }}>{ev.name || 'Event'}</Text>
              <Text style={{ color:'#9a9a9a', marginTop: 2 }}>{new Date(ev.dateISO || Date.now()).toLocaleString()}</Text>
              {ev.feeCents != null && (
                <Text style={{ color:'#9a9a9a', marginTop: 2 }}>Fee: ${(Number(ev.feeCents)/100).toFixed(2)}</Text>
              )}
              <Text style={{ color:'#9a9a9a', marginTop: 2 }}>ID: {ev.id}</Text>
              {ev.participantCounts && (
                <ParticipantBreakdown totalSpots={ev.totalSpots} counts={ev.participantCounts} />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---- Participants API helpers (reuse your api client if you already have one) ----
async function fetchEventsList() {
  const base = (api?.getApiBase?.() || '').replace(/\/$/, '');
  const res = await fetch(`${base}/events`).then(r => r.json());
  return res?.events || [];
}

async function upsertParticipants(eventId: string, payload: { teen?: number; adult?: number; pro?: number; celebrity?: number; totalSpots?: number; }) {
  const base = (api?.getApiBase?.() || '').replace(/\/$/, '');
  const res = await fetch(`${base}/events/${eventId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json());
  return res;
}

export default function EventsScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);
  const userEmail = email; // ensure the variable used below actually exists
  const [filter, setFilter] = useState<SortFilter>('SOONEST');
  const [apiBase, setApiBaseState] = useState<string>('');
  const [balance, setBalance] = useState<string | null>(null)

  const [pool, setPool] = useState<EventItem[]>(() => {
    const first: EventItem[] = [...baseSeed]; //test event line
    for (let i = 4; i <= 20; i++) first.push(generateEvent(i));
    return first;
  });

  const PAGE_SIZE = 10;
  const MAX_DEMO_EVENTS = 30; // hard cap to stop endless demo generation
  const [page, setPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [joinedMap, setJoinedMap] = useState<Record<string, boolean>>({});
  const [joiningMap, setJoiningMap] = useState<Record<string, boolean>>({});

  // --- Demo: Participant Editor toggle + fields ---
  const [demoParticipantsEnabled, setDemoParticipantsEnabled] = useState(false);
  const [peEventId, setPeEventId] = useState('');
  const [peTeen, setPeTeen] = useState<string>('');
  const [peAdult, setPeAdult] = useState<string>('');
  const [pePro, setPePro] = useState<string>('');
  const [peCeleb, setPeCeleb] = useState<string>('');
  const [peTotalSpots, setPeTotalSpots] = useState<string>('100');
  const [peLoading, setPeLoading] = useState(false);
  const [peEvents, setPeEvents] = useState<Array<{ id: string; name?: string }>>([]);

  const [serverEvents, setServerEvents] = React.useState<Array<any>>([]);
  const [serverLoading, setServerLoading] = React.useState(false);

  const reloadServerEvents = React.useCallback(async () => {
    try {
      setServerLoading(true);
      const list = await fetchServerEvents();
      setServerEvents(list);
    } finally {
      setServerLoading(false);
    }
  }, []);

  // initial load
  useEffect(() => { reloadServerEvents(); }, [reloadServerEvents]);

  // refresh when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      reloadServerEvents();
      return () => {};
    }, [reloadServerEvents])
  );

  const loadEventsIntoPicker = async () => {
    try {
      setPeLoading(true);
      const list = await fetchEventsList();
      setPeEvents(list.map((e: any) => ({ id: e.id, name: e.name })));
      if (!peEventId && list.length > 0) setPeEventId(list[0].id);
    } catch (e) {
      console.warn('[Admin][participants] load events failed', e);
    } finally {
      setPeLoading(false);
    }
  };

  
  const saveParticipants = async () => {
    if (!peEventId) return;
    try {
      setPeLoading(true);
      const payload = {
        teen: Number.isFinite(Number(peTeen)) && peTeen !== '' ? Math.max(0, Math.floor(Number(peTeen))) : undefined,
        adult: Number.isFinite(Number(peAdult)) && peAdult !== '' ? Math.max(0, Math.floor(Number(peAdult))) : undefined,
        pro: Number.isFinite(Number(pePro)) && pePro !== '' ? Math.max(0, Math.floor(Number(pePro))) : undefined,
        celebrity: Number.isFinite(Number(peCeleb)) && peCeleb !== '' ? Math.max(0, Math.floor(Number(peCeleb))) : undefined,
        totalSpots: Number.isFinite(Number(peTotalSpots)) && peTotalSpots !== '' ? Math.max(0, Math.floor(Number(peTotalSpots))) : undefined,
      };
      const res = await upsertParticipants(peEventId, payload);
      if (!res?.success) {
        console.warn('[Admin][participants] save failed', res);
        alert('Save failed');
      } else {
        alert('Participants updated');
      }
    } catch (e) {
      console.warn('[Admin][participants] save error', e);
      alert('Save error');
    } finally {
      setPeLoading(false);
    }
  };
  
  const ensurePoolSize = useCallback((targetSize: number) => {
    // Cap the auto-generated demo list so the FlatList actually ends
    const cap = Math.min(targetSize, MAX_DEMO_EVENTS);
    if (pool.length >= cap) return;
    const next: EventItem[] = [...pool];
    const start = pool.length + 1;
    for (let i = start; i <= cap; i++) next.push(generateEvent(i));
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
    if (filter === 'JOINED')   rows = rows.filter(r => !!joinedMap[r.id]);
    const total = rows.length;
    const end = Math.min(page * PAGE_SIZE, total);
    return { visibleRows: rows.slice(0, end), totalAfterFilter: total };
  }, [pool, filter, page, joinedMap]);

  const hasMore = pool.length < MAX_DEMO_EVENTS && visibleRows.length < totalAfterFilter;

  const onSelectFilter = (f: SortFilter) => { setFilter(f); setPage(1); };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    // Do not schedule more pages once we hit the demo cap
    if (pool.length >= MAX_DEMO_EVENTS) return;
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

  /// Also refresh API base whenever this screen gains focus (after Admin Save)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await loadApiBase();
        if (!alive) return;
        const base = getApiBase();
        setApiBaseState(base);
        // NOTE: Do NOT clear or mutate joinedMap here.
        // If you ever need to re-hydrate on base change:
        // if (userEmail) { const local = await loadJoinedMap(userEmail); if (alive) setJoinedMap(local || {}); }
      })();
      return () => { alive = false; };
    }, [/* no deps */])
  );

  // Re-hydrate joined flags from LOCAL cache on focus (no server reads/writes here)
useFocusEffect(
  useCallback(() => {
    let alive = true;
    (async () => {
      if (!userEmail) {
        if (alive) setJoinedMap({});
        return;
      }
      const local = await loadJoinedMap(userEmail);  // ← LOCAL only
      if (!alive) return;
      console.log('[Events][focus] loadJoinedMap keys =', Object.keys(local || {}));
      setJoinedMap(local || {});
    })();
    return () => { alive = false; };
  }, [userEmail])
);
  
  // Prefetch registration status for visible items
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const evt of visibleRows) {
        if (joinedMap[evt.id] !== undefined) continue;
        try {
        const { registered } = await getRegistrationStatus(userEmail, evt.id);
        if (!cancelled) {
          setJoinedMap(prev => ({ ...prev, [evt.id]: !!registered }));
        }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [visibleRows, userEmail, joinedMap]);

  const onJoin = async (evt: EventItem) => {
    // guard: don't re-enter and don't auto-join when already joined
    if (joiningMap[evt.id] || joinedMap[evt.id]) return;
    if (!hasEmail) {
      Alert.alert('Sign in', 'Please sign in on the Profile tab to join this event.');
      return;
    }

    setJoiningMap(prev => ({ ...prev, [evt.id]: true }));
    try {
      const fee = Math.abs(Number(evt.fee) || 0);
      if (fee > 0) {
        await api.grantCredits(userEmail, -(fee * 100), `join:${evt.id}`);
      }
      await api.recordJoin(evt.id, userEmail);
      await setJoinedLocal(userEmail, evt.id, true);

      // mark as joined locally
      setJoinedMap(prev => {
        const next = { ...prev, [evt.id]: true };
        saveJoinedMap(userEmail, next).catch(() => {});
        return next;
      });
      

      // fetch and show new balance (convert cents→dollars if needed)
      const cents = await getBalance(userEmail);
      const dollars = typeof cents === 'number' ? (cents / 100).toFixed(2) : String(cents);
      Alert.alert('Joined', `Fee: ${fee}\nNew balance: ${dollars}`);
    } catch (e: any) {
      Alert.alert('Join failed', e?.message || 'Unknown error');
    } finally {
      setJoiningMap(prev => ({ ...prev, [evt.id]: false }));
    }
  };

  // Chips header with API base badge
  const onUnjoin = async (evt: EventItem) => {
    if (!hasEmail) {
      Alert.alert('Sign in', 'Please sign in on the Profile tab to unjoin this event.');
      return;
    }
    if (joiningMap[evt.id]) return;

    Alert.alert(
      'Unjoin event',
      `Refund ${Math.abs(Number(evt.fee) || 0)} for "${evt.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unjoin',
          style: 'destructive',
          onPress: async () => {
            setJoiningMap(prev => ({ ...prev, [evt.id]: true }));
            try {
              // remove join on server
              await api.unrecordJoin(evt.id, userEmail);
              await setJoinedLocal(userEmail, evt.id, false);
              
              // persist local flag false
              await setJoinedLocal(userEmail, evt.id, false);

              // update in-memory state immediately so prefetch won't flip it back
              setJoinedMap(prev => ({ ...prev, [evt.id]: false }));

              // refund credits (cents)
              const fee = Math.abs(Number(evt.fee) || 0);
              if (fee > 0) {
                await api.grantCredits(userEmail, fee * 100, `unjoin:${evt.id}`);
              }

              // show new balance
              const cents = await getBalance(userEmail);
              const dollars = typeof cents === 'number' ? (cents / 100).toFixed(2) : String(cents);
              Alert.alert('Unjoined', `Refund: ${fee}\nNew balance: ${dollars}`);
              console.log('[Events][Unjoin] new balance for', userEmail, '→', dollars);
            } catch (e: any) {
              Alert.alert('Unjoin failed', e?.message || 'Unknown error');
            } finally {
              setJoiningMap(prev => ({ ...prev, [evt.id]: false }));
            }
          },
        },
      ],
    );
  };
  const ChipsHeader = (
    <View style={s.chipsSticky}>
      <View style={s.chipsRowTop} />
      <View style={s.chipsGroup}>
        <Chip label="All"        active={filter==='ALL'}        onPress={() => onSelectFilter('ALL')} />
        <Chip label="Soonest"    active={filter==='SOONEST'}    onPress={() => onSelectFilter('SOONEST')} />
        <Chip label="Newest"     active={filter==='NEWEST'}     onPress={() => onSelectFilter('NEWEST')} />
        <Chip label="In-Person"  active={filter==='IN_PERSON'}  onPress={() => onSelectFilter('IN_PERSON')} />
        <Chip label="Online"     active={filter==='ONLINE'}     onPress={() => onSelectFilter('ONLINE')} />
        <Chip label="Joined"    active={filter==='JOINED'}    onPress={() => onSelectFilter('JOINED')} />
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
            onJoin={() => (joinedMap[item.id] ? onUnjoin(item) : onJoin(item))}
          />
        )}
        ListHeaderComponent={ChipsHeader}
        stickyHeaderIndices={[0]}
        ListHeaderComponentStyle={s.chipsSticky}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          <View>
            {loadingMore
              ? <View style={s.footerLoading}><ActivityIndicator /></View>
              : !hasMore
                ? <View style={s.footerEnd}><Text style={s.endText}>You’re all caught up</Text></View>
                : null}
            <LiveEventsSection loading={serverLoading} events={serverEvents} onRefresh={reloadServerEvents} />
          </View>
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

<View style={s.idRow}>
  <IdChip id={item.id} withCopy />
  <Text style={s.createdText}>Created {new Date(item.startTs).toLocaleDateString()}</Text>
</View>

      {item.drills?.length ? (
        <View style={s.drillChipsRow}>
          {item.drills.map(d => <View key={d} style={s.drillChip}><Text style={s.drillChipText}>{d}</Text></View>)}
        </View>
      ) : null}

      {item.participantCounts && (
        <ParticipantBreakdown totalSpots={item.totalSpots} counts={item.participantCounts} />
      )}

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

  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  createdText: { color: colors.MUTED_TEXT, fontSize: 11 },

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
