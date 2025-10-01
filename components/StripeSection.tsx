import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import { getApiBase, getConnectStatus, startConnectOnboarding } from '../services/api';

type ConnectStatus = {
  success: boolean;
  hasAccount: boolean;
  accountId?: string;
  payouts_enabled?: boolean;
  charges_enabled?: boolean;
  requirements_due?: string[];
};

const REQ_LABELS: Record<string, { icon: string; label: string }> = {
  'external_account':        { icon: '🏦', label: 'Add bank account' },
  'business_profile.url':    { icon: '🌐', label: 'Business URL' },
  'individual.first_name':   { icon: '🪪', label: 'First name' },
  'individual.last_name':    { icon: '🪪', label: 'Last name' },
  'tos_acceptance.date':     { icon: '✅', label: 'Accept terms (date)' },
  'tos_acceptance.ip':       { icon: '✅', label: 'Accept terms (IP)' },
};

function friendlyRequirement(key: string) {
  if (REQ_LABELS[key]) return REQ_LABELS[key];
  if (key.startsWith('individual.')) return { icon: '🪪', label: key.replace(/^individual\./, '').replace(/_/g, ' ') };
  return { icon: '⚠️', label: key.replace(/[_\.]/g, ' ') };
}

export default function StripeSection() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ConnectStatus | null>(null);

  const needsAction = !!(
    status &&
    (status.requirements_due && status.requirements_due.length > 0 ||
     status.payouts_enabled === false ||
     status.charges_enabled === false)
  );

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    try {
      const s = await getConnectStatus(email);
      setStatus(s);
    } catch (e: any) {
      console.log('[StripeSection] load error', e?.message || e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onOnboard = useCallback(async () => {
    try {
      const base = getApiBase().replace(/\/api$/, '');
      const returnUrl = `${base}/connect/return`;
      const refreshUrl = `${base}/connect/refresh`;
      const res = await startConnectOnboarding(email, returnUrl, refreshUrl);
      if (res?.url) {
        await Linking.openURL(res.url);
      } else {
        Alert.alert('Stripe', 'Could not open onboarding link.');
      }
    } catch (e: any) {
      Alert.alert('Stripe', e?.message || 'Failed to open onboarding.');
    }
  }, [email]);

  let badgeText = 'Not set up';
  let badgeColor = '#8a8a8a';
  if (status?.hasAccount) {
    if (needsAction) {
      badgeText = 'Action required';
      badgeColor = '#f59e0b';
    } else {
      badgeText = 'Ready';
      badgeColor = '#22c55e';
    }
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.cardTitle}>Payouts • Stripe Connect</Text>
        <View style={[s.badge, { backgroundColor: badgeColor }]}>
          <Text style={s.badgeText}>{badgeText}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.loadingRow}><ActivityIndicator color={colors.ORANGE} /></View>
      ) : !email ? (
        <Text style={s.hint}>Sign in to connect your Stripe account.</Text>
      ) : !status?.hasAccount ? (
        <>
          <Text style={s.hint}>Set up your Stripe Connect account to receive payouts.</Text>
          <Pressable onPress={onOnboard} style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.9 }]}>
            <Ionicons name="link-outline" size={16} color={colors.WHITE} />
            <Text style={s.primaryBtnText}>Start setup</Text>
          </Pressable>
        </>
      ) : (
        <>
          {needsAction ? (
            <>
              <Text style={s.hint}>Complete the steps below to enable payouts:</Text>
              <View style={s.reqWrap}>
                {(status.requirements_due || []).map((k) => {
                  const { icon, label } = friendlyRequirement(k);
                  return (
                    <View key={k} style={s.reqChip}>
                      <Text style={s.reqIcon}>{icon}</Text>
                      <Text style={s.reqText}>{label}</Text>
                    </View>
                  );
                })}
                {status.charges_enabled === false && (
                  <View style={s.reqChip}><Text style={s.reqIcon}>💳</Text><Text style={s.reqText}>Enable charges</Text></View>
                )}
                {status.payouts_enabled === false && (
                  <View style={s.reqChip}><Text style={s.reqIcon}>💵</Text><Text style={s.reqText}>Enable payouts</Text></View>
                )}
              </View>
              <Pressable onPress={onOnboard} style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.9 }]}>
                <Ionicons name="construct-outline" size={16} color={colors.WHITE} />
                <Text style={s.primaryBtnText}>Complete setup</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.hint}>Your account is ready. You can manage details in Stripe.</Text>
              <Pressable onPress={onOnboard} style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.9 }]}>
                <Ionicons name="open-outline" size={16} color={colors.TEXT} />
                <Text style={s.secondaryBtnText}>Open Stripe dashboard</Text>
              </Pressable>
            </>
          )}

          <View style={s.payoutRow}>
            <Text style={s.payoutLabel}>Upcoming payout</Text>
            <Text style={s.payoutValue}>—</Text>
          </View>
          <View style={s.payoutRow}>
            <Text style={s.payoutLabel}>Last payout</Text>
            <Text style={s.payoutValue}>—</Text>
          </View>

          {!!status?.accountId && (
            <Text style={s.footNote}>Account: {status.accountId}</Text>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { color: colors.TEXT, fontWeight: '800', fontSize: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: colors.WHITE, fontWeight: '800', fontSize: 12 },

  loadingRow: { paddingVertical: 8, alignItems: 'center' },
  hint: { color: colors.MUTED_TEXT, marginBottom: 10 },

  reqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  reqChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.BORDER,
    backgroundColor: '#1b1b1e',
  },
  reqIcon: { fontSize: 12 },
  reqText: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },

  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ORANGE,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  primaryBtnText: { color: colors.WHITE, fontWeight: '800' },

  secondaryBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1b1b1e',
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  secondaryBtnText: { color: colors.TEXT, fontWeight: '800' },

  payoutRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  payoutLabel: { color: colors.MUTED_TEXT },
  payoutValue: { color: colors.TEXT, fontWeight: '800' },

  footNote: { color: colors.MUTED_TEXT, marginTop: 8, fontSize: 12 },
});
