import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import api from '../services/api';

type DrillType = '3PT' | 'FT' | '2PT' | 'LAYUP';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a', WHITE = '#fff';

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
  const [timeMs, setTimeMs] = useState('45000');

  // Credits (demo grant)
  const [creditEmail, setCreditEmail] = useState('test@ballskill.com');
  const [delta, setDelta] = useState('25');

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
      const res = await api.makeRequest('/events', {
        method: 'POST',
        body: JSON.stringify({
          name,
          feeCents: Number(feeCents) || 0,
          drillsEnabled: drills,
          locationType,
          dateISO: new Date().toISOString(),
        }),
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
      await api.makeRequest(`/events/${eventId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          drillType,
          made: Number(made) || 0,
          attempts: Number(attempts) || 0,
          timeMs: Number(timeMs) || 0,
        }),
      });
      Alert.alert('Saved', 'Drill result recorded.');
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
        await api.makeRequest(`/events/${eventId}/submit`, {
          method: 'POST',
          body: JSON.stringify(r),
        });
      }
      Alert.alert('Seeded', 'Added sample results for test & guest.');
    } catch (e:any) {
      Alert.alert('Error', e.message);
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
              <Text style={[s.pillText, locationType === 'in_person' && s.pillTextOn]}>
                In-Person
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.pill, locationType === 'online' && s.pillOn]}
              onPress={() => setLocationType('online')}
            >
              <Text style={[s.pillText, locationType === 'online' && s.pillTextOn]}>
                Online
              </Text>
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
          <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
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
          <Text style={s.fieldLabel}>Time (ms)</Text>
          <TextInput style={s.input} value={timeMs} onChangeText={setTimeMs} keyboardType="numeric" />
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
