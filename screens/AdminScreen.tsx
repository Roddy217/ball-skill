import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import api from '../services/api';

type DrillType = '3PT' | 'FT' | '2PT' | 'LAYUP';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a', WHITE = '#fff';

function formatMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00.000';
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const mins = Math.floor(ms / 60000);
  ms %= 60000;
  const secs = Math.floor(ms / 1000);
  const msec = Math.floor(ms % 1000);
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');
  return hours > 0
    ? `${hours}:${pad2(mins)}:${pad2(secs)}.${pad3(msec)}`
    : `${mins}:${pad2(secs)}.${pad3(msec)}`;
}

function parseTimeInput(input: string): number {
  const s = input.trim();
  // Accept ms only
  if (/^\d+$/.test(s)) return Number(s);
  // Accept mm:ss(.mmm?) or ss(.mmm?)
  const mmss = /^(\d+):([0-5]?\d)(?:\.(\d{1,3}))?$/.exec(s);
  if (mmss) {
    const mm = Number(mmss[1]);
    const ss = Number(mmss[2]);
    const ms = Number((mmss[3] || '0').padEnd(3, '0'));
    return mm * 60000 + ss * 1000 + ms;
  }
  const ssms = /^(\d+)(?:\.(\d{1,3}))?$/.exec(s);
  if (ssms) {
    const ss = Number(ssms[1]);
    const ms = Number((ssms[2] || '0').padEnd(3, '0'));
    return ss * 1000 + ms;
  }
  return 0;
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(false);

  // Events
  const [events, setEvents] = useState<any[]>([]);
  const [name, setName] = useState('Ball Skill – Demo Event');
  const [feeCents, setFeeCents] = useState('0');
  const [drills, setDrills] = useState<DrillType[]>(['3PT','FT','2PT','LAYUP']);
  const [locationType, setLocationType] = useState<'in_person' | 'online'>('in_person');
  const [eventId, setEventId] = useState<string>('');

  // Drill submission
  const [email, setEmail] = useState('test@ballskill.com');
  const [drillType, setDrillType] = useState<DrillType>('3PT');
  const [made, setMade] = useState('7');
  const [attempts, setAttempts] = useState('10');
  const [timeInput, setTimeInput] = useState('45.000'); // accepts mm:ss.mmm, ss.mmm, or ms
  const timeMs = useMemo(() => parseTimeInput(timeInput), [timeInput]);

  // Credits (demo grant)
  const [creditEmail, setCreditEmail] = useState('test@ballskill.com');
  const [delta, setDelta] = useState('25');

  // Simple email autocomplete: start with common emails, augment as you submit
  const [knownEmails, setKnownEmails] = useState<string[]>([
    'test@ballskill.com', 'guest@ballskill.com', 'admin@ballskill.com'
  ]);
  const emailSuggestions = useMemo(
    () => knownEmails.filter(e => e.toLowerCase().includes((email || '').toLowerCase()) && e !== email).slice(0,5),
    [email, knownEmails]
  );
  const addKnownEmail = (e: string) => {
    if (!e) return;
    setKnownEmails(prev => prev.includes(e) ? prev : [e, ...prev].slice(0,50));
  };

  const toggleDrill = (d: DrillType) => {
    setDrills(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await api.getEvents();
      setEvents(res.events || []);
      if (!eventId && res.events?.length) setEventId(res.events[0].id);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async () => {
    setLoading(true);
    try {
      const res = await api.createEvent({
        name,
        feeCents: Number(feeCents) || 0,
        drillsEnabled: drills,
        locationType,
        dateISO: new Date().toISOString(),
      });
      Alert.alert('Created', res.event?.name || 'Event created');
      await loadEvents();
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitResult = async () => {
    if (!eventId) return Alert.alert('Pick event', 'Select an event first.');
    setLoading(true);
    try {
      await api.submitResult(eventId, {
        email,
        drillType,
        made: Number(made) || 0,
        attempts: Number(attempts) || 0,
        timeMs: timeMs || 0,
      });
      addKnownEmail(email);
      Alert.alert('Saved', `Drill recorded. Time = ${formatMs(timeMs)}`);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const grantCredits = async () => {
    setLoading(true);
    try {
      const res = await api.grantCredits(creditEmail, Number(delta) || 0);
      addKnownEmail(creditEmail);
      Alert.alert('Credits Updated', `New balance: ${res.balance}`);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const seedDemoData = async () => {
    if (!eventId) return Alert.alert('Pick event', 'Select an event first.');
    setLoading(true);
    try {
      const users = ['test@ballskill.com','guest@ballskill.com'];
      const seed = [
        { email: users[0], drillType: '3PT', made: 7, attempts: 10, timeMs: 42000 },
        { email: users[0], drillType: 'FT',  made: 8, attempts: 10, timeMs: 35000 },
        { email: users[1], drillType: '3PT', made: 6, attempts: 10, timeMs: 44000 },
        { email: users[1], drillType: 'FT',  made: 8, attempts: 10, timeMs: 36000 },
      ];
      for (const r of seed) {
        await api.submitResult(eventId, r);
        addKnownEmail(r.email);
      }
      Alert.alert('Seeded', 'Added sample results for test & guest.');
    } catch (e:any) {
      Alert.alert('Error', e.message || 'Seed failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  return (
    <KeyboardAvoidingView style={{ flex:1, backgroundColor:'#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding:16, paddingBottom:96 }}>
        <Text style={s.h1}>Admin</Text>
        <Text style={s.sub}>Create events, seed data, record drills, grant credits.</Text>

        {/* Create Event */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Create Event</Text>

          <Text style={s.fieldLabel}>Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} />

          <Text style={s.fieldLabel}>Fee (cents)</Text>
          <TextInput style={s.input} value={feeCents} onChangeText={setFeeCents} keyboardType="numeric" />

          <Text style={s.fieldLabel}>Drills</Text>
          <View style={s.row}>
            {(['3PT','FT','2PT','LAYUP'] as DrillType[]).map(d => (
              <TouchableOpacity key={d} style={[s.pill, drills.includes(d) && s.pillOn]} onPress={() => toggleDrill(d)}>
                <Text style={[s.pillText, drills.includes(d) && s.pillTextOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 8 }]}>Event Type</Text>
          <View style={[s.row, { marginTop: 6 }]}>
            <TouchableOpacity
              style={[s.pill, locationType === 'in_person' && s.pillOn]}
              onPress={() => setLocationType('in_person')}
            >
              <Text style={[s.pillText, locationType === 'in_person' && s.pillTextOn]}>In-Person</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.pill, locationType === 'online' && s.pillOn]}
              onPress={() => setLocationType('online')}
            >
              <Text style={[s.pillText, locationType === 'online' && s.pillTextOn]}>Online</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={createEvent} disabled={loading}>
            <Text style={s.btnText}>{loading ? 'Working…' : 'Create Event'}</Text>
          </TouchableOpacity>
        </View>

        {/* Event List / Select */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Events</Text>
          {loading && <ActivityIndicator color={ORANGE} />}
          {(events || []).map(ev => (
            <TouchableOpacity key={ev.id} style={[s.eventItem, ev.id===eventId && s.eventItemActive]} onPress={() => setEventId(ev.id)}>
              <Text style={s.eventTitle}>{ev.name}</Text>
              <Text style={s.eventMeta}>
                {new Date(ev.dateISO).toLocaleString()} • Type: {ev.locationType === 'in_person' ? 'In-Person' : 'Online'}
              </Text>
            </TouchableOpacity>
          ))}
          {!events?.length && <Text style={s.eventMeta}>No events yet.</Text>}

          <TouchableOpacity style={[s.btn, { marginTop: 10 }]} onPress={seedDemoData} disabled={!eventId || loading}>
            <Text style={s.btnText}>Seed Demo Data (test vs guest)</Text>
          </TouchableOpacity>
        </View>

        {/* Drill Submission */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Enter Drill Result</Text>
          <Text style={s.fieldLabel}>Player Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="player@example.com"
            placeholderTextColor="#666"
          />
          {!!emailSuggestions.length && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: MUTED, marginBottom: 6 }}>Suggestions</Text>
              {emailSuggestions.map(sug => (
                <TouchableOpacity key={sug} onPress={() => setEmail(sug)} style={[s.pill, { alignSelf:'flex-start' }]}>
                  <Text style={s.pillText}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={s.fieldLabel}>Drill</Text>
          <View style={s.row}>
            {(['3PT','FT','2PT','LAYUP'] as DrillType[]).map(d => (
              <TouchableOpacity key={d} style={[s.pill, drillType === d && s.pillOn]} onPress={() => setDrillType(d)}>
                <Text style={[s.pillText, drillType === d && s.pillTextOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>Made</Text>
          <TextInput style={s.input} value={made} onChangeText={setMade} keyboardType="numeric" />
          <Text style={s.fieldLabel}>Attempts</Text>
          <TextInput style={s.input} value={attempts} onChangeText={setAttempts} keyboardType="numeric" />

          <Text style={s.fieldLabel}>Time</Text>
          <TextInput
            style={s.input}
            value={timeInput}
            onChangeText={setTimeInput}
            placeholder="mm:ss.mmm or ss.mmm or ms"
            placeholderTextColor="#666"
            keyboardType="numbers-and-punctuation"
          />
          <Text style={{ color: MUTED, marginTop: 4 }}>Parsed = {formatMs(timeMs)}</Text>

          <TouchableOpacity style={[s.btn, { marginTop: 10 }]} onPress={submitResult} disabled={!eventId || loading}>
            <Text style={s.btnText}>Save Result</Text>
          </TouchableOpacity>
        </View>

        {/* Credits (demo) */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Grant Credits (Demo)</Text>
          <Text style={s.fieldLabel}>Email</Text>
          <TextInput style={s.input} value={creditEmail} onChangeText={setCreditEmail} autoCapitalize="none" keyboardType="email-address" />
          <Text style={s.fieldLabel}>Delta</Text>
          <TextInput style={s.input} value={delta} onChangeText={setDelta} keyboardType="numeric" />
          <TouchableOpacity style={[s.btn, { marginTop: 10 }]} onPress={grantCredits} disabled={loading}>
            <Text style={s.btnText}>Grant</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  h1: { color: WHITE, fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  cardTitle: { color: WHITE, fontWeight: '800', marginBottom: 8, fontSize: 16 },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '800' },
  fieldLabel: { color: MUTED, marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: WHITE, backgroundColor: '#0c0c0c' },
  eventItem: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  eventItemActive: { backgroundColor: '#0c0c0c', borderRadius: 10, paddingHorizontal: 10, marginTop: 8 },
  eventTitle: { color: WHITE, fontWeight: '700' },
  eventMeta: { color: MUTED, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, marginTop: 8 },
  pillOn: { backgroundColor: '#0c0c0c', borderColor: '#3a3a3a' },
  pillText: { color: '#9a9a9a', fontWeight: '700' },
  pillTextOn: { color: '#fff' },
});
