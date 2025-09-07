import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, Linking, ActivityIndicator } from 'react-native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import { getConnectStatus, startConnectOnboarding, getBalance } from '../services/api';
import { addNotification } from '../state/notify';

export default function EarningsScreen() {
  const { user } = useAuth();
  const emailLc = (user?.email || '').toLowerCase();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = async () => {
    if (!emailLc) return;
    setLoading(true);
    try {
      const [st, bal] = await Promise.all([getConnectStatus(emailLc), getBalance(emailLc)]);
      setStatus(st);
      setBalance(bal);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [emailLc]);

  const onOnboard = async () => {
    if (!emailLc) return Alert.alert('Sign in required', 'Please sign in.');
    try {
      setLoading(true);
      const r = await startConnectOnboarding(emailLc);
      if (!r?.url) return Alert.alert('Stripe', 'Unable to start onboarding.');
      addNotification({ title: 'Stripe onboarding', body: 'Opening Connect flow…' });
      // Use Linking to avoid WebBrowser overlay sticking around
      const ok = await Linking.openURL(r.url);
      if (!ok) Alert.alert('Open failed', 'Copy & paste the link into a browser:\n' + r.url);
    } catch (e: any) {
      Alert.alert('Stripe error', 'Could not open onboarding.');
    } finally { setLoading(false); }
  };

  return (
    <View style={s.container}>
      <Text style={s.h1}>Earnings</Text>

      <View style={s.card}>
        <Text style={s.label}>Current balance</Text>
        <Text style={s.value}>{balance === null ? '—' : `${balance} credits`}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Payouts</Text>
        <Text style={s.value}>
          {status?.hasAccount ? (status?.payouts_enabled ? 'Eligible' : 'Pending setup') : 'Not set up'}
        </Text>
        <View style={{ height: 8 }} />
        <Pressable onPress={onOnboard} style={({pressed})=>[s.btn, pressed && {opacity:0.9}]} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Opening…' : 'Set up payouts (Stripe)'}</Text>
        </Pressable>
        <Pressable onPress={refresh} style={({pressed})=>[s.btnOutline, pressed && {opacity:0.9}]}>
          {loading ? <ActivityIndicator /> : <Text style={s.btnOutlineText}>Refresh</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  card: { backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 6, marginBottom: 12 },
  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  value: { color: colors.TEXT, fontSize: 14, fontWeight: '800' },
  btn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: colors.WHITE, fontWeight: '800' },
  btnOutline: { borderColor: colors.ORANGE, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnOutlineText: { color: colors.ORANGE, fontWeight: '800' },
});
