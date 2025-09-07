import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { getEvents, refreshEvents, getRegistrationStatus, joinEventWithCredits, loadApiBase } from '../services/api';
import MultiProgress from '../components/MultiProgress';
import { useAuth } from '../providers/AuthProvider';
import { addNotification } from '../state/notify';

type SortFilter = 'ALL' | 'SOONEST' | 'NEWEST' | 'IN_PERSON' | 'ONLINE';
type PriceSort = 'NONE' | 'PRICE_ASC' | 'PRICE_DESC';

type EventRow = {
  id: string;
  name: string;
  dateISO: string;
  locationType: 'in_person'|'online';
  feeCents: number;
  drillsEnabled?: string[];
  capacity?: number;
  prizePoolCents?: number;
  potentialPayoutCents?: number;
  playerTypeMix?: Record<string, number>;
  joinedCount?: number;
};

const PLAYER_COLORS: Record<string, string> = {
  youth: '#3DDC84', teens: '#4db6ff', adult: '#ffcc00', pro: '#ff6b6b', elite: '#b388ff',
  celebrity: '#ff8a65', aau: '#00e5ff', d1: '#ffab40', d2: '#7e57c2', rec: '#9ccc65',
  beginner: '#8dffb0', amateur: '#ffd180', open: '#333',
};

export default function EventsScreen() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [filter, setFilter] = useState<SortFilter>('ALL');
  const [priceSort, setPriceSort] = useState<PriceSort>('NONE');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const emailLc = (user?.email || '').toLowerCase();

  useEffect(() => { loadApiBase(); }, []);
  const load = useCallback(async () => { const list = await getEvents(); setEvents(list as any); }, []);
  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { const list = await refreshEvents(); setEvents(list as any); }
    finally { setRefreshing(false); }
  }, []);

  const filtered = useMemo(() => {
    const lc = q.trim().toLowerCase();
    let rows = (events || []).filter(e => {
      if (!lc) return true;
      const hay = [(e.name||''), (e.locationType||''), ...(e.drillsEnabled||[])].join(' ').toLowerCase();
      return hay.includes(lc);
    });
    if (filter === 'IN_PERSON') rows = rows.filter(e => e.locationType === 'in_person');
    if (filter === 'ONLINE') rows = rows.filter(e => e.locationType === 'online');
    if (filter === 'NEWEST') rows.sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());
    else if (filter === 'SOONEST') rows.sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
    if (priceSort === 'PRICE_ASC') rows.sort((a, b) => (a.feeCents||0) - (b.feeCents||0));
    else if (priceSort === 'PRICE_DESC') rows.sort((a, b) => (b.feeCents||0) - (a.feeCents||0));
    return rows;
  }, [events, filter, priceSort, q]);

  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedCache, setJoinedCache] = useState<Record<string, boolean>>({});

  const onJoin = async (ev: EventRow) => {
    if (!emailLc) return Alert.alert('Sign in required', 'Please sign in to join an event.');
    try {
      setJoiningId(ev.id);
      const already = joinedCache[ev.id] ?? await getRegistrationStatus(ev.id, emailLc);
      if (already) { setJoinedCache(p => ({...p,[ev.id]:true})); Alert.alert('Already joined', 'You’re in this event.'); return; }
      const fee = Math.round((ev.feeCents || 0) / 100);
      const res = await joinEventWithCredits(ev.id, emailLc, fee);
      if (!res.success) {
        if (res.error === 'insufficient_credits') Alert.alert('Insufficient credits', 'Add more credits to join this event.');
        else if (res.error === 'event_full') Alert.alert('Event full', 'No spots remaining.');
        else Alert.alert('Join failed', 'Please try again.');
        return;
      }
      setJoinedCache(p => ({...p,[ev.id]:true}));
      Alert.alert('Joined!', `-${fee} credits applied.\nNew balance: ${res.balance}`);
      setEvents(prev => prev.map(e => e.id === ev.id ? ({ ...e, joinedCount: (e.joinedCount||0) + 1, playerTypeMix: res.playerTypeMix || e.playerTypeMix }) : e));
      // Notify
      addNotification({ title: 'Joined event', body: ev.name });
    } finally { setJoiningId(null); }
  };

  const renderItem = ({ item }: { item: EventRow }) => {
    const date = new Date(item.dateISO);
    const fee = (item.feeCents || 0) / 100;
    const joined = joinedCache[item.id] === true;
    const capacity = item.capacity ?? 10;
    const filled = Math.min(capacity, item.joinedCount ?? 0);
    const remaining = Math.max(0, capacity - filled);

    const segments = Object.entries(item.playerTypeMix || {}).map(([key, pct]) => ({
      key, pct: Math.max(0, Number(pct) || 0), color: PLAYER_COLORS[key.toLowerCase()] || '#888'
    }));
    const usedPct = segments.reduce((s, x) => s + x.pct, 0);
    if (usedPct < 1) segments.push({ key: 'open', pct: Math.max(0, 1 - usedPct), color: PLAYER_COLORS.open });

    const timeLeft = getTimeLeft(date);
    const isOnline = item.locationType === 'online';

    return (
      <View style={s.card}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={s.title}>{item.name}</Text>
          <View style={s.row}><Ionicons name="calendar" size={14} color={colors.MUTED_TEXT} /><Text style={s.meta}>{date.toLocaleString()}</Text></View>
          <View style={s.row}><Ionicons name={isOnline ? 'wifi' : 'location'} size={14} color={colors.MUTED_TEXT} /><Text style={s.meta}>{isOnline ? 'Online' : 'In person'}</Text></View>
          <View style={[s.row, { marginTop: 2 }]}><Ionicons name="time" size={14} color={colors.MUTED_TEXT} /><Text style={s.meta}>{timeLeft}</Text></View>
          {(item.prizePoolCents || 0) > 0 && (<View style={s.row}><Ionicons name="trophy" size={14} color={colors.MUTED_TEXT} /><Text style={s.meta}>Prize pool: ${((item.prizePoolCents||0)/100).toLocaleString()}</Text></View>)}
          {(item.potentialPayoutCents || 0) > 0 && (<View style={s.row}><Ionicons name="cash-outline" size={14} color={colors.MUTED_TEXT} /><Text style={s.meta}>Potential payout: ${((item.potentialPayoutCents||0)/100).toLocaleString()}</Text></View>)}
          {Array.isArray(item.drillsEnabled) && item.drillsEnabled.length > 0 && (<View style={s.chipsWrap}>{item.drillsEnabled.map(d => <Chip key={d} label={d} />)}</View>)}
          {item.playerTypeMix && Object.keys(item.playerTypeMix).length > 0 && (<View style={s.chipsWrap}>{Object.keys(item.playerTypeMix).map(k => <Chip key={k} label={prettyType(k)} color={PLAYER_COLORS[k.toLowerCase()] || undefined} />)}</View>)}
          <Text style={s.subText}>{filled}/{capacity} joined • {remaining} spots left</Text>
          <MultiProgress segments={segments} height={8} radius={6} bg="#1a1a1a" />
        </View>
        <View style={{ width: 120, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={s.price}>${fee.toFixed(2)}</Text>
          <Pressable onPress={() => joined ? Alert.alert('Already joined', 'You’re in this event.') : onJoin(item)} disabled={joiningId === item.id}
            style={({ pressed }) => [s.joinBtn, joined && s.joinBtnJoined, pressed && { opacity: 0.9 }]} >
            <Ionicons name={joined ? 'checkmark-circle' : 'log-in-outline'} size={16} color={colors.WHITE} />
            <Text style={s.joinText}>{joined ? 'Joined' : 'Join'}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <Text style={s.h1}>Events</Text>

      {/* Row 1: primary chips */}
      <View style={s.rowWrap}>
        <Chip label="All" active={filter==='ALL'} onPress={()=>setFilter('ALL')} />
        <Chip label="Soonest" active={filter==='SOONEST'} onPress={()=>setFilter('SOONEST')} />
        <Chip label="Newest"  active={filter==='NEWEST'}  onPress={()=>setFilter('NEWEST')} />
        <Chip label="In-person" active={filter==='IN_PERSON'} onPress={()=>setFilter('IN_PERSON')} />
        <Chip label="Online"    active={filter==='ONLINE'}    onPress={()=>setFilter('ONLINE')} />
      </View>

      {/* Row 2: price chips + Refresh pill */}
      <View style={s.controlsRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Chip label="Price ↑" active={priceSort==='PRICE_ASC'}  onPress={()=>setPriceSort('PRICE_ASC')} />
          <Chip label="Price ↓" active={priceSort==='PRICE_DESC'} onPress={()=>setPriceSort('PRICE_DESC')} />
          {priceSort !== 'NONE' && (
            <Pressable onPress={()=>setPriceSort('NONE')} style={({pressed})=>[s.clearBtn, pressed && {opacity:0.8}]}>
              <Text style={s.clearTxt}>Clear</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={onRefresh} style={({ pressed }) => [s.refreshPill, pressed && { opacity: 0.85 }]}>
          <Ionicons name="refresh" size={16} color={colors.WHITE} />
          <Text style={s.refreshTxt}>Refresh</Text>
        </Pressable>
      </View>

      {/* Row 3: filter alone */}
      <TextInput value={q} onChangeText={setQ} placeholder="type to filter events" placeholderTextColor={colors.MUTED_TEXT} style={s.filterBox} returnKeyType="search" />

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
}

function prettyType(k: string) { const m = k.toLowerCase(); if (m==='d1') return 'D1'; if (m==='d2') return 'D2'; return m.charAt(0).toUpperCase()+m.slice(1); }
function getTimeLeft(date: Date) {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return 'Started';
  const mins = Math.floor(ms/60000), days = Math.floor(mins/(60*24)), hours = Math.floor((mins - days*60*24)/60), m = mins % 60;
  if (days > 0) return `Starts in ${days}d ${hours}h`; if (hours > 0) return `Starts in ${hours}h ${m}m`; return `Starts in ${m}m`;
}
function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const style = [cs.chip, active && cs.active, color ? { backgroundColor: color, borderColor: color } : null];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [style, onPress && pressed && { opacity: 0.9 }]}>
      <Text style={[cs.txt, (active || color) && cs.txtActive]}>{label}</Text>
    </Pressable>
  );
}
const cs = StyleSheet.create({
  chip: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 6 },
  active: { backgroundColor: colors.ORANGE, borderColor: colors.ORANGE },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
  txtActive: { color: colors.WHITE },
});
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  clearBtn: { alignSelf: 'center', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 6 },
  clearTxt: { color: colors.MUTED_TEXT, fontSize: 12, fontWeight: '700' },
  filterBox: { backgroundColor: colors.SURFACE, color: colors.TEXT, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12, textAlign: 'center' },
  refreshPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.ORANGE, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginLeft: 4 },
  refreshTxt: { color: colors.WHITE, fontWeight: '800', fontSize: 12 },
  card: { flexDirection: 'row', backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3, marginBottom: 12 },
  title: { color: colors.TEXT, fontWeight: '800', fontSize: 16, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  meta: { color: colors.MUTED_TEXT, fontSize: 12 },
  subText: { color: colors.MUTED_TEXT, fontSize: 12, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  price: { color: colors.TEXT, fontWeight: '900', fontSize: 18 },
  joinBtn: { marginTop: 8, backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  joinBtnJoined: { backgroundColor: '#5c6b73' },
  joinText: { color: colors.WHITE, fontWeight: '900' },
});
