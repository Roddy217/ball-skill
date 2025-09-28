import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import { getBalance, getConnectStatus, startConnectOnboarding } from '../services/api';

export default function EarningsScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);

  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    console.log('[Earnings] load()', { hasEmail, email });
    if (!hasEmail) { setBalance(null); setStatus(null); return; }
    setLoading(true);
    try {
      const [b, st] = await Promise.all([
        getBalance(email).catch((e:any) => { console.log('[Earnings] getBalance err', e); return null; }),
        getConnectStatus(email).catch((e:any) => { console.log('[Earnings] getConnectStatus err', e); return null; }),
      ]);
      console.log('[Earnings] results', { b, st });
      setBalance(typeof b === 'number' ? b : null);
      setStatus(st);
    } finally {
      setLoading(false);
    }
  }, [hasEmail, email]);

  useEffect(() => { load(); }, [load]);

  const onSetupPayouts = useCallback(async () => {
    try {
      if (!hasEmail) { Alert.alert('Sign in required'); return; }
      setOpening(true);

      // Use real http(s) URLs for Stripe (NOT exp://)
      const origin = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/,'');
      const refreshUrl = `${origin}/connect/refresh`;
      const returnUrl  = `${origin}/connect/return`;
      console.log('[Earnings] onboarding request', { email, refreshUrl, returnUrl });

      const resp = await startConnectOnboarding(email, { refreshUrl, returnUrl });
      console.log('[Earnings] onboarding response', resp);
      if (!resp?.url) throw new Error('No onboarding link returned');
      const ok = await Linking.openURL(resp.url);
      if (!ok) Alert.alert('Open this URL in your browser', resp.url);
    } catch (e:any) {
      console.log('[Earnings] onboarding error', e);
      Alert.alert('Stripe', e?.message || 'Could not start onboarding');
    } finally {
      setOpening(false);
    }
  }, [email, hasEmail]);

  const dollars = (cents: number | null) => (cents == null ? '—' : `$${(cents/100).toFixed(2)}`);

  return (
    <ScrollView contentContainerStyle={s.container} style={s.bg}>
      <Text style={s.title}>Earnings</Text>

      <View style={s.card}>
        <Text style={s.small}>Signed-in as</Text>
        <Text style={s.email}>{email || '—'}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>My Balance</Text>
        <Text style={s.value}>{loading ? 'Loading…' : dollars(balance)}</Text>
        <Pressable onPress={load} style={({pressed}) => [s.btn, pressed && {opacity:0.9}]}>
          <Text style={s.btnText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Stripe Payouts</Text>
        <Text style={s.small}>
          {status?.hasAccount
            ? (status?.payouts_enabled ? 'Payouts enabled' : 'Finish onboarding to enable payouts')
            : 'No Stripe account yet'}
        </Text>
        <Pressable disabled={opening} onPress={onSetupPayouts}
          style={({pressed}) => [s.primary, (pressed||opening) && {opacity:0.9}]}>
          {opening ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Set up payouts</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bg: { backgroundColor: '#000' },
  container: { padding: 16 },
  title: { color: colors.WHITE, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  card: { backgroundColor: '#111', padding: 16, borderRadius: 12, borderColor: '#2a2a2a', borderWidth: 1, marginBottom: 16 },
  label: { color: '#bbb', fontSize: 13, marginBottom: 6 },
  value: { color: colors.WHITE, fontSize: 24, fontWeight: '700', marginBottom: 12 },
  btn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  btnText: { color: colors.WHITE, fontSize: 14, fontWeight: '600' },
  small: { color: '#aaa', marginBottom: 12 },
  email: { color: colors.WHITE, fontSize: 16, fontWeight: '600' },
  primary: { backgroundColor: '#FF6600', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
});
