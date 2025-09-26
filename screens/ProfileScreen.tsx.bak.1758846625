import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import { getBalance, getUserJoins } from '../services/api';
import IdChip from '../components/IdChip';

export default function ProfileScreen() {
  const { user } = useAuth();
  const email = (user?.email || '').toLowerCase();
  const hasEmail = !!(user && !user.isAnonymous && user.email);

  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [joins, setJoins] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!hasEmail) {
      setBalance(null);
      setJoins([]);
      return;
    }
    setLoading(true);
    try {
      const [b, j] = await Promise.all([
        getBalance(email).catch(() => null),
        getUserJoins(email).then(r => Array.isArray(r.joins) ? r.joins : []).catch(() => []),
      ]);
      setBalance(b);
      setJoins(j);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [email, hasEmail]);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ORANGE} />}
    >
      <Text style={s.h1}>Profile</Text>
      <Text style={s.sub}>
        {hasEmail ? `Signed in as ${email}` : 'Signed out — sign in to join events and manage balance.'}
      </Text>

      {/* Balance Card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Balance</Text>
        <View style={s.balanceRow}>
          <Text style={s.balanceText}>
            {balance == null ? '—' : `$${balance}`}
          </Text>
          <Pressable onPress={load} style={({ pressed }) => [s.refreshBtn, pressed && { opacity: 0.9 }]}>
            <Text style={s.refreshText}>Refresh</Text>
          </Pressable>
        </View>
        {!hasEmail && <Text style={s.hint}>Sign in to see your balance.</Text>}
      </View>

      {/* Joined Events */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Joined Events</Text>
        {loading ? (
          <View style={s.loadingRow}><ActivityIndicator color={colors.ORANGE} /></View>
        ) : !hasEmail ? (
          <Text style={s.hint}>Sign in to view your joined events.</Text>
        ) : joins.length === 0 ? (
          <Text style={s.hint}>You haven’t joined any events yet.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {joins.map(id => (
              <View key={id} style={s.joinRow}>
                <IdChip id={id} />
                <Text style={s.joinNote}>Joined</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS },
  content: { padding: 16, paddingBottom: 24 },
  h1: { color: colors.TEXT, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.MUTED_TEXT, marginTop: 4, marginBottom: 14 },

  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: colors.TEXT, fontWeight: '800', fontSize: 16, marginBottom: 8 },

  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceText: { color: colors.TEXT, fontSize: 28, fontWeight: '900' },
  refreshBtn: {
    backgroundColor: colors.ORANGE, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  refreshText: { color: colors.WHITE, fontWeight: '800' },
  hint: { color: colors.MUTED_TEXT },

  loadingRow: { paddingVertical: 8, alignItems: 'center' },
  joinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  joinNote: { color: colors.MUTED_TEXT, fontSize: 12 },
});
