import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';

// Build API base from .env (Simulator: localhost, iPhone: LAN)
const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/,'');
const API = `${SERVER}/api`;

async function postJSON(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${path} (HTTP ${res.status})`);
  return data;
}

async function createEvent(ev: any) { return postJSON('/events', ev); }
async function grantCredits(email: string, delta: number) { return postJSON('/credits/grant', { email: email.trim().toLowerCase(), delta: Number(delta)||0 }); }
async function submitResult(eventId: string, payload: any) { return postJSON(`/events/${encodeURIComponent(eventId.trim())}/submit`, payload); }

export default function AdminScreen() {
  // --- Seed ---
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
        await grantCredits(e, 2500); // $25.00
      }
      Alert.alert('Seed', 'Seeded 2 events + granted $25 to 3 users.');
    } catch (e:any) {
      Alert.alert('Seed failed', String(e?.message || e));
    } finally {
      setSeedBusy(false);
    }
  }, []);

  // --- Grant ---
  const [gEmail, setGEmail] = useState('test@ballskill.com');
  const [gDelta, setGDelta] = useState('2500'); // cents
  const [gBusy, setGBusy] = useState(false);

  const doGrant = useCallback(async () => {
    setGBusy(true);
    try {
      await grantCredits(gEmail, Number(gDelta)||0);
      Alert.alert('Credits', `Granted ${Number(gDelta)/100} to ${gEmail.trim().toLowerCase()}`);
    } catch (e:any) {
      Alert.alert('Grant failed', String(e?.message || e));
    } finally {
      setGBusy(false);
    }
  }, [gEmail, gDelta]);

  // --- Submit Result ---
  const [rEventId, setREventId] = useState('');
  const [rEmail, setREmail] = useState('test@ballskill.com');
  const [rDrill, setRDrill] = useState('FT'); // e.g., 'FT' or '3PT'
  const [rMade, setRMade] = useState('8');
  const [rAttempts, setRAttempts] = useState('10');
  const [rMs, setRMs] = useState('12000');
  const [rBusy, setRBusy] = useState(false);

  const doSubmit = useCallback(async () => {
    if (!rEventId.trim()) { Alert.alert('Missing', 'Enter an Event ID (copy from Events tab).'); return; }
    setRBusy(true);
    try {
      await submitResult(rEventId, {
        email: rEmail.trim().toLowerCase(),
        drillType: rDrill.trim(),
        made: Number(rMade)||0,
        attempts: Number(rAttempts)||0,
        timeMs: Number(rMs)||0,
      });
      Alert.alert('Result', 'Saved result.');
    } catch (e:any) {
      Alert.alert('Submit failed', String(e?.message || e));
    } finally {
      setRBusy(false);
    }
  }, [rEventId, rEmail, rDrill, rMade, rAttempts, rMs]);

  return (
    <ScrollView style={{ flex:1, backgroundColor:'#000' }} contentContainerStyle={{ padding:16, paddingBottom: 96 }}>
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
        <TextInput style={s.input} placeholder="email" placeholderTextColor={MUTED} value={gEmail} onChangeText={setGEmail} autoCapitalize="none" />
        <TextInput style={s.input} placeholder="delta cents" placeholderTextColor={MUTED} value={gDelta} onChangeText={setGDelta} keyboardType="number-pad" />
        <TouchableOpacity disabled={gBusy} style={[s.btn, gBusy && s.btnDisabled]} onPress={doGrant}>
          <Text style={s.btnText}>{gBusy ? 'Granting…' : 'Grant'}</Text>
        </TouchableOpacity>
      </View>

      {/* Submit */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Enter Drill Result</Text>
        <Text style={s.meta}>Get Event ID from the Events tab card.</Text>
        <TextInput style={s.input} placeholder="eventId" placeholderTextColor={MUTED} value={rEventId} onChangeText={setREventId} autoCapitalize="none" />
        <TextInput style={s.input} placeholder="email" placeholderTextColor={MUTED} value={rEmail} onChangeText={setREmail} autoCapitalize="none" />
        <TextInput style={s.input} placeholder="drillType (FT or 3PT)" placeholderTextColor={MUTED} value={rDrill} onChangeText={setRDrill} autoCapitalize="characters" />
        <View style={{ flexDirection:'row', gap:8 }}>
          <TextInput style={[s.input, { flex:1 }]} placeholder="made" placeholderTextColor={MUTED} value={rMade} onChangeText={setRMade} keyboardType="number-pad" />
          <TextInput style={[s.input, { flex:1 }]} placeholder="attempts" placeholderTextColor={MUTED} value={rAttempts} onChangeText={setRAttempts} keyboardType="number-pad" />
        </View>
        <TextInput style={s.input} placeholder="timeMs (e.g., 12000)" placeholderTextColor={MUTED} value={rMs} onChangeText={setRMs} keyboardType="number-pad" />
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
  input:{ backgroundColor:'#090909', borderColor:'#1e1e1e', color:'#fff', borderWidth:1, borderRadius:10, paddingHorizontal:12, paddingVertical:10, marginTop:8 },
  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnDisabled:{ opacity:0.6 },
  btnText:{ color:'#000', fontWeight:'800' }
});
