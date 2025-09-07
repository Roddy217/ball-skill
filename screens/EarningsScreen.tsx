import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import api from '../services/api';
import { auth } from '../services/firebase';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', WHITE = '#fff', MUTED = '#9a9a9a';

export default function EarningsScreen() {
  const email = auth.currentUser?.email || 'test@ballskill.com';
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const load = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await api.getCredits(email);
      setBalance(res.balance ?? 0);
    } catch (e:any) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [email]);

  return (
    <ScrollView style={{ flex:1, backgroundColor:'#000' }} contentContainerStyle={{ padding:16 }}>
      <Text style={s.h1}>Earnings</Text>

      <View style={s.card}>
        <Text style={s.label}>Current Balance</Text>
        {loading ? (
          <ActivityIndicator color={ORANGE} />
        ) : (
          <Text style={s.balance}>{balance == null ? '--' : balance}</Text>
        )}
        <TouchableOpacity style={s.btn} onPress={load}>
          <Text style={s.btnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1:{ color:WHITE, fontSize:22, fontWeight:'800' },
  card:{ backgroundColor:CARD, borderColor:BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  label:{ color:MUTED, marginBottom:6 },
  balance:{ color:WHITE, fontSize:28, fontWeight:'900', marginBottom:10 },
  btn:{ backgroundColor:ORANGE, borderRadius:12, paddingVertical:10, alignItems:'center' },
  btnText:{ color:'#000', fontWeight:'800' },
});
