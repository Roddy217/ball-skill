import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard
} from 'react-native';
import { API_BASE_URL } from '../services/api';

const ORANGE = '#FF6600';
const CARD = '#111';
const BORDER = '#2a2a2a';
const MUTED = '#9a9a9a';
const WHITE = '#fff';

type DrillType = '3PT' | 'FT' | '2PT' | 'LAYUP';

const Btn = ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => (
  <TouchableOpacity style={[s.btn, disabled && s.btnDisabled]} onPress={onPress} disabled={disabled}>
    <Text style={s.btnText}>{title}</Text>
  </TouchableOpacity>
);

const Field = ({
  label, value, onChangeText, keyboardType = 'default', placeholder, returnKeyType, onSubmitEditing,
}: {
  label: string; value: string; onChangeText: (t: string) => void; keyboardType?: 'default'|'email-address'|'numeric';
  placeholder?: string; returnKeyType?: 'done'|'next'|'go'|'send'|'search'; onSubmitEditing?: () => void;
}) => (
  <View style={s.field}>
    <Text style={s.fieldLabel}>{label}</Text>
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={MUTED}
      keyboardType={keyboardType}
      autoCapitalize="none"
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
    />
  </View>
);

async function api<T = any>(url: string, method: string = 'GET', body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // @ts-ignore
  if (!res.ok || data?.success === false) throw new Error(data?.error || 'Request failed');
  return data as T;
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(false);

  // Events
  const [events, setEvents] = useState<any[]>([]);
  const [name, setName] = useState('Ball Skill – Aug 23 Demo');
  const [feeCents, setFeeCents] = useState('0');
  const [drills, setDrills] = useState<DrillType[]>(['3PT','FT','2PT','LAYUP']);

  // Selected event
  const [eventId, setEventId] = useState<string>('');

  // Registration
  const [regEmail, setRegEmail] = useState('test@ballskill.com');

  // Submission
  const [subEmail, setSubEmail] = useState('test@ballskill.com');
  const [drillType, setDrillType] = useState<DrillType>('3PT');
  const [made, setMade] = useState('7');
  const [attempts, setAttempts] = useState('10');
  const [timeMs, setTimeMs] = useState('30000');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<Array<{email:string,totalMade:number,totalTime:number}>>([]);

  // Credits
  const [grantEmail, setGrantEmail] = useState('test@ballskill.com');
  const [grantAmount, setGrantAmount] = useState('50');

  const drillsLabel = useMemo(() => drills.join(', '), [drills]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await api<{success:boolean; events:any[]}>(`${API_BASE_URL}/events`);
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
      const res = await api<{success:boolean; event:any}>(`${API_BASE_URL}/events`, 'POST', {
        name,
        feeCents: Number(feeCents) || 0,
        drillsEnabled: drills,
        locationType: 'in_person',
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

  const registerPlayer = async () => {
    if (!eventId) return Alert.alert('Pick event', 'Select an event first');
    setLoading(true);
    try {
      await api(`${API_BASE_URL}/events/${eventId}/register`, 'POST', {
        email: regEmail,
        firstQualifierFree: true,
      });
      Alert.alert('Registered', regEmail);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitResult = async () => {
    if (!eventId) return Alert.alert('Pick event', 'Select an event first');
    setLoading(true);
    try {
      await api(`${API_BASE_URL}/events/${eventId}/submit`, 'POST', {
        email: subEmail,
        drillType,
        made: Number(made) || 0,
        attempts: Number(attempts) || 10,
        timeMs: Number(timeMs) || null,
      });
      Alert.alert('Saved', `${subEmail} - ${drillType}`);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    if (!eventId) return Alert.alert('Pick event', 'Select an event first');
    setLoading(true);
    try {
      const res = await api<{success:boolean; leaderboard:any[]}>(`${API_BASE_URL}/events/${eventId}/leaderboard`);
      setLeaderboard(res.leaderboard || []);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const grant = async () => {
    if (!grantEmail) return Alert.alert('Missing', 'Email required');
    setLoading(true);
    try {
      const res = await api<{success:boolean; balance:number}>(`${API_BASE_URL}/credits/grant`, 'POST', {
        email: grantEmail,
        delta: Number(grantAmount) || 0,
      });
      Alert.alert('Granted', `${grantAmount} credits → ${grantEmail} (new bal ${res.balance})`);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#000' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 80, android: 0 })}
      >
        <ScrollView
          style={s.container}
          contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          contentInsetAdjustmentBehavior="automatic"
        >
          <Text style={s.h1}>Admin</Text>
          <Text style={s.sub}>Create events • Register players • Record results • Leaderboard • Credits</Text>

          {/* Create Event */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Create Event</Text>
            <Field label="Name" value={name} onChangeText={setName} />
            <Field label="Entry Fee (cents)" value={feeCents} onChangeText={setFeeCents} keyboardType="numeric" />
            <Text style={s.small}>Drills: {drillsLabel}</Text>
            <Btn title="Create Event" onPress={createEvent} disabled={loading} />
          </View>

          {/* Events List / Select */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Events</Text>
            <Btn title="Refresh Events" onPress={loadEvents} disabled={loading} />
            {loading && <ActivityIndicator style={{ marginTop: 8 }} color={ORANGE} />}
            {(events || []).map((ev) => (
              <TouchableOpacity key={ev.id} style={[s.eventItem, ev.id === eventId && s.eventItemActive]} onPress={() => setEventId(ev.id)}>
                <Text style={s.eventTitle}>{ev.name}</Text>
                <Text style={s.eventMeta}>{ev.dateISO}</Text>
              </TouchableOpacity>
            ))}
            {!events?.length && <Text style={s.muted}>No events yet. Create one above.</Text>}
          </View>

          {/* Register Player */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Register Player</Text>
            <Field label="Email" value={regEmail} onChangeText={setRegEmail} keyboardType="email-address" />
            <Btn title="Register" onPress={registerPlayer} disabled={loading} />
          </View>

          {/* Submit Result */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Enter Drill Result</Text>
            <Field label="Email" value={subEmail} onChangeText={setSubEmail} keyboardType="email-address" />
            <Field label="Drill (3PT | FT | 2PT | LAYUP)" value={drillType} onChangeText={(t) => setDrillType((t.toUpperCase() as DrillType) || '3PT')} />
            <View style={s.row}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Field label="Made" value={made} onChangeText={setMade} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Field label="Attempts" value={attempts} onChangeText={setAttempts} keyboardType="numeric" />
              </View>
            </View>
            <Field label="Time (ms)" value={timeMs} onChangeText={setTimeMs} keyboardType="numeric" />
            <Btn title="Save Result" onPress={submitResult} disabled={loading} />
          </View>

          {/* Leaderboard */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Leaderboard</Text>
            <Btn title="Refresh Leaderboard" onPress={loadLeaderboard} disabled={loading} />
            {leaderboard.map((row, idx) => (
              <View key={row.email + idx} style={s.lbRow}>
                <Text style={s.lbCell}>{idx + 1}.</Text>
                <Text style={[s.lbCell, { flex: 1 }]}>{row.email}</Text>
                <Text style={s.lbCell}>Made: {row.totalMade}</Text>
                <Text style={s.lbCell}>Time: {row.totalTime || 0}ms</Text>
              </View>
            ))}
            {!leaderboard.length && <Text style={s.muted}>No submissions yet.</Text>}
          </View>

          {/* Grant Credits */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Grant Credits (Admin)</Text>
            <Field label="Email" value={grantEmail} onChangeText={setGrantEmail} keyboardType="email-address" />
            <Field
              label="Amount"
              value={grantAmount}
              onChangeText={setGrantAmount}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <Btn title="Grant" onPress={grant} disabled={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: '#000' },
  h1: { color: WHITE, fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },
  small: { color: MUTED, marginTop: 4 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  cardTitle: { color: WHITE, fontWeight: '800', marginBottom: 8, fontSize: 16 },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '800' },
  field: { marginBottom: 8 },
  fieldLabel: { color: MUTED, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: WHITE, backgroundColor: '#0c0c0c' },
  eventItem: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  eventItemActive: { backgroundColor: '#0c0c0c', borderRadius: 10, paddingHorizontal: 10, marginTop: 8 },
  eventTitle: { color: WHITE, fontWeight: '700' },
  eventMeta: { color: MUTED, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  lbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1b1b1b' },
  lbCell: { color: WHITE, marginRight: 8 },
});
