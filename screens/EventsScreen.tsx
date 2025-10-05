import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Switch, TouchableOpacity, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
function LiveEventsSection({
  loading, events, onRefresh,
  joinedMap, joiningMap,
  getJoinWallet, setJoinWalletByEvent,
  onJoinLive, onUnjoinLive, hasEmail
}: {
  loading: boolean;
  events: any[];
  onRefresh: () => void;
  joinedMap: Record<string, boolean>;
  joiningMap: Record<string, boolean>;
  getJoinWallet: (id: string) => 'skill' | 'dollars';
  setJoinWalletByEvent: React.Dispatch<React.SetStateAction<Record<string, 'skill' | 'dollars'>>>;
  onJoinLive: (ev: any) => void;
  onUnjoinLive: (ev: any) => void;
  hasEmail: boolean;
}) {
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
          
            {/* Wallet picker for live join */}
            <Text style={{ color:'#cfcfcf', marginTop:10, fontSize:12, fontWeight:'700' }}>Join with wallet</Text>
            <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
              <TouchableOpacity
                onPress={() => setJoinWalletByEvent(prev => ({ ...prev, [ev.id]:'skill' }))}
                style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:6, borderWidth:1, borderColor: getJoinWallet(ev.id)==='skill' ? '#FFB84D' : '#333', backgroundColor: getJoinWallet(ev.id)==='skill' ? '#2a200f' : '#1a1a1a' }}
              >
                <Text style={{ color:'#fff', fontWeight:'800' }}>$Skill</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setJoinWalletByEvent(prev => ({ ...prev, [ev.id]:'dollars' }))}
                style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:6, borderWidth:1, borderColor: getJoinWallet(ev.id)==='dollars' ? '#7DFF70' : '#333', backgroundColor: getJoinWallet(ev.id)==='dollars' ? '#103014' : '#1a1a1a' }}
              >
                <Text style={{ color:'#fff', fontWeight:'800' }}>$Dollars</Text>
              </TouchableOpacity>
            </View>
          
            {/* Join/Unjoin */}
            <View style={{ marginTop: 10, flexDirection:'row', justifyContent:'flex-end', alignItems:'center' }}>
              {joiningMap[ev.id] ? (
                <ActivityIndicator color="#fff" />
              ) : joinedMap[ev.id] ? (
                <TouchableOpacity onPress={() => onUnjoinLive(ev)} style={{ backgroundColor:'#a9a9a9', borderRadius:10, paddingVertical:8, paddingHorizontal:12 }}>
                  <Text style={{ color:'#000', fontWeight:'800' }}>Joined • Unjoin</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => onJoinLive(ev)} disabled={!hasEmail} style={{ backgroundColor:'#FF6600', borderRadius:10, paddingVertical:8, paddingHorizontal:12 }}>
                  <Text style={{ color:'#fff', fontWeight:'800' }}>Join Event</Text>
                </TouchableOpacity>
              )}
            </View>
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
  // Per-demo-event wallet choice (UI only, no server impact)
  const [joinWalletByDemo, setJoinWalletByDemo] = useState<Record<string, 'skill'|'dollars'>>({});
  const getDemoJoinWallet = useCallback((id: string) => joinWalletByDemo[id] || 'dollars', [joinWalletByDemo]);

  // Per-event wallet choice for joining live events
  const [joinWalletByEvent, setJoinWalletByEvent] = useState<Record<string, 'skill'|'dollars'>>({});
  const getJoinWallet = useCallback((id: string) => joinWalletByEvent[id] || 'dollars', [joinWalletByEvent]);

  // Demo wallet simulation (local-only offsets applied to Earnings screen when enabled)
  const [demoSimEnabled, setDemoSimEnabled] = useState<boolean>(false);
  // Displayed offsets (in cents) for current user when demo sim is ON
  const [demoOffsets, setDemoOffsets] = useState<{ skill: number; dollars: number }>({ skill: 0, dollars: 0 });
  const fmtMoney = useCallback((c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}` , []);

  const DEMO_SIM_KEY = 'demoSimEnabled';
  const DEMO_OFFSETS_KEY = (email: string) => `demoWalletOffsets:${email}`;

  const loadDemoSim = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DEMO_SIM_KEY);
      setDemoSimEnabled(raw === '1');
    } catch {}
  }, []);

  const saveDemoSim = useCallback(async (on: boolean) => {
    setDemoSimEnabled(on);
    try { await AsyncStorage.setItem(DEMO_SIM_KEY, on ? '1' : '0'); } catch {}
  }, []);

  const loadDemoOffsets = useCallback(async (email: string) => {
    if (!email) return { skill: 0, dollars: 0 };
    try {
      const raw = await AsyncStorage.getItem(DEMO_OFFSETS_KEY(email));
      if (!raw) return { skill: 0, dollars: 0 };
      const o = JSON.parse(raw);
      return { skill: Number(o?.skill||0), dollars: Number(o?.dollars||0) };
    } catch { return { skill: 0, dollars: 0 }; }
  }, []);

  const saveDemoOffsets = useCallback(async (email: string, offsets: { skill: number; dollars: number }) => {
    if (!email) return;
    try { await AsyncStorage.setItem(DEMO_OFFSETS_KEY(email), JSON.stringify(offsets)); } catch {}
  }, []);

  const resetDemoOffsets = useCallback(async (email: string) => {
    if (!email) return;
    try {
      const zeros = { skill: 0, dollars: 0 };
      await saveDemoOffsets(email, zeros);
      setDemoOffsets(zeros);
      Alert.alert('Demo offsets reset', 'Local demo wallet adjustments cleared for this user.');
    } catch (e) {
      Alert.alert('Reset failed', 'Could not clear demo offsets.');
    }
  }, [saveDemoOffsets]);

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

  // Load demo simulation flag on mount
  useEffect(() => { loadDemoSim(); }, [loadDemoSim]);

  // Load current offsets when demo sim toggles or user changes
  useEffect(() => {
    (async () => {
      if (!hasEmail) { setDemoOffsets({ skill: 0, dollars: 0 }); return; }
      const off = await loadDemoOffsets(userEmail);
      setDemoOffsets(off);
    })();
  }, [demoSimEnabled, hasEmail, userEmail, loadDemoOffsets]);

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

  // Also prefetch joined status for live server events
  for (const ev of serverEvents) {
    if (joinedMap[ev.id] !== undefined) continue;
    try {
      const { registered } = await getRegistrationStatus(userEmail, ev.id);
      if (!cancelled) {
        setJoinedMap(prev => ({ ...prev, [ev.id]: !!registered }));
      }
    } catch {}
  }
    })();
    return () => { cancelled = true; };
  }, [visibleRows, userEmail, joinedMap, serverEvents]);

  // ---- Live events join/unjoin using wallet v2 (component scope) ----
  const onJoinLive = async (ev: any) => {
    if (joiningMap[ev.id] || joinedMap[ev.id]) return;
    if (!hasEmail) { Alert.alert('Sign in', 'Please sign in on the Profile tab to join this event.'); return; }

    setJoiningMap(prev => ({ ...prev, [ev.id]: true }));
    try {
      const wallet = getJoinWallet(ev.id);
      const res = await fetch(`${API}/events/${encodeURIComponent(ev.id)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, wallet }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'join failed');

      setJoinedMap(prev => ({ ...prev, [ev.id]: true }));
      saveJoinedMap(userEmail, { ...joinedMap, [ev.id]: true }).catch(() => {});

      const fee = Math.abs(Number(ev.feeCents || ev.fee || 0) / 100);
      Alert.alert('Joined', `Wallet: ${wallet}\nFee: $${fee.toFixed(2)}`);
    } catch (e: any) {
      Alert.alert('Join failed', e?.message || 'Unknown error');
    } finally {
      setJoiningMap(prev => ({ ...prev, [ev.id]: false }));
    }
  };

  const onUnjoinLive = async (ev: any) => {
    if (!hasEmail) { Alert.alert('Sign in', 'Please sign in on the Profile tab to unjoin this event.'); return; }
    if (joiningMap[ev.id]) return;

    Alert.alert('Unjoin event', `Refund for "${ev.name || ev.title || 'Event'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unjoin', style: 'destructive', onPress: async () => {
          setJoiningMap(prev => ({ ...prev, [ev.id]: true }));
          try {
            const res = await fetch(`${API}/events/${encodeURIComponent(ev.id)}/unjoin`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail })
            });
            const data = await res.json();
            if (!res.ok || !data?.success) throw new Error(data?.error || 'unjoin failed');

            setJoinedMap(prev => ({ ...prev, [ev.id]: false }));
            saveJoinedMap(userEmail, { ...joinedMap, [ev.id]: false }).catch(() => {});

            const fee = Math.abs(Number(ev.feeCents || ev.fee || 0) / 100);
            const used = data?.usedWallet || 'dollars';
            Alert.alert('Unjoined', `Refunded $${fee.toFixed(2)} to ${used}`);
          } catch (e: any) {
            Alert.alert('Unjoin failed', e?.message || 'Unknown error');
          } finally {
            setJoiningMap(prev => ({ ...prev, [ev.id]: false }));
          }
        }
      }
    ]);
  };

  const onJoin = async (evt: EventItem) => {
    // Local-only join for demo events (no API calls)
    if (joiningMap[evt.id] || joinedMap[evt.id]) return;
    if (!hasEmail) { Alert.alert('Sign in', 'Please sign in on the Profile tab to join this event.'); return; }

    setJoiningMap(prev => ({ ...prev, [evt.id]: true }));
    try {
      const chosen = getDemoJoinWallet(evt.id);
      await setJoinedLocal(userEmail, evt.id, true);
      setJoinedMap(prev => {
        const next = { ...prev, [evt.id]: true };
        saveJoinedMap(userEmail, next).catch(() => {});
        return next;
      });
      Alert.alert('Joined (Demo)', `Wallet picked: ${chosen}  •  Fee: $${Math.abs(Number(evt.fee) || 0).toFixed(2)}\n(Local demo only; no wallet deducted)`);
      // When enabled, simulate real wallet deduction locally (in cents)
      if (demoSimEnabled) {
        const feeCents = Math.round((Number(evt.fee)||0) * 100);
        const current = await loadDemoOffsets(userEmail);
        const w = chosen === 'skill' ? 'skill' : 'dollars';
        const next = { ...current, [w]: Number(current[w]||0) - feeCents };
        await saveDemoOffsets(userEmail, next);
        setDemoOffsets(next);
      }
    } catch (e: any) {
      Alert.alert('Join failed', e?.message || 'Unknown error');
    } finally {
      setJoiningMap(prev => ({ ...prev, [evt.id]: false }));
    }
  };

  // Chips header with API base badge
  const onUnjoin = async (evt: EventItem) => {
    if (!hasEmail) { Alert.alert('Sign in', 'Please sign in on the Profile tab to unjoin this event.'); return; }
    if (joiningMap[evt.id]) return;

    Alert.alert('Unjoin event (Demo)', `Refund (simulated) $${Math.abs(Number(evt.fee) || 0).toFixed(2)} for "${evt.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unjoin', style: 'destructive', onPress: async () => {
          setJoiningMap(prev => ({ ...prev, [evt.id]: true }));
          try {
            await setJoinedLocal(userEmail, evt.id, false);
            setJoinedMap(prev => ({ ...prev, [evt.id]: false }));
            const picked = getDemoJoinWallet(evt.id);
            Alert.alert('Unjoined (Demo)', `Refunded (simulated) to ${picked}.`);
            if (demoSimEnabled) {
              const feeCents = Math.round((Number(evt.fee)||0) * 100);
              const current = await loadDemoOffsets(userEmail);
              const w = picked === 'skill' ? 'skill' : 'dollars';
              const next = { ...current, [w]: Number(current[w]||0) + feeCents };
              await saveDemoOffsets(userEmail, next);
              setDemoOffsets(next);
            }
          } catch (e: any) {
            Alert.alert('Unjoin failed', e?.message || 'Unknown error');
          } finally {
            setJoiningMap(prev => ({ ...prev, [evt.id]: false }));
          }
        }
      }
    ]);
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
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingBottom:6 }}>
        <Text style={{ color: colors.MUTED_TEXT, fontSize: 12 }}>Demo wallet simulation</Text>
        <Switch value={demoSimEnabled} onValueChange={saveDemoSim} />
      </View>
      {demoSimEnabled && hasEmail && (
  <View style={{ paddingHorizontal:16, marginTop:6, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
    {/* Offsets badge */}
    <View style={{ backgroundColor:'#1b1b1e', borderColor:'#444', borderWidth:1, borderRadius:8, paddingVertical:6, paddingHorizontal:10, maxWidth:'65%' }}>
      <Text style={{ color:'#cfcfcf', fontSize:12 }}>
        Skill: <Text style={{ color:'#fff', fontWeight:'800' }}>{fmtMoney(demoOffsets.skill)}</Text>,
        {' '}Dollars: <Text style={{ color:'#fff', fontWeight:'800' }}>{fmtMoney(demoOffsets.dollars)}</Text>
      </Text>
    </View>

    {/* Actions */}
    <View style={{ flexDirection:'row', gap:8 }}>
      <Pressable
        onPress={() => resetDemoOffsets(userEmail)}
        style={({ pressed }) => [{
          alignSelf: 'flex-start',
          borderColor: '#444', borderWidth: 1, borderRadius: 999,
          paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#181818'
        }, pressed && { opacity: 0.85 }]}
      >
        <Text style={{ color: '#FFB84D', fontWeight: '800', fontSize: 13 }}>Reset</Text>
      </Pressable>
      <Pressable
        onPress={async () => { await resetDemoOffsets(userEmail); await saveDemoSim(false); }}
        style={({ pressed }) => [{
          alignSelf: 'flex-start',
          borderColor: '#444', borderWidth: 1, borderRadius: 999,
          paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#181818'
        }, pressed && { opacity: 0.85 }]}
      >
        <Text style={{ color: '#FF6B6B', fontWeight: '800', fontSize: 13 }}>Reset & turn off</Text>
      </Pressable>
    </View>
  </View>
)}
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
            onUnjoin={() => onUnjoin(item)}
            getWallet={getDemoJoinWallet}
            setWallet={setJoinWalletByDemo}
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
            <LiveEventsSection
              loading={serverLoading}
              events={serverEvents}
              onRefresh={reloadServerEvents}
              joinedMap={joinedMap}
              joiningMap={joiningMap}
              getJoinWallet={getJoinWallet}
              setJoinWalletByEvent={setJoinWalletByEvent}
              onJoinLive={onJoinLive}
              onUnjoinLive={onUnjoinLive}
              hasEmail={hasEmail}
            />
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

function EventCard({ item, joined, joining, onJoin, onUnjoin, getWallet, setWallet }: {
  item: EventItem;
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
  onUnjoin: () => void;
  getWallet: (id: string) => 'skill'|'dollars';
  setWallet: React.Dispatch<React.SetStateAction<Record<string,'skill'|'dollars'>>>;
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

      {/* Wallet picker (UI only for demo) */}
      <Text style={{ color:'#cfcfcf', marginTop:10, fontSize:12, fontWeight:'700' }}>Join with wallet</Text>
      <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
        <TouchableOpacity
          onPress={() => setWallet(prev => ({ ...prev, [item.id]:'skill' }))}
          style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:6, borderWidth:1, borderColor: getWallet(item.id)==='skill' ? '#FFB84D' : '#333', backgroundColor: getWallet(item.id)==='skill' ? '#2a200f' : '#1a1a1a' }}
        >
          <Text style={{ color:'#fff', fontWeight:'800' }}>$Skill</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setWallet(prev => ({ ...prev, [item.id]:'dollars' }))}
          style={{ paddingVertical:6, paddingHorizontal:10, borderRadius:6, borderWidth:1, borderColor: getWallet(item.id)==='dollars' ? '#7DFF70' : '#333', backgroundColor: getWallet(item.id)==='dollars' ? '#103014' : '#1a1a1a' }}
        >
          <Text style={{ color:'#fff', fontWeight:'800' }}>$Dollars</Text>
        </TouchableOpacity>
      </View>

      <View style={s.footerRow}>
        <Text style={s.spotsText}>{item.spotsLeft} spot{item.spotsLeft === 1 ? '' : 's'} left</Text>
        <Pressable
          onPress={joined ? onUnjoin : onJoin}
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
              <Text style={s.ctaText}>Joined • Unjoin</Text>
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


// Helpers for demo wallet simulation
export async function getDemoWalletOffsets(email: string): Promise<{ skill: number; dollars: number }> {
  try {
    const raw = await AsyncStorage.getItem(`demoWalletOffsets:${(email||'').toLowerCase()}`);
    if (!raw) return { skill: 0, dollars: 0 };
    const o = JSON.parse(raw);
    return { skill: Number(o?.skill||0), dollars: Number(o?.dollars||0) };
  } catch { return { skill: 0, dollars: 0 }; }
}

export async function isDemoSimEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem('demoSimEnabled')) === '1'; } catch { return false; }
}