// components/TransactionList.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import colors from '../theme/colors';

type Wallet = 'skill' | 'dollars';

type Tx = {
  id: string;
  ts: number;
  email: string;
  delta: number;                 // signed cents
  wallet: Wallet;
  note?: string | null;
  balanceAfter?: number;         // combined cents
  walletBalanceAfter: number;    // wallet-specific cents
  actor?: string | null;         // admin/system (omitted in user feed)
  meta?: any;
};

type Variant = 'user' | 'admin';

type Props = {
  variant: Variant;
  email?: string;                // required for variant='user'
  pageSize?: number;
  style?: any;
  onReversed?: (id: string) => void; // admin only
  embedded?: boolean;            // when true, disable inner scrolling (use inside outer ScrollView)
};

const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');
const API = `${SERVER}/api`;

function cents(c: number) {
  const sgn = c < 0 ? '-' : '+';
  const v = Math.abs(c) / 100;
  return `${sgn}$${v.toFixed(2)}`;
}
function money(c: number) {
  const v = Math.abs(c) / 100;
  return `$${v.toFixed(2)}`;
}

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export default function TransactionList({ variant, email, pageSize = 25, style, onReversed, embedded = false }: Props) {
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [offset, setOffset] = useState<number>(0);

  const endpoint = useMemo(() => {
    if (variant === 'user') {
      const em = encodeURIComponent(String(email || '').toLowerCase());
      return `${API}/transactions/${em}`;
    }
    return `${API}/transactions`;
  }, [variant, email]);

  const load = useCallback(
    async (opts?: { reset?: boolean }) => {
      try {
        const reset = !!opts?.reset;
        if (reset) {
          setLoading(true);
          setOffset(0);
        }
        const q = new URLSearchParams({
          limit: String(pageSize),
          offset: String(reset ? 0 : offset),
          sort: 'desc',
        });
        const res = await fetch(`${endpoint}?${q.toString()}`);
        const data = await res.json();
        if (!data?.success) throw new Error('failed');
        const nextItems: Tx[] = reset ? data.items : [...items, ...data.items];
        setItems(nextItems);
        setTotal(Number(data.total || nextItems.length));
        if (reset) setOffset(pageSize);
        else setOffset(offset + pageSize);
      } catch {
        // swallow; UI shows empty state
      } finally {
        if (opts?.reset) setLoading(false);
      }
    },
    [endpoint, pageSize, offset, items]
  );

  useEffect(() => {
    load({ reset: true });
  }, [endpoint]);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load({ reset: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const hasMore = items.length < total;

  const renderItem = ({ item }: { item: Tx }) => {
    const isCredit = item.delta > 0;
    const w = item.wallet;
    const walletFg = '#000';
    const walletBg = w === 'skill' ? '#FFB84D' : '#7DFF70';
    const amtColor = isCredit ? '#7DFF70' : '#FF6B6B';
    const when = new Date(item.ts).toLocaleString();

    return (
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={[s.amt, { color: amtColor }]}>{cents(item.delta)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Pill text={w === 'skill' ? '$Skill' : '$Dollars'} bg={walletBg} fg={walletFg} />
            {!!item.note && (
              <Text style={s.note} numberOfLines={1}>
                {String(item.note)}
              </Text>
            )}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.when}>{when}</Text>
          <Text style={s.after}>after: {money(item.walletBalanceAfter)}</Text>
          {typeof item.balanceAfter === 'number' && (
            <Text style={s.afterSub}>combined: {money(item.balanceAfter)}</Text>
          )}
        </View>

        {variant === 'admin' && (
          <View style={s.adminExtras}>
            <Text style={s.metaSmall}>user: {item.email}</Text>
            {!!item.actor && <Text style={s.metaSmall}>by: {item.actor}</Text>}
            <Pressable
              onPress={async () => {
                try {
                  const res = await fetch(
                    `${API}/transactions/${encodeURIComponent(item.id)}/reverse`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        actor: 'admin@ballskill.com',
                        note: 'manual reversal',
                      }),
                    }
                  );
                  const data = await res.json();
                  if (!data?.success) throw new Error(data?.error || 'reverse failed');
                  if (onReversed) onReversed(item.id);
                  await refresh();
                } catch {
                  // noop
                }
              }}
              style={({ pressed }) => [s.reverseBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={s.reverseText}>Reverse</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  // When embedded inside a ScrollView, render as plain views (no VirtualizedList)
  const renderRow = (it: Tx, idx: number) => {
    return (renderItem as any)({ item: it, index: idx });
  };

  if (loading) {
    return (
      <View style={[s.box, style]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={[s.box, style]}>
        <Text style={s.empty}>No transactions yet.</Text>
      </View>
    );
  }

  if (embedded) {
    return (
      <View style={[s.box, style]}>
        {/* Top-right refresh button to replace pull-to-refresh when embedded */}
        <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
          <Pressable
            onPress={refresh}
            hitSlop={8}
            style={({ pressed }) => [
              { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700' }}>Refresh</Text>
            )}
          </Pressable>
        </View>

        {items.map((it, idx) => (
          <View key={it.id || String(idx)}>{renderRow(it, idx)}</View>
        ))}

        {hasMore ? (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Pressable onPress={() => load()} style={({ pressed }) => [s.moreBtn, pressed && { opacity: 0.9 }]}>
              <Text style={s.moreText}>Load more</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  // Default (non-embedded) path keeps virtualization
  return (
    <FlatList
      contentContainerStyle={[s.box, style]}
      data={items}
      keyExtractor={(it) => it.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      initialNumToRender={12}
      windowSize={11}
      removeClippedSubviews
      ListFooterComponent={() =>
        hasMore ? (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Pressable onPress={() => load()} style={({ pressed }) => [s.moreBtn, pressed && { opacity: 0.9 }]}>
              <Text style={s.moreText}>Load more</Text>
            </Pressable>
          </View>
        ) : null
      }
    />
  );
}

const s = StyleSheet.create({
  box: { paddingHorizontal: 12, paddingVertical: 8 },
  row: {
    backgroundColor: '#111',
    borderColor: '#292929',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  amt: { fontSize: 18, fontWeight: '900' },
  note: { color: '#cfcfcf', fontSize: 12, flexShrink: 1, maxWidth: 180 },
  when: { color: '#eaeaea', fontSize: 12 },
  after: { color: '#cfcfcf', fontSize: 12, marginTop: 2, fontWeight: '800' },
  afterSub: { color: '#9a9a9a', fontSize: 11, marginTop: 2 },
  pill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#1b1b1e',
  },
  pillText: { fontWeight: '900', fontSize: 11 },
  empty: { color: '#9a9a9a' },
  moreBtn: {
    backgroundColor: '#1b1b1e',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  moreText: { color: '#fff', fontWeight: '800' },

  // admin extras
  adminExtras: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    paddingTop: 8,
  },
  metaSmall: { color: '#9a9a9a', fontSize: 11, marginTop: 2 },
  reverseBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#444',
  },
  reverseText: { color: '#FF6B6B', fontWeight: '900', fontSize: 12 },
});