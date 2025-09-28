import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import {
  getBalance,
  dollars as toDollars,
  getConnectStatus,
  startConnectOnboarding,
  getApiBase,
} from '../services/api';

type ConnectStatus =
  | { success: false; error?: string }
  | {
      success: true;
      hasAccount: boolean;
      accountId?: string;
      payouts_enabled?: boolean;
      charges_enabled?: boolean;
      requirements_due?: string[];
    };

export default function EarningsScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);

  const [balLoading, setBalLoading] = useState(false);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  const [statusLoading, setStatusLoading] = useState(false);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);

  const [onboardBusy, setOnboardBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const balanceDollars = useMemo(
    () => (balanceCents != null ? toDollars(balanceCents) : null),
    [balanceCents]
  );

  const loadBalance = useCallback(async () => {
    if (!hasEmail) return;
    setBalLoading(true);
    try {
      const cents = await getBalance(email);
      setBalanceCents(typeof cents === 'number' ? cents : Number(cents) || 0);
    } catch (e: any) {
      console.log('[Earnings][Balance] error', e?.message || e);
      Alert.alert('Balance', 'Could not load balance.');
    } finally {
      setBalLoading(false);
    }
  }, [email, hasEmail]);

  const loadStatus = useCallback(async () => {
    if (!hasEmail) {
      setConnect({ success: false, error: 'no_email' });
      return;
    }
    setStatusLoading(true);
    try {
      const s = await getConnectStatus(email);
      setConnect(s as ConnectStatus);
    } catch (e: any) {
      console.log('[Earnings][Status] error', e?.message || e);
      setConnect({ success: false, error: 'request_failed' });
    } finally {
      setStatusLoading(false);
    }
  }, [email, hasEmail]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadBalance(), loadStatus()]);
    setRefreshing(false);
  }, [loadBalance, loadStatus]);

  const onSetupPayouts = useCallback(async () => {
    if (!hasEmail) {
      Alert.alert('Stripe', 'Please sign in with email to set up payouts.');
      return;
    }
    setOnboardBusy(true);
    try {
      // Use server origin so Stripe will accept the URLs (must be valid http(s))
      const origin = String(getApiBase()).replace(/\/+$/, '');
      const refreshUrl = `${origin}/connect/refresh`;
      const returnUrl = `${origin}/connect/return`;

      const resp = await startConnectOnboarding(email, { refreshUrl, returnUrl });
      if (!resp?.success || !resp?.url) {
        console.log('[Earnings][Onboard] failed', resp);
        Alert.alert('Stripe', 'Could not start onboarding. Please try again.');
        return;
      }
      const ok = await Linking.openURL(resp.url).catch(() => false);
      if (!ok) {
        Alert.alert('Stripe', 'Could not open onboarding link.');
      }
    } catch (e: any) {
      console.log('[Earnings][Onboard] error', e?.message || e);
      Alert.alert('Stripe', 'Onboarding failed.');
    } finally {
      setOnboardBusy(false);
    }
  }, [email, hasEmail]);

  useEffect(() => {
    loadBalance();
    loadStatus();
  }, [loadBalance, loadStatus]);

  return (
    <ScrollView
      style={s.bg}
      contentContainerStyle={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
      }
    >
      <Text style={s.title}>Earnings</Text>

      {/* Balance */}
      <View style={s.card}>
        <Text style={s.cardTitle}>My balance</Text>
        <View style={s.row}>
          <Text style={s.value}>
            {balLoading ? 'Loading…' : balanceDollars != null ? `$${balanceDollars}` : '—'}
          </Text>
          <Pressable
            onPress={loadBalance}
            style={({ pressed }) => [s.chip, pressed && { opacity: 0.9 }]}
          >
            <Text style={s.chipText}>Refresh</Text>
          </Pressable>
        </View>
        {!hasEmail && <Text style={s.subtle}>Sign in with email to track earnings.</Text>}
      </View>

      {/* Stripe Connect Status */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Payouts (Stripe Connect)</Text>

        {statusLoading ? (
          <View style={[s.row, { alignItems: 'center' }]}>
            <ActivityIndicator />
            <Text style={[s.subtle, { marginLeft: 10 }]}>Checking status…</Text>
          </View>
        ) : !connect || (connect && (connect as any).success === false) ? (
          <>
            <Text style={s.subtle}>Status unavailable.</Text>
            <View style={[s.row, { marginTop: 10 }]}>
              <Pressable
                onPress={loadStatus}
                style={({ pressed }) => [s.chip, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.chipText}>Retry</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={s.kvBlock}>
              <Text style={s.kv}>
                <Text style={s.kvKey}>Account: </Text>
                <Text style={s.kvVal}>
                  {(connect as any).hasAccount ? (connect as any).accountId : 'Not created'}
                </Text>
              </Text>
              <Text style={s.kv}>
                <Text style={s.kvKey}>Payouts enabled: </Text>
                <Text style={s.kvVal}>
                  {(connect as any).payouts_enabled ? 'Yes ✅' : 'No'}
                </Text>
              </Text>
              <Text style={s.kv}>
                <Text style={s.kvKey}>Charges enabled: </Text>
                <Text style={s.kvVal}>
                  {(connect as any).charges_enabled ? 'Yes ✅' : 'No'}
                </Text>
              </Text>
            </View>

            {!!(connect as any).requirements_due?.length && (
              <View style={{ marginTop: 12 }}>
                <Text style={s.sectionLabel}>Requirements due</Text>
                {(connect as any).requirements_due.map((it: string) => (
                  <Text key={it} style={s.subtleBullet}>• {it}</Text>
                ))}
              </View>
            )}

            <View style={[s.row, { marginTop: 14 }]}>
              {!(connect as any).hasAccount || !(connect as any).payouts_enabled ? (
                <Pressable
                  disabled={onboardBusy}
                  onPress={onSetupPayouts}
                  style={({ pressed }) => [
                    s.primary,
                    onboardBusy && s.primaryDisabled,
                    pressed && !onboardBusy && { opacity: 0.92 },
                  ]}
                >
                  {onboardBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.primaryText}>
                      {(connect as any).hasAccount ? 'Continue setup' : 'Set up payouts'}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  onPress={loadStatus}
                  style={({ pressed }) => [s.chip, pressed && { opacity: 0.9 }]}
                >
                  <Text style={s.chipText}>Refresh status</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const ORANGE = '#FF6600';

const s = StyleSheet.create({
  bg: { backgroundColor: '#000' },
  container: { padding: 16 },
  title: { color: colors.WHITE, fontSize: 22, fontWeight: '800', marginBottom: 10 },

  card: {
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 12,
    borderColor: '#2a2a2a',
    borderWidth: 1,
    marginBottom: 16,
  },
  cardTitle: {
    color: colors.WHITE,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.2,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  value: { color: colors.WHITE, fontSize: 30, fontWeight: '900', letterSpacing: 0.25 },

  chip: {
    borderColor: '#2a2a2a',
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#181818',
  },
  chipText: { color: colors.WHITE, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },

  primary: {
    backgroundColor: ORANGE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 160,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },

  subtle: { color: '#cfcfcf', fontSize: 13, lineHeight: 18, marginTop: 6 },

  sectionLabel: {
    color: '#eaeaea',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  subtleBullet: { color: '#d0d0d0', fontSize: 13, lineHeight: 18 },

  // Key/Value block styling for Stripe status
  kvBlock: { gap: 6, marginTop: 4 },
  kv: { color: colors.WHITE, fontSize: 14, lineHeight: 20 },
  kvKey: { color: '#bdbdbd', fontWeight: '800' },
  kvVal: { color: '#ffffff', fontWeight: '700' },
});
