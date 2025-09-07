import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Keyboard, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Alert } from 'react-native';
import colors from '../../theme/colors';
import { searchUsersByEmailPrefix } from '../../services/firestore';
import { applyCredits, getBalance, getCreditsHistory } from '../../services/api';

type Chip = { email: string };
type SortFilter = 'NEWEST' | 'OLDEST' | 'POS' | 'NEG';

export default function AdminCredits() {
  const [email, setEmail] = useState('');
  const emailLc = useMemo(() => email.trim().toLowerCase(), [email]);

  const [chips, setChips] = useState<Chip[]>([]);
  const [loadingChips, setLoadingChips] = useState(false);

  const [amount, setAmount] = useState<string>('10');
  const [note, setNote] = useState<string>('');

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [history, setHistory] = useState<{ ts: number; delta: number; note?: string | null; balanceAfter: number }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sort, setSort] = useState<SortFilter>('NEWEST');
  const [q, setQ] = useState<string>('');

  const listRef = useRef<FlatList>(null);

  const dismiss = () => Keyboard.dismiss();

  const loadChips = useCallback(async (q: string) => {
    const p = q.trim();
    if (!p) { setChips([]); return; }
    setLoadingChips(true);
    try {
      const res = await searchUsersByEmailPrefix(p.toLowerCase());
      setChips(res);
    } finally {
      setLoadingChips(false);
    }
  }, []);

  useEffect(() => { loadChips(email); }, [email, loadChips]);

  const refreshBalance = useCallback(async () => {
    if (!emailLc) { setBalance(null); return; }
    setLoadingBalance(true);
    try {
      const b = await getBalance(emailLc);
      setBalance(b);
    } finally {
      setLoadingBalance(false);
    }
  }, [emailLc]);

  const refreshHistory = useCallback(async () => {
    if (!emailLc) { setHistory([]); return; }
    setLoadingHistory(true);
    try {
      const h = await getCreditsHistory(emailLc, { q });
      setHistory(h);
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 0);
    } finally {
      setLoadingHistory(false);
    }
  }, [emailLc, q]);

  useEffect(() => { refreshBalance(); refreshHistory(); }, [emailLc, refreshBalance, refreshHistory]);

  const onPick = (e: string) => { setEmail(e); dismiss(); };

  const parsedAmount = useMemo(() => {
    const trimmed = (amount || '').trim();
    if (trimmed === '') return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }, [amount]);

  const doApply = async (delta: number) => {
    if (!emailLc) { Alert.alert('Email required', 'Enter or pick an email first.'); return; }
    if (!Number.isFinite(delta) || delta === 0) { Alert.alert('Amount required', 'Enter a non-zero amount.'); return; }
    const res = await applyCredits(emailLc, delta, note?.trim() || undefined);
    if (!res.success) {
      Alert.alert('Error', res.error || 'Unable to apply credits');
      return;
    }
    setNote('');
    setAmount(String(Math.abs(delta)));
    await Promise.all([refreshBalance(), refreshHistory()]);
  };

  const filtered = useMemo(() => {
    let rows = [...history];
    if (sort === 'OLDEST') rows.reverse();
    if (sort === 'POS') rows = rows.filter(r => r.delta > 0);
    if (sort === 'NEG') rows = rows.filter(r => r.delta < 0);
    return rows;
  }, [history, sort]);

  const renderItem = ({ item }: { item: typeof history[number] }) => {
    const sign = item.delta > 0 ? '+' : '';
    const t = new Date(item.ts).toLocaleString();
    return (
      <View style={s.rowItem}>
        <Text style={[s.delta, item.delta >= 0 ? s.pos : s.neg]}>{sign}{item.delta}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.note} numberOfLines={1}>{item.note || '—'}</Text>
          <Text style={s.sub}>{t}</Text>
        </View>
        <Text style={s.after}>{item.balanceAfter}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={dismiss} accessible={false}>
        <View style={s.container}>
          <Text style={s.h1}>Credits</Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="user@example.com"
            placeholderTextColor={colors.MUTED_TEXT}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="done"
            onSubmitEditing={dismiss}
            style={s.input}
          />

          {/* Chip suggestions */}
          <View style={s.chipsRow}>
            {loadingChips ? (
              <ActivityIndicator />
            ) : chips.map(c => (
              <TouchableOpacity key={c.email} onPress={() => onPick(c.email)} style={s.chip}>
                <Text style={s.chipText}>{c.email}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Balance + actions */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text style={s.label}>Current balance</Text>
                {loadingBalance ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={s.balanceText}>{balance === null ? '—' : `${balance} credits`}</Text>
                )}
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.label}>Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="10"
                  placeholderTextColor={colors.MUTED_TEXT}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={dismiss}
                  style={[s.input, { width: 110, paddingVertical: 8 }]}
                />
              </View>
            </View>

            <Text style={s.label}>Notes</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Reason (e.g., refund, promo, manual adj)"
              placeholderTextColor={colors.MUTED_TEXT}
              returnKeyType="done"
              onSubmitEditing={dismiss}
              style={[s.input, { paddingVertical: 8 }]}
            />

            <View style={s.actionsRow}>
              <Pressable
                onPress={() => doApply(+Math.abs(parsedAmount))}
                style={({ pressed }) => [s.actionBtn, s.grant, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.actionTxt}>Grant +{Math.abs(parsedAmount || 10)}</Text>
              </Pressable>
              <Pressable
                onPress={() => doApply(-Math.abs(parsedAmount))}
                style={({ pressed }) => [s.actionBtn, s.deduct, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.actionTxt}>Deduct −{Math.abs(parsedAmount || 10)}</Text>
              </Pressable>
            </View>
          </View>

          {/* History controls */}
          <View style={s.controls}>
            <View style={s.controlsLeft}>
              <Chip label="Newest" active={sort==='NEWEST'} onPress={()=>setSort('NEWEST')} />
              <Chip label="Oldest" active={sort==='OLDEST'} onPress={()=>setSort('OLDEST')} />
              <Chip label="Credits" active={sort==='POS'} onPress={()=>setSort('POS')} />
              <Chip label="Debits"  active={sort==='NEG'} onPress={()=>setSort('NEG')} />
            </View>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="filter notes"
              placeholderTextColor={colors.MUTED_TEXT}
              returnKeyType="search"
              onSubmitEditing={refreshHistory}
              style={[s.input, { width: 160, paddingVertical: 6 }]}
            />
          </View>

          {/* History panel */}
          <View style={s.historyBox}>
            {loadingHistory ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                ref={listRef}
                data={filtered}
                keyExtractor={(it, idx) => String(it.ts) + ':' + idx}
                renderItem={renderItem}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                contentContainerStyle={{ paddingVertical: 10 }}
                onRefresh={refreshHistory}
                refreshing={loadingHistory}
              />
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cs.chip, active && cs.active, pressed && { opacity: 0.9 }]}>
      <Text style={[cs.txt, active && cs.txtActive]}>{label}</Text>
    </Pressable>
  );
}

const cs = StyleSheet.create({
  chip: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  active: { backgroundColor: colors.ORANGE, borderColor: colors.ORANGE },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
  txtActive: { color: colors.WHITE },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16, gap: 12 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  label: { color: colors.MUTED_TEXT, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.SURFACE, color: colors.TEXT,
    borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
  chip: {
    backgroundColor: '#1b1b1e',
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  chipText: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },

  card: {
    marginTop: 10,
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  balanceText: { color: colors.TEXT, fontSize: 20, fontWeight: '800' },

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  grant: { backgroundColor: '#3DDC84' },
  deduct: { backgroundColor: '#ff6b6b' },
  actionTxt: { color: colors.WHITE, fontWeight: '900', fontSize: 15, letterSpacing: 0.2 },

  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  controlsLeft: { flexDirection: 'row', alignItems: 'center' },

  historyBox: {
    marginTop: 8,
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    maxHeight: 300,
    minHeight: 160,
    paddingHorizontal: 10,
  },

  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  delta: { width: 60, textAlign: 'right', fontWeight: '900' },
  pos: { color: '#3DDC84' },
  neg: { color: '#ff6b6b' },
  note: { color: colors.TEXT, fontSize: 13, fontWeight: '600' },
  sub: { color: colors.MUTED_TEXT, fontSize: 11 },
  after: { color: colors.MUTED_TEXT, width: 60, textAlign: 'right', fontWeight: '800' },
});
