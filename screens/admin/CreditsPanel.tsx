import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import colors from '../../theme/colors';
import { getCredits, applyCredits, getCreditHistory, searchProfiles } from '../../services/api';

export default function CreditsPanel() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);

  const load = async (target: string) => {
    if (!target) { setBalance(null); setHistory([]); return; }
    const [bal, hist] = await Promise.all([getCredits(target), getCreditHistory(target)]);
    setBalance(bal); setHistory(hist || []);
  };

  useEffect(() => { load(email.trim().toLowerCase()); }, [email]);

  useEffect(() => {
    let on = true;
    (async () => {
      const list = await searchProfiles(q.trim().toLowerCase());
      if (on) setCandidates(list);
    })();
    return () => { on = false; };
  }, [q]);

  const doApply = async (sign: 1 | -1) => {
    const e = email.trim().toLowerCase();
    const amt = Math.max(0, Number(amount) || 0);
    if (!e || !amt) return Alert.alert('Missing info', 'Add an email and amount.');
    const res = await applyCredits(e, sign * amt, reason || (sign > 0 ? 'grant' : 'deduct'));
    if (!res?.success) return Alert.alert('Error', 'Could not update credits.');
    setAmount(''); setReason('');
    await load(e);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={s.wrap}>
        <Text style={s.h2}>Credits</Text>

        <Text style={s.label}>Find user</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="type to search emails" placeholderTextColor={colors.MUTED_TEXT} style={s.input} autoCapitalize="none" />
        <View style={s.chipsRow}>
          {candidates.slice(0, 12).map(c => (
            <Pressable key={c.email} onPress={()=>{ setEmail(c.email); setQ(''); }} style={({pressed})=>[cs.chip, pressed && {opacity:0.9}]}>
              <Text style={cs.txt}>{c.email}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>Email</Text>
        <TextInput value={email} onChangeText={setEmail} placeholder="user@example.com" placeholderTextColor={colors.MUTED_TEXT} style={s.input} autoCapitalize="none" />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Amount</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="10" placeholderTextColor={colors.MUTED_TEXT} style={s.input} />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={s.label}>Notes</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder="reason" placeholderTextColor={colors.MUTED_TEXT} style={s.input} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable onPress={()=>doApply(1)} style={({pressed})=>[s.btnGrant, pressed && {opacity:0.9}]}>
            <Text style={s.btnTxt}>Grant</Text>
          </Pressable>
          <Pressable onPress={()=>doApply(-1)} style={({pressed})=>[s.btnDeduct, pressed && {opacity:0.9}]}>
            <Text style={s.btnTxt}>Deduct</Text>
          </Pressable>
        </View>

        <View style={{ height: 8 }} />
        <Text style={s.balance}>Balance: {balance === null ? '—' : balance}</Text>
        <View style={{ height: 8 }} />

        <Text style={s.h3}>History</Text>
        <FlatList
          data={history}
          keyExtractor={(it, i)=>String(i)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({item}) => (
            <View style={s.row}>
              <Text style={s.rowTs}>{new Date(item.ts || item.date || Date.now()).toLocaleString()}</Text>
              <Text style={s.rowAmt}>{item.delta > 0 ? `+${item.delta}` : item.delta}</Text>
              <Text style={s.rowReason}>{item.reason || item.note || ''}</Text>
            </View>
          )}
          style={{ maxHeight: 260, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, backgroundColor: colors.CANVAS }}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const cs = StyleSheet.create({
  chip: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, marginRight: 6, marginBottom: 6 },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
});

const s = StyleSheet.create({
  wrap: { gap: 8 },
  h2: { color: colors.TEXT, fontSize: 18, fontWeight: '900', marginBottom: 4 },
  h3: { color: colors.TEXT, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  label: { color: colors.MUTED_TEXT, fontSize: 12, marginTop: 4 },
  input: { backgroundColor: colors.CANVAS, color: colors.TEXT, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  btnGrant: { flex: 1, backgroundColor: '#2e7d32', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnDeduct: { flex: 1, backgroundColor: '#c62828', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnTxt: { color: colors.WHITE, fontWeight: '900' },
  balance: { color: colors.TEXT, fontSize: 14, fontWeight: '800' },

  row: { flexDirection: 'row', gap: 8, padding: 8, borderBottomColor: colors.BORDER, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTs: { color: colors.MUTED_TEXT, fontSize: 11, width: 160 },
  rowAmt: { color: colors.TEXT, fontWeight: '900', width: 60 },
  rowReason: { color: colors.TEXT, flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
});
