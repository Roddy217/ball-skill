import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import api from '../services/api';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';

export default function EventsScreen() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

      {(events || []).map(ev => (
        <View key={ev.id} style={s.card}>
          <Text style={s.cardTitle}>{ev.name}</Text>
          <Text style={s.meta}>
            {new Date(ev.dateISO).toLocaleString()} • Type: {ev.locationType === 'in_person' ? 'In-Person' : 'Online'}
          </Text>

          <View style={{ height:8 }} />
          <TouchableOpacity style={s.btn} onPress={() => Alert.alert('Join', 'Stripe flow already wired for demo in earlier steps.')}>
            <Text style={s.btnText}>Join Event</Text>
          </TouchableOpacity>
        </View>
      ))}

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
  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnText:{ color:'#000', fontWeight:'800' }
});
