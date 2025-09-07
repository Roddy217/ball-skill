import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import colors from '../theme/colors';
import { getBalance, getConnectStatus, startConnectOnboarding } from '../services/api';
import { useAuth } from '../providers/AuthProvider';

export default function EarningsScreen() {
  const { user } = useAuth();
  const email = (user?.email || 'demo@ballskill.app').toLowerCase();

  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<{ has: boolean; payouts: boolean; acct?: string; due?: string[] }>({ has: false, payouts: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bal, st] = await Promise.all([getBalance(email), getConnectStatus(email)]);
      setBalance(bal);
      setStatus({
        has: !!st?.hasAccount,
        payouts: !!st?.payouts_enabled,
        acct: st?.accountId,
        due: st?.requirements_due || [],
      });
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { load(); }, [load]);

  const onSetup = async () => {
    const ret = await startConnectOnboarding(
      email,
      'https://dashboard.stripe.com/',
      'https://dashboard.stripe.com/settings'
    );
    if (ret?.success && ret.url) {
      const can = await Linking.canOpenURL(ret.url);
      if (!can) {
        Alert.alert('Open this link to continue', ret.url);
        return;
      }
      try {
        await Linking.openURL(ret.url);
      } catch (e: any) {
        Alert.alert('Open this link to continue', ret.url);
      }
    } else {
      Alert.alert('Stripe error', ret?.error || 'Unable to start onboarding');
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.h1}>Earnings</Text>

      {status.has && !status.payouts && (
        <View style={s.banner}>
          <Text style={s.bannerTitle}>Action needed to enable payouts</Text>
          {!!status.due?.length && <Text style={s.bannerBody}>Missing: {status.due.join(', ')}</Text>}
          <Pressable onPress={onSetup} style={({ pressed }) => [s.bannerBtn, pressed && { opacity: 0.9 }]}>
            <Text style={s.bannerBtnText}>Continue onboarding</Text>
          </Pressable>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.label}>Balance</Text>
        {loading ? <ActivityIndicator /> : <Text style={s.balance}>{balance === null ? '—' : `${balance} credits`}</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.label}>Payouts</Text>
        {loading ? (
          <ActivityIndicator />
        ) : status.has ? (
          <View>
            <Text style={s.row}>Account: <Text style={s.bold}>{status.acct}</Text></Text>
            <Text style={s.row}>Payouts: <Text style={s.bold}>{status.payouts ? 'Enabled' : 'Pending'}</Text></Text>
            {!!status.due?.length && <Text style={s.due}>Requirements due: {status.due.join(', ')}</Text>}
            {!status.payouts && (
              <Pressable onPress={onSetup} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}>
                <Text style={s.btnText}>Continue onboarding</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Pressable onPress={onSetup} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}>
            <Text style={s.btnText}>Set up payouts (Stripe)</Text>
          </Pressable>
        )}
      </View>

      <Pressable onPress={load} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.9 }]}>
        <Text style={s.ghostText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16, gap: 12 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },

  banner: {
    backgroundColor: '#1f140d',
    borderColor: colors.ORANGE,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  bannerTitle: { color: colors.ORANGE, fontWeight: '800' },
  bannerBody: { color: colors.MUTED_TEXT },
  bannerBtn: { alignSelf: 'flex-start', backgroundColor: colors.ORANGE, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  bannerBtnText: { color: colors.WHITE, fontWeight: '800' },

  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  balance: { color: colors.TEXT, fontSize: 20, fontWeight: '800' },
  row: { color: colors.TEXT, fontSize: 14, marginBottom: 4 },
  bold: { fontWeight: '800', color: colors.TEXT },
  due: { color: colors.MUTED_TEXT, fontSize: 12, marginBottom: 8 },
  btn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: colors.WHITE, fontWeight: '800', fontSize: 14 },
  ghost: { borderRadius: 10, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, alignItems: 'center' },
  ghostText: { color: colors.TEXT, fontWeight: '700' },
});
