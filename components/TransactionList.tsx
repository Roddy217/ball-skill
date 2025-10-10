// components/TransactionList.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    Pressable,
    TextInput,
    ScrollView,
    Linking,
  } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
  showFilters?: boolean;         // show wallet/search filters (optional)
  embeddedMaxHeight?: number;    // max height for embedded scroll (default 420)
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

// --- CSV helpers ---
function csvEscape(v: any) {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
  function toIso(ts: number) {
    try { return new Date(Number(ts)).toISOString(); } catch { return ''; }
  }
  function txToCsvRow(t: Tx) {
    // header: ts_iso, email, wallet, delta_cents, delta_display, note, walletAfter_cents, combinedAfter_cents, id, actor
    return [
      toIso(t.ts),
      t.email || '',
      t.wallet || '',
      String(t.delta ?? ''),
      cents(t.delta ?? 0),
      (t.note ?? '').toString(),
      String(t.walletBalanceAfter ?? ''),
      String(typeof t.balanceAfter === 'number' ? t.balanceAfter : ''),
      t.id || '',
      t.actor || '',
    ].map(csvEscape).join(',');
  }
  function buildCsv(rows: Tx[]) {
    const header = [
      'ts_iso','email','wallet','delta_cents','delta_display','note',
      'walletAfter_cents','combinedAfter_cents','id','actor'
    ].join(',');
    return [header, ...rows.map(txToCsvRow)].join('\n');
  }

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg, borderColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export default function TransactionList({
  email,
  variant = 'user',
  pageSize = 50,
  embedded = false,
  showFilters = true,
  style,
  onReversed,
  embeddedMaxHeight = 420,
}: Props) {

  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [offset, setOffset] = useState<number>(0);

  // ----- Filters (client-side) -----
  const [walletFilter, setWalletFilter] = useState<'all'|'skill'|'dollars'>('all');
  const [q, setQ] = useState('');

  // date window: all | 7d | 30d | 90d
const [dateRange, setDateRange] = useState<'all'|'7d'|'30d'|'90d'>('all');
const sinceMs = useMemo(() => {
  const now = Date.now();
  switch (dateRange) {
    case '7d':  return now - 7  * 24 * 60 * 60 * 1000;
    case '30d': return now - 30 * 24 * 60 * 60 * 1000;
    case '90d': return now - 90 * 24 * 60 * 60 * 1000;
    default:    return 0; // 'all'
  }
}, [dateRange]);

  // simple debounce for search input
  const qRef = useRef<any>();
  const [qLive, setQLive] = useState('');
  useEffect(() => {
    if (qRef.current) clearTimeout(qRef.current);
    qRef.current = setTimeout(() => setQLive(q), 300);
    return () => { if (qRef.current) clearTimeout(qRef.current); };
  }, [q]);

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
        // pass filters to the server if present
        if (walletFilter !== 'all') q.set('wallet', walletFilter);
        if (qLive.trim()) q.set('q', qLive.trim());
        // date range to server
        if (sinceMs) {
            q.set('since', String(sinceMs));
            q.set('until', String(Date.now()));
        }
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
    [endpoint, pageSize, offset, items, walletFilter, qLive, sinceMs]
  );

    // Fetch all pages using current filters to export
    const fetchAllForExport = useCallback(async (): Promise<Tx[]> => {
        let acc: Tx[] = [];
        let off = 0;
        const step = Math.max(1, Math.min(pageSize, 500)); // respect pageSize; cap 500
        for (let guard = 0; guard < 100; guard++) { // safety cap
        const qs = new URLSearchParams({
            limit: String(step),
            offset: String(off),
            sort: 'desc',
        });
        if (walletFilter !== 'all') qs.set('wallet', walletFilter);
        if (qLive.trim()) qs.set('q', qLive.trim());
        if (sinceMs) {
            qs.set('since', String(sinceMs));
            qs.set('until', String(Date.now()));
        }
        const res = await fetch(`${endpoint}?${qs.toString()}`);
        const data = await res.json();
        if (!data?.success) break;
        const page: Tx[] = data.items || [];
        acc = acc.concat(page);
        off += step;
        if (!page.length || acc.length >= Number(data.total || 0)) break;
        }
        return acc;
    }, [endpoint, pageSize, walletFilter, qLive, sinceMs]);
    
    const [exporting, setExporting] = useState(false);
    
    const onExportCsv = useCallback(async () => {
        try {
        setExporting(true);
        // Prefer server-side filtered export of ALL rows matching current view
        const rows = await fetchAllForExport();
        const csv = buildCsv(rows);
        // Try email compose via mailto:
        const subject = 'Ball Skill — Transactions Export';
        const body = encodeURIComponent(csv);
        const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
        const can = await Linking.canOpenURL(mailto);
        if (can) {
            await Linking.openURL(mailto);
            return;
        }
        // Fallback: copy to clipboard
        await Clipboard.setStringAsync(csv);
        // Optionally: toast/snackbar; for now, a no-op
        } catch (e) {
        // swallow
        } finally {
        setExporting(false);
        }
    }, [fetchAllForExport]);
    
    const onCopyCsv = useCallback(async () => {
        try {
        setExporting(true);
        const rows = await fetchAllForExport();
        const csv = buildCsv(rows);
        await Clipboard.setStringAsync(csv);
        } catch (e) {
        // noop
        } finally {
        setExporting(false);
        }
    }, [fetchAllForExport]);

  useEffect(() => {
    load({ reset: true });
  }, [endpoint, walletFilter, qLive, sinceMs]);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load({ reset: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const hasMore = items.length < total;

  // Derive filtered items for wallet + query
  const filtered = useMemo(() => {
    let a = items;
    if (sinceMs) {
        a = a.filter(it => Number(it.ts || 0) >= sinceMs && Number(it.ts || 0) < Date.now());
      }
    if (walletFilter !== 'all') {
      a = a.filter(it => (it.wallet || '').toLowerCase() === walletFilter);
    }
    if (qLive.trim()) {
      const needle = qLive.trim().toLowerCase();
      a = a.filter(it => {
        const note = String(it.note || '').toLowerCase();
        const emailStr = String(it.email || '').toLowerCase();
        const idStr = String(it.id || '').toLowerCase();
        return note.includes(needle) || emailStr.includes(needle) || idStr.includes(needle);
      });
    }
    return a;
  }, [items, walletFilter, qLive]);

  // Reusable filters UI block
  const filtersUI = showFilters ? (
    <View style={{ marginBottom: 8 }}>
      {/* wallet chips */}
      <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap', marginBottom: 8 }}>
        {([
          {k:'all', label:'All'},
          {k:'skill', label:'Skill'},
          {k:'dollars', label:'Dollars'}
        ] as const).map(opt => {
          const active = walletFilter === opt.k;
          return (
            <Pressable
              key={opt.k}
              onPress={() => setWalletFilter(opt.k)}
              style={({pressed}) => [
                { borderWidth:1, borderRadius:999, paddingVertical:6, paddingHorizontal:10, borderColor:'#2a2a2a', backgroundColor:'#0b0b0b' },
                active && { backgroundColor:'#FF6600', borderColor:'#FF6600' },
                pressed && { opacity: 0.85 }
              ]}
            >
              <Text style={{ color: active ? '#000' : '#fff', fontWeight:'800', fontSize:12 }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* date-range chips */}
    <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap', marginBottom: 8 }}>
    {([
        {k:'all', label:'All'},
        {k:'7d', label:'Last 7 days'},
        {k:'30d', label:'Last 30 days'},
        {k:'90d', label:'Last 90 days'},
    ] as const).map(opt => {
        const active = dateRange === opt.k;
        return (
        <Pressable
            key={opt.k}
            onPress={() => setDateRange(opt.k)}
            style={({pressed}) => [
            { borderWidth:1, borderRadius:999, paddingVertical:6, paddingHorizontal:10, borderColor:'#2a2a2a', backgroundColor:'#0b0b0b' },
            active && { backgroundColor:'#FF6600', borderColor:'#FF6600' },
            pressed && { opacity: 0.85 }
            ]}
        >
            <Text style={{ color: active ? '#000' : '#fff', fontWeight:'800', fontSize:12 }}>{opt.label}</Text>
        </Pressable>
        );
    })}
    </View>
      {/* search input */}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={variant === 'admin' ? 'Search note / email / tx id' : 'Search note / id'}
        placeholderTextColor="#777"
        style={{ color:'#fff', borderColor:'#1e1e1e', borderWidth:1, borderRadius:8, paddingHorizontal:12, paddingVertical:8 }}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {q.length > 0 && (
        <View style={{ marginTop: 6, alignItems: 'flex-end' }}>
          <Pressable
            onPress={() => setQ('')}
            hitSlop={8}
            style={({ pressed }) => [
              { borderWidth: 1, borderColor: '#444', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#0b0b0b' },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Clear</Text>
          </Pressable>
        </View>
      )}
    </View>
  ) : null;

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


  if (embedded) {
    return (
      <View style={[s.box, style]}>
        <View style={{ maxHeight: embeddedMaxHeight, borderRadius: 12, overflow: 'hidden' }}>
          <ScrollView
            stickyHeaderIndices={[0]}
            contentContainerStyle={{ paddingBottom: 12 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
          >
            {/* Sticky header: only filters so it stays compact */}
            <View style={{ backgroundColor: '#0b0b0b' }}>
              {filtersUI}
            </View>

            {/* Body */}
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ color: '#9a9a9a' }}>
                  {items.length ? 'No matches for current filters.' : 'No transactions yet.'}
                </Text>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 0 }}>
                {filtered.map((it, idx) => (
                  <View key={it.id || String(idx)}>{renderRow(it, idx)}</View>
                ))}

                {hasMore ? (
                  <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Pressable onPress={() => load()} style={({ pressed }) => [s.moreBtn, pressed && { opacity: 0.9 }] }>
                      <Text style={s.moreText}>Load more</Text>
                    </Pressable>
                  </View>
                ) : null}
                {/* Non-sticky footer actions (won't block rows) */}
                <View style={{ paddingTop: 8, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  {variant === 'admin' && (
                    <>
                      <Pressable
                        onPress={onCopyCsv}
                        disabled={exporting}
                        hitSlop={8}
                        style={({ pressed }) => [
                          { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#0b0b0b' },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          {exporting ? 'Copying…' : 'Copy CSV'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={onExportCsv}
                        disabled={exporting}
                        hitSlop={8}
                        style={({ pressed }) => [
                          { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#0b0b0b' },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          {exporting ? 'Exporting…' : 'Export CSV'}
                        </Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable
                    onPress={refresh}
                    hitSlop={8}
                    style={({ pressed }) => [
                      { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {refreshing ? (
                      <ActivityIndicator color="#fff" />)
                      : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Refresh</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  // Default (non-embedded) path keeps virtualization
  return (
    <FlatList
      contentContainerStyle={[s.box, style]}
      ListHeaderComponent={() => (
        <View>
          {filtersUI}
        </View>
      )}
      stickyHeaderIndices={[0]}
      data={filtered}
      keyExtractor={(it) => it.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#fff" />}
      initialNumToRender={12}
      windowSize={11}
      removeClippedSubviews
      ListFooterComponent={() => (
        <View style={{ paddingVertical: 12 }}>
          {hasMore ? (
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <Pressable onPress={() => load()} style={({ pressed }) => [s.moreBtn, pressed && { opacity: 0.9 }]}>
                <Text style={s.moreText}>Load more</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            {variant === 'admin' && (
              <>
                <Pressable
                  onPress={onCopyCsv}
                  disabled={exporting}
                  hitSlop={8}
                  style={({ pressed }) => [
                    { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#0b0b0b' },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {exporting ? 'Copying…' : 'Copy CSV'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onExportCsv}
                  disabled={exporting}
                  hitSlop={8}
                  style={({ pressed }) => [
                    { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#0b0b0b' },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {exporting ? 'Exporting…' : 'Export CSV'}
                  </Text>
                </Pressable>
              </>
            )}
            <Pressable
              onPress={refresh}
              hitSlop={8}
              style={({ pressed }) => [
                { borderColor: '#444', borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {refreshing ? (
                <ActivityIndicator color="#fff" />)
                : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Refresh</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
      ListEmptyComponent={() => (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ color: '#9a9a9a' }}>No matches for current filters.</Text>
        </View>
      )}
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