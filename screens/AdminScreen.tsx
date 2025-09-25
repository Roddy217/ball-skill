import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import AutoEmail from '../components/AutoEmail';
import AutoEventId from '../components/AutoEventId';
import { addEmail } from '../services/emailStore';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';
const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/,'');
const API = `${SERVER}/api`;

type EventRow = {
  id: string;
  name?: string;
  dateISO?: string;
  locationType?: string;
  feeCents?: number;
  drillsEnabled?: string[];
};
type HistRow = { ts: number; delta: number; note?: string | null; balanceAfter: number };

function toDollars(cents: number) {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(2)}`;
}
const fmtDelta = (n: number) => `${n >= 0 ? '+' : ''}${toDollars(n)}`;

async function getJSON<T=any>(path: string) {
  const res = await fetch(`${API}${path}`);
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${path} (HTTP ${res.status})`);
  return data as T;
}
async function postJSON(path: string, body: any, method: 'POST'|'GET' = 'POST') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${path} (HTTP ${res.status})`);
  return data;
}

async function fetchEvents(): Promise<EventRow[]> {
  const data = await getJSON<{ success: boolean; events: EventRow[] }>('/events');
  return (data?.events || []).map(e => ({
    ...e,
    drillsEnabled: Array.isArray(e?.drillsEnabled) ? e.drillsEnabled.map(d => String(d).toUpperCase()) : [],
  }));
}
async function fetchHistory(email: string, q: string, limit = 50): Promise<HistRow[]> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const url = `/credits/${enc}/history?limit=${Math.max(1, Math.min(200, limit))}` + (q ? `&q=${encodeURIComponent(q)}` : '');
  const data = await getJSON<{ success: boolean; history: HistRow[] }>(url);
  return data?.history || [];
}

async function createEvent(ev: any) { return postJSON('/events', ev); }
async function applyCredits(email: string, delta: number, note?: string) {
  return postJSON('/credits/apply', { email: email.trim().toLowerCase(), delta: Number(delta)||0, note: (note || '').trim() || undefined });
}
async function getBalance(email: string): Promise<number> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const data = await getJSON<{ success: boolean; balance: number }>(`/credits/${enc}`);
  return Number(data?.balance || 0);
}
async function submitResult(eventId: string, payload: any) {
  return postJSON(`/events/${encodeURIComponent(eventId.trim())}/submit`, payload);
}

function msFromParts(h: string, m: string, s: string, ms: string) {
  const H = Math.max(0, Number(h)||0);
  const M = Math.max(0, Number(m)||0);
  const S = Math.max(0, Number(s)||0);
  const MS = Math.max(0, Number(ms)||0);
  return (((H * 60 + M) * 60 + S) * 1000) + MS;
}

const DEFAULT_DRILLS = ['FT','3PT'];

export default function AdminScreen() {
  // Events cache for dynamic drills
  const [events, setEvents] = useState<EventRow[]>([]);
  const [evLoading, setEvLoading] = useState(false);
  const reloadEvents = useCallback(async () => {
    try {
      setEvLoading(true);
      const list = await fetchEvents();
      setEvents(list);
    } catch {
      // silent
    } finally {
      setEvLoading(false);
    }
  }, []);
  useEffect(() => { reloadEvents(); }, [reloadEvents]);

  // Seed
  const [seedBusy, setSeedBusy] = useState(false);
  const doSeed = useCallback(async () => {
    setSeedBusy(true);
    try {
      const now = Date.now();
      const eventsToMake = [
        { name: '3-Point Challenge', feeCents: 500, drillsEnabled: ['3PT'], locationType: 'in_person', dateISO: new Date(now + 24*3600*1000).toISOString() },
        { name: 'Free Throw Frenzy', feeCents: 300, drillsEnabled: ['FT'],  locationType: 'online',    dateISO: new Date(now + 48*3600*1000).toISOString() },
      ];
      for (const ev of eventsToMake) await createEvent(ev);
      for (const e of ['test@ballskill.com','alice@ballskill.com','bob@ballskill.com']) {
        await applyCredits(e, 2500, 'seed');
      }
      await reloadEvents(); // reflect new events
      Alert.alert('Seed', 'Seeded 2 events + granted $25 to 3 users.');
    } catch (e:any) {
      Alert.alert('Seed failed', String(e?.message || e));
    } finally {
      setSeedBusy(false);
    }
  }, [reloadEvents]);

  // Grant/Deduct
  const [gEmail, setGEmail] = useState('test@ballskill.com');
  const [gDelta, setGDelta] = useState('2500'); // cents
  const [gNote, setGNote] = useState('');       // NEW: note
  const [gBusy, setGBusy] = useState(false);
  const [gBal, setGBal] = useState<number | null>(null);
  const [gBalLoading, setGBalLoading] = useState(false);

  // History
  const [hItems, setHItems] = useState<HistRow[]>([]);
  const [hLoading, setHLoading] = useState(false);
  const [hQ, setHQ] = useState('');
  const [hLimit, setHLimit] = useState('50');

  const loadHistory = useCallback(async (email: string, q: string, limitNum: number) => {
    if (!email.trim()) { setHItems([]); return; }
    setHLoading(true);
    try {
      const list = await fetchHistory(email, q, limitNum);
      setHItems(list);
    } catch {
      setHItems([]);
    } finally {
      setHLoading(false);
    }
  }, []);

  // debounce: balance + history when email or filter changes
  useEffect(() => {
    let t: any;
    const limitNum = Math.max(1, Math.min(200, Number(hLimit) || 50));
    if (!gEmail.trim()) { setGBal(null); setHItems([]); return; }
    setGBalLoading(true);
    t = setTimeout(async () => {
      try {
        const [bal] = await Promise.all([
          getBalance(gEmail),
        ]);
        setGBal(bal);
      } finally {
        setGBalLoading(false);
      }
      // history fetch (no need to block balance)
      loadHistory(gEmail, hQ, limitNum);
    }, 300);
    return () => clearTimeout(t);
  }, [gEmail, hQ, hLimit, loadHistory]);

  const gDeltaNum = useMemo(() => Number(gDelta) || 0, [gDelta]);

  const doGrant = useCallback(async () => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email.'); return; }
    setGBusy(true);
    try {
      await applyCredits(gEmail, Math.abs(Number(gDelta)||0), gNote);
      await addEmail(gEmail);
      const bal = await getBalance(gEmail);
      setGBal(bal);
      // refresh history immediately
      const limitNum = Math.max(1, Math.min(200, Number(hLimit) || 50));
      await loadHistory(gEmail, hQ, limitNum);
      Alert.alert('Credits', `Granted ${fmtDelta(Math.abs(Number(gDelta)||0))} to ${gEmail.trim().toLowerCase()}`);
    } catch (e:any) {
      Alert.alert('Grant failed', String(e?.message || e));
    } finally {
      setGBusy(false);
    }
  }, [gEmail, gDelta, gNote, hQ, hLimit, loadHistory]);

  const doDeduct = useCallback(async () => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email.'); return; }
    setGBusy(true);
    try {
      await applyCredits(gEmail, -Math.abs(Number(gDelta)||0), gNote);
      await addEmail(gEmail);
      const bal = await getBalance(gEmail);
      setGBal(bal);
      // refresh history immediately
      const limitNum = Math.max(1, Math.min(200, Number(hLimit) || 50));
      await loadHistory(gEmail, hQ, limitNum);
      Alert.alert('Credits', `Deducted ${fmtDelta(-Math.abs(Number(gDelta)||0))} from ${gEmail.trim().toLowerCase()}`);
    } catch (e:any) {
      Alert.alert('Deduct failed', String(e?.message || e));
    } finally {
      setGBusy(false);
    }
  }, [gEmail, gDelta, gNote, hQ, hLimit, loadHistory]);

  // Submit Result
  const [rEventId, setREventId] = useState('');
  const [rEmail, setREmail] = useState('test@ballskill.com');

  // Dynamic drills
  const [availableDrills, setAvailableDrills] = useState<string[]>(DEFAULT_DRILLS);
  const [rDrill, setRDrill] = useState<string>('FT');
  useEffect(() => {
    if (!rEventId) {
      setAvailableDrills(DEFAULT_DRILLS);
      if (!DEFAULT_DRILLS.includes(rDrill)) setRDrill(DEFAULT_DRILLS[0]);
      return;
    }
    const ev = events.find(e => e.id === rEventId);
    const drills = (ev?.drillsEnabled && ev.drillsEnabled.length) ? ev.drillsEnabled.map(d => String(d).toUpperCase()) : DEFAULT_DRILLS;
    setAvailableDrills(drills);
    if (!drills.includes(rDrill)) setRDrill(drills[0]);
  }, [rEventId, events]); // sync drill options with selected event

  const [rMade, setRMade] = useState('8');
  const [rAttempts, setRAttempts] = useState('10');
  const [tH, setTH] = useState('0');
  const [tM, setTM] = useState('0');
  const [tS, setTS] = useState('12');
  const [tMS, setTMS] = useState('0');
  const [rBusy, setRBusy] = useState(false);

  const doSubmit = useCallback(async () => {
    if (!rEventId.trim()) { Alert.alert('Missing', 'Enter an Event ID (type to search, then tap).'); return; }
    if (!rEmail.trim()) { Alert.alert('Missing', 'Enter the player email.'); return; }
    setRBusy(true);
    try {
      await submitResult(rEventId, {
        email: rEmail.trim().toLowerCase(),
        drillType: rDrill.trim().toUpperCase(),
        made: Number(rMade)||0,
        attempts: Number(rAttempts)||0,
        timeMs: msFromParts(tH, tM, tS, tMS),
      });
      await addEmail(rEmail);
      Alert.alert('Result', 'Saved result.');
    } catch (e:any) {
      Alert.alert('Submit failed', String(e?.message || e));
    } finally {
      setRBusy(false);
    }
  }, [rEventId, rEmail, rDrill, rMade, rAttempts, tH, tM, tS, tMS]);

  // Quick chips (cents) - positive only
  const chips = useMemo(() => ([100, 500, 1000, 2500, 5000]), []);
  const chipLabel = (c: number) => toDollars(c);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        style={{ flex:1, backgroundColor:'#000' }}
        contentContainerStyle={{ padding:16, paddingBottom: 200 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollIndicatorInsets={{ bottom: 80 }}
      >
        <Text style={s.h1}>Admin {evLoading ? <Text style={{color:MUTED, fontSize:12}}>(loading events…)</Text> : null}</Text>
        <Text style={s.sub}>Server: <Text style={{color:'#fff'}}>{API}</Text></Text>

        {/* Seed */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Seed Demo Data</Text>
          <Text style={s.meta}>Creates 2 events and grants $25 to a few test users.</Text>
          <TouchableOpacity disabled={seedBusy} style={[s.btn, seedBusy && s.btnDisabled]} onPress={doSeed}>
            <Text style={s.btnText}>{seedBusy ? 'Seeding…' : 'Run Seed'}</Text>
          </TouchableOpacity>
        </View>

        {/* Grant / Deduct */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Grant / Deduct Credits</Text>

          {/* Email */}
          <Text style={[s.meta, { marginTop: 0 }]}>Email</Text>
          <AutoEmail value={gEmail} onChangeText={setGEmail} placeholder="email" style={s.input} />
          <View style={{ minHeight:18, marginTop:6 }}>
            {gBalLoading ? (
              <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                <ActivityIndicator color={ORANGE} size="small" />
                <Text style={s.meta}>Fetching balance…</Text>
              </View>
            ) : (gBal != null) ? (
              <Text style={s.meta}>Balance: <Text style={{color:'#fff'}}>{toDollars(gBal)}</Text></Text>
            ) : null}
          </View>

          {/* Amount */}
          <Text style={[s.meta, { marginTop: 10 }]}>Amount (cents)</Text>
          <View style={s.amountRow}>
            <TextInput
              style={[s.input, { flex:1 }]}
              placeholder="delta cents (e.g., 500)"
              placeholderTextColor={MUTED}
              value={gDelta}
              onChangeText={setGDelta}
              keyboardType="number-pad"
            />
            <Text style={s.amountPreview}>= {toDollars(gDeltaNum)}</Text>
          </View>

          {/* Quick chips */}
          <View style={s.chipRow}>
            {chips.map(c => (
              <TouchableOpacity key={c} style={s.chip} onPress={() => setGDelta(String(c))}>
                <Text style={s.chipText}>{chipLabel(c)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note */}
          <Text style={[s.meta, { marginTop: 10 }]}>Note (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g., refund / promo / manual adj"
            placeholderTextColor={MUTED}
            value={gNote}
            onChangeText={setGNote}
          />

          {/* Actions */}
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity disabled={gBusy} style={[s.btn, { flex:1 }, gBusy && s.btnDisabled]} onPress={doGrant}>
              <Text style={s.btnText}>{gBusy ? 'Working…' : 'Grant'}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={gBusy} style={[s.btnOutline, { flex:1 }, gBusy && s.btnDisabled]} onPress={doDeduct}>
              <Text style={s.btnOutlineText}>{gBusy ? 'Working…' : 'Deduct'}</Text>
            </TouchableOpacity>
          </View>

          {/* History */}
          <Text style={[s.meta, { marginTop: 12 }]}>History</Text>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TextInput
              style={[s.input, { flex:1 }]}
              placeholder="search notes (optional)"
              placeholderTextColor={MUTED}
              value={hQ}
              onChangeText={setHQ}
            />
            <TextInput
              style={[s.input, { width:90, textAlign:'center' }]}
              placeholder="limit"
              placeholderTextColor={MUTED}
              value={hLimit}
              onChangeText={setHLimit}
              keyboardType="number-pad"
            />
          </View>
          <View style={s.historyBox}>
            {hLoading ? (
              <View style={{ padding:12, flexDirection:'row', alignItems:'center', gap:8 }}>
                <ActivityIndicator color={ORANGE} />
                <Text style={s.meta}>Loading history…</Text>
              </View>
            ) : hItems.length === 0 ? (
              <Text style={[s.meta, { padding:12 }]}>No history.</Text>
            ) : (
              <ScrollView style={s.historyScroll} nestedScrollEnabled>
                {hItems.map((it, idx) => {
                  const color = it.delta >= 0 ? '#2ecc71' : '#ff4d4f';
                  const when = new Date(it.ts).toLocaleString();
                  return (
                    <View key={idx} style={s.historyRow}>
                      <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
                        <Text style={[s.histDelta, { color }]}>{fmtDelta(it.delta)}</Text>
                        <Text style={s.histWhen}>{when}</Text>
                      </View>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4 }}>
                        <Text style={s.histBalance}>Balance: {toDollars(it.balanceAfter)}</Text>
                        {it.note ? <Text style={s.histNote} numberOfLines={1}>{it.note}</Text> : null}
                      </View>
                    </View>
                  );
                })}
                <View style={{ height: 6 }} />
              </ScrollView>
            )}
          </View>
        </View>

        {/* Submit Result */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Enter Drill Result</Text>

          <Text style={s.meta}>Event ID</Text>
          <AutoEventId value={rEventId} onChangeText={setREventId} placeholder="eventId (searchable)" style={s.input} />

          <Text style={[s.meta, { marginTop: 10 }]}>Player Email</Text>
          <AutoEmail value={rEmail} onChangeText={setREmail} placeholder="player email" style={s.input} />

          {/* Drill Type (dynamic) */}
          <Text style={[s.meta, { marginTop: 10 }]}>Drill Type</Text>
          {availableDrills.length > 0 && (
            <Text style={[s.meta, { marginTop: -4 }]}>
              Available: <Text style={{color:'#fff'}}>{availableDrills.join(' / ')}</Text>
            </Text>
          )}
          <View style={s.chipRow}>
            {availableDrills.map(dt => {
              const selected = rDrill === dt;
              return (
                <TouchableOpacity
                  key={dt}
                  style={[s.drillChip, selected && s.drillChipActive]}
                  onPress={() => setRDrill(dt)}
                >
                  <Text style={[s.drillChipText, selected && s.drillChipTextActive]}>{dt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={s.input}
            placeholder={`type to set (e.g., ${availableDrills[0] || 'FT'})`}
            placeholderTextColor={MUTED}
            value={rDrill}
            onChangeText={(t) => {
              const up = (t || '').toUpperCase();
              const match = availableDrills.find(d => d.startsWith(up));
              setRDrill(match || up);
            }}
            autoCapitalize="characters"
          />

          {/* Made / Attempts */}
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:8 }}>
            <Text style={s.smallLabel}>Made</Text>
            <Text style={s.smallLabel}>Attempts</Text>
          </View>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TextInput style={[s.input, { flex:1 }]} placeholder="made" placeholderTextColor={MUTED} value={rMade} onChangeText={setRMade} keyboardType="number-pad" />
            <TextInput style={[s.input, { flex:1 }]} placeholder="attempts" placeholderTextColor={MUTED} value={rAttempts} onChangeText={setRAttempts} keyboardType="number-pad" />
          </View>

          {/* Time */}
          <Text style={[s.meta, { marginTop: 10 }]}>Time</Text>
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4 }}>
            <Text style={s.timeLabel}>H</Text>
            <Text style={s.timeLabel}>M</Text>
            <Text style={s.timeLabel}>S</Text>
            <Text style={s.timeLabel}>ms</Text>
          </View>
          <View style={s.timeRow}>
            <TextInput style={[s.input, s.timeCell]} placeholder="H"  placeholderTextColor={MUTED} value={tH}  onChangeText={setTH}  keyboardType="number-pad" />
            <TextInput style={[s.input, s.timeCell]} placeholder="M"  placeholderTextColor={MUTED} value={tM}  onChangeText={setTM}  keyboardType="number-pad" />
            <TextInput style={[s.input, s.timeCell]} placeholder="S"  placeholderTextColor={MUTED} value={tS}  onChangeText={setTS}  keyboardType="number-pad" />
            <TextInput style={[s.input, s.timeCell]} placeholder="ms" placeholderTextColor={MUTED} value={tMS} onChangeText={setTMS} keyboardType="number-pad" />
          </View>

          <TouchableOpacity disabled={rBusy} style={[s.btn, rBusy && s.btnDisabled]} onPress={doSubmit}>
            <Text style={s.btnText}>{rBusy ? 'Saving…' : 'Save Result'}</Text>
          </TouchableOpacity>
        </View>

        {/* spacer so last control never hides behind keyboard */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  h1:{ color:'#fff', fontSize:22, fontWeight:'800' },
  sub:{ color:MUTED, marginTop:4, marginBottom:14 },
  card:{ backgroundColor: CARD, borderColor: BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  cardTitle:{ color:'#fff', fontWeight:'800', fontSize:16, marginBottom:8 },
  meta:{ color:MUTED, fontSize:12, marginTop:2, marginBottom:8 },
  smallLabel:{ color: MUTED, fontSize: 11, width: '50%', textAlign: 'center' },
  input:{ backgroundColor:'#090909', borderColor:'#1e1e1e', color:'#fff', borderWidth:1, borderRadius:10, paddingHorizontal:12, paddingVertical:10, marginTop:8 },
  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnDisabled:{ opacity:0.6 },
  btnText:{ color:'#000', fontWeight:'800' },

  // Outline for secondary action
  btnOutline:{ borderColor: ORANGE, borderWidth:1.5, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnOutlineText:{ color: ORANGE, fontWeight:'800' },

  // Amount helpers
  amountRow:{ flexDirection:'row', alignItems:'center', gap:8 },
  amountPreview:{ color:'#fff', fontWeight:'700', minWidth:80, textAlign:'right' },

  // Chips (shared)
  chipRow:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 },
  chip:{ backgroundColor:'#0b0b0b', borderColor:'#2a2a2a', borderWidth:1, paddingVertical:6, paddingHorizontal:10, borderRadius:999 },
  chipText:{ color:'#fff', fontWeight:'700', fontSize:12 },

  // Drill chips (selected state)
  drillChip:{ backgroundColor:'#0b0b0b', borderColor:'#2a2a2a', borderWidth:1, paddingVertical:6, paddingHorizontal:10, borderRadius:999 },
  drillChipActive:{ backgroundColor: ORANGE, borderColor: ORANGE },
  drillChipText:{ color:'#fff', fontWeight:'700', fontSize:12 },
  drillChipTextActive:{ color:'#000', fontWeight:'800' },

  // History styles
  historyBox:{ backgroundColor:'#0b0b0b', borderColor:'#1e1e1e', borderWidth:1, borderRadius:10, marginTop:8, overflow:'hidden' },
  historyScroll:{ maxHeight: 260 },
  historyRow:{ paddingVertical:10, paddingHorizontal:12, borderBottomColor:'#161616', borderBottomWidth:1 },
  histDelta:{ fontWeight:'800', fontSize:13 },
  histWhen:{ color:MUTED, fontSize:11, marginLeft:8 },
  histBalance:{ color:'#fff', fontSize:12, fontWeight:'600' },
  histNote:{ color:'#ddd', fontSize:12, marginLeft:8, maxWidth:'60%', textAlign:'right' },

  // Time inputs
  timeRow:{ flexDirection:'row', gap:8, marginTop:8 },
  timeCell:{ flex:1 },
  timeLabel:{ color: MUTED, fontSize: 11, width: '25%', textAlign: 'center' },
});
