import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import api, { toDollars } from '../services/api';
import { auth } from '../services/firebase';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a', WHITE = '#fff';

export default function EventsScreen() {
  const email = auth.currentUser?.email || 'test@ballskill.com';
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  const load = async () => {
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

  useEffect(() => { load(); }, []);

  const onJoin = async (ev:any) => {
    try {
      const fee = Number(ev.feeCents || 0) / 100; // dollars for message only
      const cents = Number(ev.feeCents || 0);
      const out = await api.joinEventDemo(ev.id, email, Math.max(0, cents));
      Alert.alert('Joined', `Paid $${toDollars(out.fee)} credits. New balance: ${out.balance}`);
    } catch (e:any) {
      Alert.alert('Join failed', e.message);
    }
  };

  return (
    <ScrollView style={{ flex:1, backgroundColor:'#000' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={WHITE} />}>
      <View style={{ padding:16 }}>
        <Text style={s.h1}>Events</Text>
        {loading && events.length === 0 ? (
          <ActivityIndicator color={ORANGE} style={{ marginTop:16 }} />
        ) : (
          <View style={s.card}>
            {events.length === 0 && <Text style={s.meta}>No events yet.</Text>}
            {events.map(ev => (
              <View key={ev.id} style={s.item}>
                <Text style={s.title}>{ev.name}</Text>
                <Text style={s.meta}>
                  {new Date(ev.dateISO).toLocaleString()} • Fee ${toDollars(ev.feeCents)} • {ev.locationType === 'in_person' ? 'In-Person' : 'Online'}
                </Text>
                <TouchableOpacity style={s.btn} onPress={() => onJoin(ev)}>
                  <Text style={s.btnText}>Join Event</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1:{ color:WHITE, fontSize:22, fontWeight:'800' },
  card:{ backgroundColor:CARD, borderColor:BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  item:{ paddingVertical:8, borderTopWidth:1, borderTopColor:'#1b1b1b' },
  title:{ color:WHITE, fontWeight:'800' },
  meta:{ color:MUTED, fontSize:12, marginTop:2 },
  btn:{ backgroundColor:ORANGE, borderRadius:12, paddingVertical:10, alignItems:'center', marginTop:10 },
  btnText:{ color:'#000', fontWeight:'800' },
});
