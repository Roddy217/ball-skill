import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { API_BASE_URL } from '../services/api';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';

export default function DashboardScreen() {
  const { user, signInGuest } = useAuth();
  const [status, setStatus] = useState<'checking'|'ok'|'down'>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [busyGuest, setBusyGuest] = useState(false);

  useEffect(() => {
    const ping = async () => {
      try {
        const start = Date.now();
        // server base (strip trailing /api)
        const base = API_BASE_URL.replace(/\/api$/, '');
        const res = await fetch(`${base}/api/health`);
        const json = await res.json().catch(() => ({}));
        setLatency(Date.now() - start);
        setStatus(res.ok && json?.status === 'ok' ? 'ok' : 'down');
      } catch {
        setStatus('down');
      }
    };
    ping();
  }, []);

  const doGuest = async () => {
    try {
      setBusyGuest(true);
      await signInGuest();
    } finally {
      setBusyGuest(false);
    }
  };

  return (
    <View style={{ flex:1, backgroundColor:'#000', padding:16 }}>
      <Text style={s.h1}>Dashboard</Text>
      <Text style={s.sub}>
        {user?.email ? `Signed in as ${user.email}` : (user ? 'Guest session' : 'Signed out')}
      </Text>

      {/* Server status card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Server status</Text>
        <Text style={s.meta}>
          {status === 'checking' && 'Checking…'}
          {status === 'ok' && `ok${latency != null ? ` • ${latency}ms` : ''}`}
          {status === 'down' && 'down'}
        </Text>
      </View>

      {/* Guest login only when signed out */}
      {!user?.email && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Quick test</Text>
          <Text style={s.meta}>Start a guest session (anonymous Firebase auth).</Text>
          <Pressable onPress={doGuest} disabled={busyGuest} style={s.btnOutline}>
            {busyGuest
              ? <ActivityIndicator color={ORANGE} />
              : <Text style={s.btnOutlineText}>Guest login</Text>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  h1:{ color:'#fff', fontSize:22, fontWeight:'800' },
  sub:{ color:MUTED, marginTop:4, marginBottom:14 },
  card:{ backgroundColor: CARD, borderColor: BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  cardTitle:{ color:'#fff', fontWeight:'800', fontSize:16 },
  meta:{ color:MUTED, fontSize:12, marginTop:2 },
  btnOutline:{ marginTop:12, alignSelf:'flex-start', borderRadius:10, borderWidth:1, borderColor:ORANGE, paddingVertical:10, paddingHorizontal:14 },
  btnOutlineText:{ color:ORANGE, fontWeight:'800' },
});
