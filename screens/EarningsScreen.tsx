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

type HistItem = { ts: number; delta: number; note?: string | null; balanceAfter: number };

const ORANGE = '#FF6600';
const GREEN = '#16a34a';
const RED = '#ef4444';

export default function EarningsScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);

  const [balLoading, setBalLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);

  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [skillCents, setSkillCents] = useState<number | null>(null);
  const [realCents, setRealCents] = useState<number | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const balanceDollars = useMemo(
    () => (balanceCents != null ? toDollars(balanceCents) : null),
    [balanceCents]
  );

  const colorize = (n?: number | null, color: string) =>
    n == null ? '—' : <Text style={{ color, fontWeight: '900' }}>{toDollars(n)}</Text>;

  const isSkillTag = (note?: string | null) =>
    /(^|\s)(promo|bonus|demo|skill wallet|signup|referral)(\s|$)/i.test(String(note || ''));

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

  const recomputeWallets = useCallback(async () => {
    if (!hasEmail) return;
    setHistLoading(true);
    try {
      const list: HistItem[] = await getCreditsHistory(email, { limit: 500 });
      let skill = 0;
      for (const h of list) {
        if (h.delta > 0 && isSkillTag(h.note)) {
          skill += h.delta;
        }
      }
      // Align with current total balance; whatever isn't tagged as Skill is Dollars
      const total = Number(balanceCents || 0);
      if (skill > total) skill = total;
      const real = total - skill;
      setSkillCents(skill);
      setRealCents(real);
    } catch (e) {
      console.log('[Earnings][Wallets] error', e);
      // fall back: all dollars, nothing skill
      const total = Number(balanceCents || 0);
      setSkillCents(0);
      setRealCents(total);
    } finally {
      setHistLoading(false);
    }
  }, [email, hasEmail, balanceCents]);

  const loadWallets = useCallback(async () => {
    // Ensure we have a balance first (needed to split dollars = total - skill)
    if (balanceCents == null) return;
    await recomputeWallets();
  }, [recomputeWallets, balanceCents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadBalance();
      await loadWallets();
    } finally {
      setRefreshing(false);
    }
  }, [loadBalance, loadWallets]);

  useEffect(() => {
    (async () => {
      await loadBalance();
      await loadWallets();
    })();
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
            onPress={async () => {
              await loadBalance();
              await loadWallets();
            }}
            style={({ pressed }) => [s.chip, pressed && { opacity: 0.9 }]}
          >
            <Text style={s.chipText}>Refresh</Text>
          </Pressable>
        </View>
        {!hasEmail && <Text style={s.subtle}>Sign in with email to track earnings.</Text>}
      </View>

      {/* Wallets */}
      <View style={s.card}>
        <View style={[s.row, { marginBottom: 8 }]}>
          <Text style={s.cardTitle}>Wallets</Text>
          <Pressable
            onPress={recomputeWallets}
            disabled={histLoading}
            style={({ pressed }) => [
              s.chip,
              histLoading && s.primaryDisabled,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={s.chipText}>{histLoading ? 'Recomputing…' : '⚡ Recompute'}</Text>
          </Pressable>
        </View>

        <View style={s.walletRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.walletLabel, { color: ORANGE }]}>$Skill (promo)</Text>
            <Text style={s.walletValue}>{colorize(skillCents, ORANGE)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.walletLabel, { color: GREEN }]}>$Dollars (real)</Text>
            <Text style={s.walletValue}>{colorize(realCents, GREEN)}</Text>
          </View>
        </View>

        <Text style={s.subtle}>
          Positive credits tagged with <Text style={{ color: ORANGE, fontWeight: '900' }}>promo</Text>,{' '}
          <Text style={{ color: ORANGE, fontWeight: '900' }}>bonus</Text>,{' '}
          <Text style={{ color: ORANGE, fontWeight: '900' }}>demo</Text>,{' '}
          <Text style={{ color: ORANGE, fontWeight: '900' }}>signup</Text>,{' '}
          <Text style={{ color: ORANGE, fontWeight: '900' }}>referral</Text> go to $Skill. Everything else is $Dollars.
        </Text>
      </View>

      {/* How payouts work */}
      <View style={s.card}>
        <Text style={s.cardTitle}>How payouts work</Text>
        <View style={{ gap: 6 }}>
          <Text style={s.bullet}>• <Text style={{ color: GREEN, fontWeight: '900' }}>$Dollars</Text> are eligible for payout.</Text>
          <Text style={s.bullet}>• <Text style={{ color: ORANGE, fontWeight: '900' }}>$Skill</Text> are promotional and not eligible for payout.</Text>
          <Text style={s.bullet}>• Debits (spend/join fees) are shown in <Text style={{ color: RED, fontWeight: '900' }}>red</Text>.</Text>
          <Text style={s.bullet}>• Refunds (unjoin/prize reversals) land back in the original wallet color.</Text>
        </View>
      </View>

      {/* Stripe Connect section (kept) */}
      <StripeSection />
    </ScrollView>
  );
}

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
  primaryDisabled: { opacity: 0.6 },

  subtle: { color: '#cfcfcf', fontSize: 13, lineHeight: 18, marginTop: 6 },

  walletRow: { flexDirection: 'row', gap: 16, marginTop: 2, marginBottom: 6 },
  walletLabel: { fontWeight: '900', letterSpacing: 0.2 },
  walletValue: { fontSize: 24, fontWeight: '900', marginTop: 4 },

  bullet: { color: '#eaeaea', fontSize: 13, lineHeight: 18 },
});
