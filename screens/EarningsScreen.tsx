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
  getCreditsHistory,
  dollars as toDollars,
} from '../services/api';
import StripeSection from '../components/StripeSection';

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

  // Wallets derived from history
  const [histLoading, setHistLoading] = useState(false);
  const [skillCents, setSkillCents] = useState(0);
  const [realCents, setRealCents] = useState(0);

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

  const loadWallets = useCallback(async () => {
    if (!hasEmail) {
      setSkillCents(0);
      setRealCents(0);
      return;
    }
    setHistLoading(true);
    try {
      const list = await getCreditsHistory(email, { limit: 500 });
      let skill = 0;
      let real = 0;
      for (const it of list) {
        const note = (it?.note || '').toLowerCase();
        const isPromo = /promo|skill wallet|bonus|comp/.test(note);
        if (isPromo) skill += Number(it.delta || 0);
        else real += Number(it.delta || 0);
      }
      const total = Number(balanceCents || 0);
      if (skill + real !== total) {
        // keep totals consistent with current balance
        real = total - skill;
      }
      setSkillCents(Math.max(0, skill));
      setRealCents(Math.max(0, real));
    } catch (e) {
      // fallback: put everything in Dollars wallet
      setSkillCents(0);
      setRealCents(Number(balanceCents || 0));
    } finally {
      setHistLoading(false);
    }
  }, [email, hasEmail, balanceCents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadBalance(), loadWallets()]);
    setRefreshing(false);
  }, [loadBalance, loadWallets]);

  useEffect(() => {
    loadBalance();
    loadWallets();
  }, [loadBalance, loadWallets]);

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
            {balLoading ? 'Loading…' : balanceDollars != null ? `${balanceDollars}` : '—'}
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

      {/* Wallets */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Wallets</Text>
        <View style={{ gap: 12 }}>
          <View style={s.row}>
            <Text style={s.walletLabel}>
              <Text style={{ color: '#F97316', fontWeight: '900' }}>$</Text> Skill wallet
            </Text>
            <Text style={s.valueSmall}>
              {histLoading ? 'Loading…' : (toDollars(skillCents))}
            </Text>
          </View>
          <Text style={s.subtle}>Promo credits. Not eligible for payout.</Text>

          <View style={[s.row, { marginTop: 10 }]}>
            <Text style={s.walletLabel}>
              <Text style={{ color: '#16a34a', fontWeight: '900' }}>$</Text> Dollars wallet
            </Text>
            <Text style={s.valueSmall}>
              {histLoading ? 'Loading…' : (toDollars(realCents))}
            </Text>
          </View>
          <Text style={s.subtle}>Payout‑eligible once your Stripe account is fully set up.</Text>
        </View>
      </View>

      {/* How payouts work */}
      <View style={s.card}>
        <Text style={s.cardTitle}>How payouts work</Text>
        <Text style={s.subtleBullet}>• $Skill = promotional credits you can use in‑app (not paid out).</Text>
        <Text style={s.subtleBullet}>• $Dollars = real credits. Deposited to your bank after Stripe setup.</Text>
        <Text style={s.subtleBullet}>• Your total balance equals $Skill + $Dollars.</Text>
      </View>

      <StripeSection />
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
  valueSmall: { color: colors.WHITE, fontSize: 22, fontWeight: '900', letterSpacing: 0.25 },
  walletLabel: { color: colors.WHITE, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

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
