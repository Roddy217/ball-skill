// /Users/roddywiley/Desktop/ball-skill-app/Ball-Skill/screens/ProfileScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { auth } from '../services/firebase';
import api from '../services/api';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';

function formatMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00.000';
  const pad2 = (n:number)=>n.toString().padStart(2,'0');
  const pad3 = (n:number)=>n.toString().padStart(3,'0');
  const h = Math.floor(ms/3600000);
  ms%=3600000;
  const m = Math.floor(ms/60000);
  ms%=60000;
  const s = Math.floor(ms/1000);
  const ms3 = Math.floor(ms%1000);
  return h>0 ? `${h}:${pad2(m)}:${pad2(s)}.${pad3(ms3)}` : `${m}:${pad2(s)}.${pad3(ms3)}`;
}

export default function ProfileScreen() {
  const email = auth.currentUser?.email || '';
  const [loading, setLoading] = useState(false);

  // NEW: my registrations
  const [registrations, setRegistrations] = useState<any[]>([]);
  // Existing: my submissions
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    if (!email) return;
    setLoading(true);
    try {
      // submissions
      const subRes = await api.makeRequest(`/user/${encodeURIComponent(email)}/submissions`);
      setRows(subRes.submissions || []);

      // registrations
      const regRes = await api.getMyRegistrations(email);
      setRegistrations(regRes.registrations || []);
    } catch (e:any) {
      // no-op for now; you can Alert if you want
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (e:any) {
      Alert.alert('Logout failed', e.message);
    }
  };

  useEffect(() => { load(); }, [email]);

  return (
    <ScrollView style={{ flex:1, backgroundColor:'#000' }} contentContainerStyle={{ padding:16, paddingBottom:96 }}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
        <View>
          <Text style={s.h1}>Profile</Text>
          <Text style={s.sub}>{email || '—'}</Text>
        </View>
        <TouchableOpacity style={s.btnOutline} onPress={logout}>
          <Text style={s.btnOutlineText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.btn} onPress={load}>
        <Text style={s.btnText}>Refresh</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 12 }} />}

      {/* --- My Registrations --- */}
      <View style={[s.card, { marginTop:14 }]}>
        <Text style={s.title}>My Registrations</Text>
        {(!registrations || registrations.length === 0) && (
          <Text style={[s.meta, { marginTop:6 }]}>No registrations yet.</Text>
        )}
        {(registrations || []).map((r, i) => (
          <View key={i} style={{ paddingTop:8, marginTop:8, borderTopWidth:1, borderTopColor:'#1b1b1b' }}>
            <Text style={s.meta}>{new Date(r.dateISO).toLocaleString()}</Text>
            <Text style={[s.meta, { marginTop:2 }]}>
              {r.eventName}  •  Credits used: {r.creditsUsed ?? 0}
            </Text>
          </View>
        ))}
      </View>

      {/* --- My Submissions --- */}
      <View style={[s.card, { marginTop:14 }]}>
        <Text style={s.title}>My Submissions</Text>
        {(!rows || rows.length === 0) && (
          <Text style={[s.meta, { marginTop:6 }]}>No submissions yet.</Text>
        )}
        {(rows || []).map((r, i) => (
          <View key={i} style={{ paddingTop:8, marginTop:8, borderTopWidth:1, borderTopColor:'#1b1b1b' }}>
            <Text style={s.meta}>{new Date(r.dateISO).toLocaleString()}</Text>
            <Text style={[s.meta, { marginTop:2 }]}>
              Drill: {r.drillType} • {r.made}/{r.attempts} • {formatMs(r.timeMs)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1:{ color:'#fff', fontSize:22, fontWeight:'800' },
  sub:{ color:MUTED, marginTop:4, marginBottom:14 },
  card:{ backgroundColor: CARD, borderColor: BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  title:{ color:'#fff', fontWeight:'800' },
  meta:{ color:MUTED, fontSize:12, marginTop:2 },
  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:10, alignItems:'center', marginTop:8 },
  btnText:{ color:'#000', fontWeight:'800' },
  btnOutline:{ borderWidth:1, borderColor:'#333', borderRadius:10, paddingVertical:8, paddingHorizontal:12 },
  btnOutlineText:{ color:'#fff', fontWeight:'800' },
});