import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import AutoEmail from '../components/AutoEmail';
import AutoEventId from '../components/AutoEventId';
import { addEmail } from '../services/emailStore';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';
const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/,'');
const API = `${SERVER}/api`;

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

async function createEvent(ev: any) { return postJSON('/events', ev); }
async function grantCredits(email: string, delta: number) {
  return postJSON('/credits/grant', { email: email.trim().toLowerCase(), delta: Number(delta)||0 });
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

export default function AdminScreen() {
  // Seed
  const [seedBusy, setSeedBusy] = useState(false);
  const doSeed = useCallback(async () => {
    setSeedBusy(true);
    try {
      const now = Date.now();
      const events = [
        { name: '3-Point Challenge', feeCents: 500, drillsEnabled: ['3PT'], locationType: 'in_person', dateISO: new Date(now + 24*3600*1000).toISOString() },
        { name: 'Free Throw Frenzy', feeCents: 300, drillsEnabled: ['FT'],  locationType: 'online',    dateISO: new Date(now + 48*3600*1000).toISOString() },
      ];
      for (const ev of events) await createEvent(ev);
      for (const e of ['test@ballskill.com','alice@ballskill.com','bob@ballskill.com']) {
        await grantCredits(e, 2500);
      }
      Alert.alert('Seed', 'Seeded 2 events + granted $25 to 3 users.');
    } catch (e:any) {
      Alert.alert('Seed failed', String(e?.message || e));
    } finally {
      setSeedBusy(false);
    }
  }, []);

  // Grant
  const [gEmail, setGEmail] = useState('test@ballskill.com');
  const [gDelta, setGDelta] = useState('2500');
  const [gBusy, setGBusy] = useState(false);
  const doGrant = useCallback(async () => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email.'); return; }
    setGBusy(true);
    try {
      await grantCredits(gEmail, Number(gDelta)||0);
      await addEmail(gEmail);
      Alert.alert('Credits', `Granted ${(Number(gDelta)||0)/100} to ${gEmail.trim().toLowerCase()}`);
    } catch (e:any) {
      Alert.alert('Grant failed', String(e?.message || e));
    } finally {
      setGBusy(false);
    }
  }, [gEmail, gDelta]);

  // Submit Result
  const [rEventId, setREventId] = useState('');
  const [rEmail, setREmail] = useState('test@ballskill.com');
  const [rDrill, setRDrill] = useState('FT');
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
        drillType: rDrill.trim(),
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

  return (
    <ScrollView
      style={{ flex:1, backgroundColor:'#000' }}
      contentContainerStyle={{ padding:16, paddingBottom: 96 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.h1}>Admin</Text>
      <Text style={s.sub}>Server: <Text style={{color:'#fff'}}>{API}</Text></Text>

      {/* Seed */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Seed Demo Data</Text>
        <Text style={s.meta}>Creates 2 events and grants $25 to a few test users.</Text>
        <TouchableOpacity disabled={seedBusy} style={[s.btn, seedBusy && s.btnDisabled]} onPress={doSeed}>
          <Text style={s.btnText}>{seedBusy ? 'Seeding…' : 'Run Seed'}</Text>
        </TouchableOpacity>
      </View>

      {/* Grant */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Grant Credits</Text>
        <Text style={s.meta}>Amount in cents (e.g., 2500 = $25)</Text>
        <AutoEmail value={gEmail} onChangeText={setGEmail} placeholder="email" style={s.input} />
        <TextInput style={s.input} placeholder="delta cents" placeholderTextColor={MUTED} value={gDelta} onChangeText={setGDelta} keyboardType="number-pad" />
        <TouchableOpacity disabled={gBusy} style={[s.btn, gBusy && s.btnDisabled]} onPress={doGrant}>
          <Text style={s.btnText}>{gBusy ? 'Granting…' : 'Grant'}</Text>
        </TouchableOpacity>
      </View>

      {/* Submit */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Enter Drill Result</Text>
        <Text style={s.meta}>Pick Event ID (type a few letters of the ID or name, then tap).</Text>
        <AutoEventId value={rEventId} onChangeText={setREventId} placeholder="eventId (searchable)" style={s.input} />
        <AutoEmail value={rEmail} onChangeText={setREmail} placeholder="player email" style={s.input} />
        <Text style={[s.meta, { marginTop: 6 }]}>drillType: <Text style={{color:'#fff'}}>{rDrill}</Text></Text>

        {/* Made / Attempts labels + inputs */}
        <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:8 }}>
          <Text style={s.smallLabel}>Made</Text>
          <Text style={s.smallLabel}>Attempts</Text>
        </View>
        <View style={{ flexDirection:'row', gap:8 }}>
          <TextInput style={[s.input, { flex:1 }]} placeholder="made" placeholderTextColor={MUTED} value={rMade} onChangeText={setRMade} keyboardType="number-pad" />
          <TextInput style={[s.input, { flex:1 }]} placeholder="attempts" placeholderTextColor={MUTED} value={rAttempts} onChangeText={setRAttempts} keyboardType="number-pad" />
        </View>

        {/* Time title + H:M:S:ms */}
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
    </ScrollView>
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

  timeRow:{ flexDirection:'row', gap:8, marginTop:8 },
  timeCell:{ flex:1 },
  timeLabel:{ color: MUTED, fontSize: 11, width: '25%', textAlign: 'center' },
});
