import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import Api from '../services/api';
import { auth } from '../services/firebase';

const ORANGE = '#FF6600';
const CARD = '#111';
const BORDER = '#2a2a2a';
const MUTED = '#9a9a9a';

export default function EarningsScreen() {
  const user = auth.currentUser;
  const email = user?.email || 'guest';
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const load = async () => {
    if (!email || email === 'guest') {
      setBalance(0);
      return;
    }
    setLoading(true);
    try {
      const { balance } = await Api.getCredits(email);
      setBalance(balance ?? 0);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={s.container}>
      <Text style={s.h1}>Earnings</Text>
      <Text style={s.sub}>Wallet balance & payouts (demo credits)</Text>

      <View style={s.card}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{email}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Credit Balance</Text>
        <View style={s.row}>
          <Text style={s.balance}>{balance === null ? '-' : balance}</Text>
          <TouchableOpacity style={s.btn} onPress={load} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Refresh</Text>}
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>Credits can be used to register for events; payouts via Stripe Connect (later)</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 16, paddingTop: 22 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  label: { color: MUTED, marginBottom: 6 },
  value: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balance: { color: '#fff', fontSize: 28, fontWeight: '900' },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  btnText: { color: '#000', fontWeight: '800' },
  hint: { color: MUTED, marginTop: 8 },
});
