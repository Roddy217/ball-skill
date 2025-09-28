// screens/EarningsScreen.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import bank from '../services/balanceService';

export default function EarningsScreen() {
  const { user } = useAuth();
  const hasEmail = !!(user && !user.isAnonymous && user.email);
  const email = hasEmail ? String(user.email).toLowerCase() : '';

  const [loading, setLoading] = useState(false);
  const [cents, setCents] = useState<number | null>(null);

  const dollars = useMemo(
    () => (cents != null ? (cents / 100).toFixed(2) : null),
    [cents]
  );

  const refresh = useCallback(async (reason: string = 'earnings-refresh') => {
    if (!hasEmail) { setCents(null); return; }
    setLoading(true);
    try {
      console.log('[Earnings] refresh for', email, 'reason=', reason);
      await bank.refresh(email, reason);          // pull from server into central cache
      const v = await bank.get(email);            // read from central cache
      setCents(typeof v === 'number' ? v : Number(v) || 0);
    } catch (e: any) {
      console.log('[Earnings] refresh error', e?.message || e);
      Alert.alert('Earnings', e?.message || 'Failed to load balance');
    } finally {
      setLoading(false);
    }
  }, [email, hasEmail]);

  // Refresh whenever this screen gains focus
  useFocusEffect(React.useCallback(() => {
    refresh('earnings-focus');
  }, [refresh]));

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.h1}>Earnings</Text>

      {!hasEmail ? (
        <View style={s.card}>
          <Text style={s.label}>Balance</Text>
          <Text style={s.hint}>Sign in with an email account to view your balance.</Text>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.label}>Balance</Text>
          <View style={s.row}>
            <Text style={s.balance}>{dollars == null ? '—' : `$${dollars}`}</Text>
            <Pressable
              onPress={() => refresh('earnings-tap')}
              disabled={loading}
              style={({ pressed }) => [s.refreshBtn, pressed && { opacity: 0.9 }, loading && s.refreshBtnDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={colors.WHITE} />
              ) : (
                <Text style={s.refreshText}>Refresh</Text>
              )}
            </Pressable>
          </View>
          <Text style={s.note}>This is the same balance used for event joins and admin grants/deductions.</Text>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.label}>Payouts</Text>
        <Text style={s.hint}>Stripe Connect onboarding will be added next.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS },
  content: { padding: 16, paddingBottom: 24 },
  h1: { color: colors.TEXT, fontSize: 22, fontWeight: '800', marginBottom: 8 },

  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balance: { color: colors.TEXT, fontSize: 28, fontWeight: '900' },

  refreshBtn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  refreshBtnDisabled: { opacity: 0.7 },
  refreshText: { color: colors.WHITE, fontWeight: '800' },

  hint: { color: colors.MUTED_TEXT },
  note: { color: colors.MUTED_TEXT, marginTop: 6 },
});