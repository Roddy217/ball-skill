import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { auth } from '../services/firebase';
import api from '../services/api';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a';

export default function EarningsScreen() {
  const user = auth.currentUser;
  const email = user?.email || '';
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [grantDelta, setGrantDelta] = useState('25');

  const fetchBalance = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await api.getCredits(email);
      setBalance(typeof res.balance === 'number' ? res.balance : 0);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load credits');
    } finally {
      setLoading(false);
    }
  };

  const grant = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await api.grantCredits(email, Number(grantDelta) || 0);
      setBalance(res.balance ?? balance);
      Alert.alert('Success', `New balance: ${res.balance}`);
    } catch (e:any) {
      Alert.alert('Error', e.message || 'Grant failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBalance(); }, [email]);

  return (
    <View style={{ flex:1, backgroundColor:'#000', padding:16, paddingTop:22 }}>
      <Text style={s.h1}>Earnings</Text>
      <Text style={s.sub}>Credits can be used to register for events; payouts via Stripe Connect (later).</Text>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.label}>Email</Text>
          <Text style={s.value}>{email || '—'}</Text>
        </View>
        <View style={[s.row, { marginTop: 6 }]}>
          <Text style={s.label}>Balance</Text>
          <Text style={s.balance}>{balance === null ? '—' : balance}</Text>
        </View>
        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={fetchBalance} disabled={loading || !email}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Refresh</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Grant Credits (demo)</Text>
        <TextInput
          value={grantDelta}
          onChangeText={setGrantDelta}
          keyboardType="numeric"
          style={s.input}
          placeholder="Delta"
          placeholderTextColor="#666"
        />
        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={grant} disabled={loading || !email}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Grant</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  h1: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: MUTED },
  value: { color: '#fff', fontWeight: '700' },
  balance: { color: '#fff', fontSize: 28, fontWeight: '900' },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '800' },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', backgroundColor: '#0c0c0c', marginTop: 8 },
});
