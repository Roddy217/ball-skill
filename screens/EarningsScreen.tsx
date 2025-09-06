import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import api from '../services/api';
import { auth } from '../services/firebase';

const ORANGE = '#FF6600';
const CARD = '#111';
const BORDER = '#2a2a2a';
const WHITE = '#fff';
const MUTED = '#9a9a9a';

export default function EarningsScreen() {
  const email = auth.currentUser?.email || '';
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const load = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await api.getCredits(email);
      setBalance(res.balance ?? 0);
    } catch (e:any) {
      // ignore for now
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [email]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#000' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={WHITE} />}>
      <View style={{ padding: 16 }}>
        <Text style={s.h1}>Earnings</Text>
        <View style={s.card}>
          <Text style={s.label}>Current Balance</Text>
          <Text style={s.balance}>
            {balance === null ? '—' : `${balance} credits`}
          </Text>
          <TouchableOpacity style={[s.btn, { marginTop: 12 }]} onPress={load} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Refresh</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1: { color: WHITE, fontSize: 22, fontWeight: '800', marginBottom: 12 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 16 },
  label: { color: MUTED, fontSize: 12 },
  balance: { color: WHITE, fontSize: 28, fontWeight: '900', marginTop: 4 },
  btn: { backgroundColor: ORANGE, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  btnText: { color: '#000', fontWeight: '700' },
});