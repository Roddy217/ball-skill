import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import api from '../services/api';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';

function toDollars(cents?: number) {
  const n = Number(cents ?? 0);
  return `$${(n / 100).toFixed(2)}`;
}

export default function EventsScreen() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const copyId = useCallback(async (id?: string) => {
    if (!id) return;
    await Clipboard.setStringAsync(String(id));
    Alert.alert('Copied', 'Event ID copied to clipboard.');
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await api.getEvents();
      setEvents(res.events || []);
    } catch (e:any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEvents(); }, []);

  return (
    <ScrollView style={{ flex:1, backgroundColor:'#000' }} contentContainerStyle={{ padding:16, paddingBottom: 96 }}>
      <Text style={s.h1}>Events</Text>
      <Text style={s.sub}>Join skill events. Type shows whether it’s in-person or online.</Text>

      {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 12 }} />}

      {(events || []).map(ev => {
        const id = ev?.id || ev?._id || '';
        const when = ev?.dateISO ? new Date(ev.dateISO).toLocaleString() : 'TBA';
        const typeText = ev?.locationType === 'in_person' ? 'In-Person' : 'Online';

        // Common server field variants (we accept several to be robust)
        const feeCents = Number(ev?.feeCents ?? ev?.entryFeeCents ?? 0);
        const prizeCents = Number(ev?.prizePoolCents ?? ev?.prizeCents ?? 0);
        const capacity = Number(ev?.capacity ?? 0);
        const registered = Number(
          ev?.registeredCount ??
          (Array.isArray(ev?.registrations) ? ev.registrations.length : undefined) ??
          ev?.joinedCount ??
          0
        );
        const spotsRemaining = (ev?.spotsRemaining != null)
          ? Number(ev.spotsRemaining)
          : (capacity ? Math.max(0, capacity - registered) : null);

        const drills = Array.isArray(ev?.drillsEnabled) ? ev.drillsEnabled.join(', ') : (ev?.drills ?? '—');

        return (
          <View key={id || ev.name} style={s.card}>
            <Text style={s.cardTitle}>{ev.name}</Text>

            {/* Basic meta */}
            <Text style={s.meta}>{when} • Type: {typeText}</Text>

            {/* Event ID row */}
            <View style={s.idRow}>
              <Text style={s.idLabel}>ID:</Text>
              <Text style={s.idValue} numberOfLines={1} selectable>{id || 'N/A'}</Text>
              {!!id && (
                <TouchableOpacity style={s.copyBtn} onPress={() => copyId(id)}>
                  <Text style={s.copyText}>Copy</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Metrics grid (shows only what exists) */}
            <View style={s.metrics}>
              {feeCents > 0 && (
                <View style={s.metric}>
                  <Text style={s.metricLabel}>Entry Fee</Text>
                  <Text style={s.metricValue}>{toDollars(feeCents)}</Text>
                </View>
              )}
              {prizeCents > 0 && (
                <View style={s.metric}>
                  <Text style={s.metricLabel}>Prize Pool</Text>
                  <Text style={s.metricValue}>{toDollars(prizeCents)}</Text>
                </View>
              )}
              {capacity > 0 && (
                <View style={s.metric}>
                  <Text style={s.metricLabel}>Capacity</Text>
                  <Text style={s.metricValue}>{capacity}</Text>
                </View>
              )}
              {(spotsRemaining != null) && (
                <View style={s.metric}>
                  <Text style={s.metricLabel}>Spots Left</Text>
                  <Text style={s.metricValue}>{spotsRemaining}</Text>
                </View>
              )}
              {!!drills && drills !== '—' && (
                <View style={[s.metric, { flexBasis:'100%' }]}>
                  <Text style={s.metricLabel}>Drills</Text>
                  <Text style={s.metricValue}>{drills}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={s.btn}
              onPress={() => Alert.alert('Join', 'Stripe flow already wired for demo in earlier steps.')}
            >
              <Text style={s.btnText}>Join Event</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {!loading && !events?.length && (
        <Text style={[s.meta, { marginTop: 12 }]}>No events yet. Create some in the Admin tab.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1:{ color:'#fff', fontSize:22, fontWeight:'800' },
  sub:{ color:MUTED, marginTop:4, marginBottom:14 },
  card:{ backgroundColor: CARD, borderColor: BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  cardTitle:{ color:'#fff', fontWeight:'800', fontSize:16 },
  meta:{ color:MUTED, fontSize:12, marginTop:2 },

  idRow:{ flexDirection:'row', alignItems:'center', marginTop:8 },
  idLabel:{ color:MUTED, fontSize:12, marginRight:6 },
  idValue:{ color:'#fff', fontSize:12, flex:1 },
  copyBtn:{ backgroundColor: ORANGE, paddingVertical:6, paddingHorizontal:10, borderRadius:8, marginLeft:8 },
  copyText:{ color:'#000', fontWeight:'800', fontSize:12 },

  // metrics grid
  metrics:{ flexDirection:'row', flexWrap:'wrap', columnGap:12, rowGap:6, marginTop:10, marginBottom:6 },
  metric:{ backgroundColor:'#0b0b0b', borderColor:'#1e1e1e', borderWidth:1, borderRadius:10, paddingVertical:8, paddingHorizontal:10, flexBasis:'48%' },
  metricLabel:{ color:MUTED, fontSize:11, marginBottom:2 },
  metricValue:{ color:'#fff', fontSize:13, fontWeight:'700' },

  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnText:{ color:'#000', fontWeight:'800' }
});
