// screens/AdminScreen.tsx — Admin-only (Tabbed: Credits | Events) with email autocomplete
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { toDollars } from '../services/api';
import { auth } from '../services/firebase';

type EventItem = {
  id: string;
  title?: string;
  name?: string;
  feeCents?: number;
  status?: string;
};

const EMAIL_CACHE_KEY = 'bs_known_emails';
const ADMIN_EMAILS = ['admin@ballskill.com', 'test@ballskill.com'];

export default function AdminScreen() {
  const signedInEmail = auth?.currentUser?.email || '';
  const normalizedUser = (signedInEmail || '').trim().toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(normalizedUser);

  // ===== Tab state =====
  const [tab, setTab] = useState<'credits' | 'events'>('credits');

  // ===== Credits state =====
  const [creditEmail, setCreditEmail] = useState<string>(signedInEmail);
  const [balance, setBalance] = useState<number>(0);
  const [delta, setDelta] = useState<string>('0'); // integer string (credits)
  const [history, setHistory] = useState<any[]>([]);
  const [creditBusy, setCreditBusy] = useState<boolean>(false);

  // Autocomplete state
  const [knownEmails, setKnownEmails] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  // ===== Events state =====
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsBusy, setEventsBusy] = useState<boolean>(true);

  // Create form
  const [newTitle, setNewTitle] = useState<string>('Ball Skill – Demo Event');
  const [newFeeCents, setNewFeeCents] = useState<string>('0');

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editFeeCents, setEditFeeCents] = useState<string>('0');
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState<boolean>(false);

  const debTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ===== Guard: admin only =====
  if (!isAdmin) {
    return (
      <View style={[s.root, { padding: 24 }]}>
        <Text style={[s.h1, { marginBottom: 8 }]}>Admin Only</Text>
        <Text style={s.muted}>
          You are signed in as {normalizedUser || 'guest'}. Access to the Admin tab is permitted only to:
        </Text>
        {ADMIN_EMAILS.map((e) => (
          <Text key={e} style={s.historyItem}>• {e}</Text>
        ))}
      </View>
    );
  }

  // ===== Helpers =====
  const friendly = (e: EventItem) => e.title ?? e.name ?? e.id;

  // ===== Known email cache (AsyncStorage) =====
  const loadKnownEmails = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(EMAIL_CACHE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        // seed with signed-in email if not present
        const seed = signedInEmail ? Array.from(new Set([signedInEmail, ...list])) : list;
        setKnownEmails(seed);
        if (seed !== list) {
          await AsyncStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(seed));
        }
      }
    } catch {
      // ignore cache errors
    }
  }, [signedInEmail]);

  const addKnownEmail = useCallback(async (email: string) => {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return;
    try {
      const setList = Array.from(new Set([clean, ...knownEmails])).slice(0, 200);
      setKnownEmails(setList);
      await AsyncStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(setList));
    } catch {
      // ignore
    }
  }, [knownEmails]);

  // Suggestions derive from input
  const suggestions = useMemo(() => {
    const q = (creditEmail || '').trim().toLowerCase();
    if (q.length < 2) return [];
    // Use Firebase-auth emails via allowlist for now; merge with any locally seen emails
    const base = Array.from(new Set([...(ADMIN_EMAILS || []), normalizedUser, ...knownEmails].filter(Boolean)));
    return base.filter((e) => e.toLowerCase().includes(q)).slice(0, 10);
  }, [creditEmail, knownEmails, normalizedUser]);

  // ===== Credits actions =====
  const loadCredits = useCallback(
    async (targetEmail?: string) => {
      const who = (((targetEmail ?? creditEmail) || '') as string).trim();
      if (!who) return;
      setCreditBusy(true);
      try {
        const res = await api.getCredits(who); // { balance }
        const bal = Number(res?.balance ?? 0);
        setBalance(Number.isFinite(bal) ? bal : 0);

        // history: array or {history: []}
        try {
          const hist = await api.history(who);
          const list = Array.isArray(hist?.history)
            ? hist.history
            : Array.isArray(hist)
            ? hist
            : [];
          setHistory(list);
        } catch {
          setHistory([]);
        }
        await addKnownEmail(who);
      } catch (e: any) {
        Alert.alert('Credits error', e?.message ?? String(e));
      } finally {
        setCreditBusy(false);
      }
    },
    [creditEmail, addKnownEmail]
  );

  const applyDelta = useCallback(
    async (sign: 1 | -1) => {
      const who = ((creditEmail || '') as string).trim();
      if (!who) {
        Alert.alert('Email required', 'Enter an email to grant/deduct credits.');
        return;
      }
      const amt = Number.parseInt(delta, 10);
      if (!Number.isFinite(amt)) {
        Alert.alert('Amount invalid', 'Enter a whole number of credits (cents).');
        return;
      }
      setCreditBusy(true);
      try {
        const res = await api.applyCredits(who, sign * amt, `admin:${sign > 0 ? 'grant' : 'deduct'}`);
        const bal = Number(res?.balance ?? 0);
        setBalance(Number.isFinite(bal) ? bal : 0);
        await loadCredits(who);
        await addKnownEmail(who);
      } catch (e: any) {
        Alert.alert('Apply failed', e?.message ?? String(e));
      } finally {
        setCreditBusy(false);
      }
    },
    [creditEmail, delta, loadCredits, addKnownEmail]
  );

  // ===== Events actions =====
  const loadEvents = useCallback(async () => {
    setEventsBusy(true);
    try {
      const list = await api.getEvents();
      setEvents(Array.isArray(list) ? list : []);
    } catch (e: any) {
      Alert.alert('Events error', e?.message ?? String(e));
    } finally {
      setEventsBusy(false);
    }
  }, []);

  const createEvent = useCallback(async () => {
    const title = (newTitle || '').trim();
    const fee = Number.parseInt(newFeeCents || '0', 10);
    if (!title) {
      Alert.alert('Title required', 'Please enter an event title.');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      Alert.alert('Fee invalid', 'Enter fee in credits (cents) as a non-negative integer.');
      return;
    }
    setEventsBusy(true);
    try {
      // keep both title and name for compatibility
      await api.createEvent({
        title,
        name: title,
        feeCents: fee,
        status: 'OPEN',
        isActive: true,
        published: true,
      });
      setNewTitle('Ball Skill – Demo Event');
      setNewFeeCents('0');
      await loadEvents();
    } catch (e: any) {
      Alert.alert('Create failed', e?.message ?? String(e));
    } finally {
      setEventsBusy(false);
    }
  }, [newTitle, newFeeCents, loadEvents]);

  const startEdit = useCallback((ev: EventItem) => {
    setEditId(ev.id);
    setEditTitle(ev.title ?? ev.name ?? '');
    setEditFeeCents(String(Number(ev.feeCents ?? 0)));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditId(null);
    setEditTitle('');
    setEditFeeCents('0');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editId) return;
    const patch: any = {};
    const title = (editTitle || '').trim();
    if (title) {
      patch.title = title;
      patch.name = title;
    }
    const cents = Number.parseInt(editFeeCents || '0', 10);
    if (Number.isFinite(cents) && cents >= 0) {
      patch.feeCents = cents;
      patch.priceCents = cents; // in case server uses this field
    }
    setRowBusyId(editId);
    try {
      await api.updateEvent(editId, patch);
      cancelEdit();
      await loadEvents();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message ?? String(e));
    } finally {
      setRowBusyId(null);
    }
  }, [editId, editTitle, editFeeCents, cancelEdit, loadEvents]);

  const removeEvent = useCallback(
    async (id: string) => {
      Alert.alert('Delete event', 'Are you sure you want to delete this event?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRowBusyId(id);
            try {
              await api.deleteEvent(id);
              if (editId === id) cancelEdit();
              await loadEvents();
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message ?? String(e));
            } finally {
              setRowBusyId(null);
            }
          },
        },
      ]);
    },
    [editId, cancelEdit, loadEvents]
  );

  // ===== Effects =====
  useEffect(() => {
    loadKnownEmails();
  }, [loadKnownEmails]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Load credits once on mount for the signed-in user; do not fetch on every keystroke
useEffect(() => {
  const who = (signedInEmail || '').trim();
  if (who) {
    loadCredits(who);
    setCreditEmail(who);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadEvents(),
        loadCredits(((creditEmail || '') as string).trim() || signedInEmail),
      ]);
    } finally {
      setRefreshing(false);
    }
    // Note: intentionally exclude loadCredits from deps to avoid effect loops
  }, [loadEvents, creditEmail, signedInEmail]);

  // ===== Render helpers =====
  const TabHeader = () => (
    <View style={s.tabs}>
      <TouchableOpacity onPress={() => setTab('credits')} style={[s.tab, tab === 'credits' && s.tabActive]}>
        <Text style={[s.tabText, tab === 'credits' && s.tabTextActive]}>Credits</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setTab('events')} style={[s.tab, tab === 'events' && s.tabActive]}>
        <Text style={[s.tabText, tab === 'events' && s.tabTextActive]}>Events</Text>
      </TouchableOpacity>
    </View>
  );

  const EmailInput = () => (
    <View style={{ zIndex: 10 }}>
      <Text style={s.label}>User email</Text>
      <TextInput
        placeholder="email@example.com"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
        inputMode="email"
        blurOnSubmit={false}
        autoCorrect={false}
        value={creditEmail}
        onChangeText={(t) => {
          setCreditEmail(t);
          setShowSuggestions(true);
        
          // debounce fetch from server for autocomplete
          if (debTimerRef.current) clearTimeout(debTimerRef.current);
          const trimmed = t.trim();
          if (trimmed.length >= 2) {
            debTimerRef.current = setTimeout(async () => {
              try {
                const { emails } = await api.searchUsers(trimmed, 8);
                if (Array.isArray(emails) && emails.length) {
                  const merged = Array.from(new Set([...(emails || []), ...knownEmails]));
                  setKnownEmails(merged);
                }
              } catch {
                // ignore autocomplete errors
              }
            }, 200);
          }
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} // allow tap
        style={s.input}
      />
      {showSuggestions && suggestions.length > 0 && (
        <View style={s.suggestBox}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {suggestions.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={async () => {
                  setCreditEmail(item);
                  setShowSuggestions(false);
                  await loadCredits(item); // fetch after picking a suggestion
                  Keyboard.dismiss();
                }}
                style={s.suggestItem}
              >
                <Text style={s.suggestText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const CreditsPanel = () => (
    <View style={s.section}>
      <Text style={s.h1}>Credits</Text>
      <EmailInput />
      <View style={s.row}>
        <TouchableOpacity onPress={() => loadCredits()} style={[s.btn, s.btnSecondary]} disabled={creditBusy}>
          {creditBusy ? <ActivityIndicator /> : <Text style={s.btnText}>Refresh Balance</Text>}
        </TouchableOpacity>
        <View style={s.balancePill}>
          <Text style={s.balanceText}>Balance: {balance} credits</Text>
          <Text style={s.balanceSub}>(${toDollars(balance)})</Text>
        </View>
      </View>
      <View style={[s.row, { marginTop: 8 }]}>
        <TextInput
          placeholder="amount (credits)"
          placeholderTextColor="#888"
          keyboardType="numeric"
          inputMode="numeric"
          blurOnSubmit={false}
          value={delta}
          onChangeText={setDelta}
          style={[s.input, { flex: 1 }]}
        />
        <TouchableOpacity onPress={() => applyDelta(1)} style={[s.btn, s.btnPrimary, { marginLeft: 8 }]} disabled={creditBusy}>
          <Text style={s.btnText}>Grant</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => applyDelta(-1)} style={[s.btn, s.btnDanger, { marginLeft: 8 }]} disabled={creditBusy}>
          <Text style={s.btnText}>Deduct</Text>
        </TouchableOpacity>
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={s.subH}>Recent Wallet History</Text>
        {!history.length && <Text style={s.muted}>No history.</Text>}
        {!!history.length && (
          <View style={s.historyBox}>
            <ScrollView>
              {history.map((h, idx) => (
                <Text key={idx} style={s.historyItem}>
                  {new Date(h?.at ?? Date.now()).toLocaleString()} — {h?.delta ?? 0} ({h?.reason ?? ''})
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );

  const EventsPanel = () => (
    <View style={s.section}>
      <Text style={s.h1}>Events</Text>

      {/* Create new */}
      <Text style={s.label}>Title</Text>
      <TextInput
        placeholder="Event title"
        placeholderTextColor="#888"
        value={newTitle}
        onChangeText={setNewTitle}
        style={s.input}
      />
      <Text style={s.label}>Fee (credits, cents)</Text>
      <TextInput
        placeholder="e.g. 500"
        placeholderTextColor="#888"
        keyboardType="numeric"
        blurOnSubmit={false}
        value={newFeeCents}
        onChangeText={setNewFeeCents}
        style={s.input}
      />
      <TouchableOpacity onPress={createEvent} style={[s.btn, s.btnPrimary]} disabled={eventsBusy}>
        {eventsBusy ? <ActivityIndicator /> : <Text style={s.btnText}>Create Event</Text>}
      </TouchableOpacity>

      {/* List / edit / delete */}
      <View style={{ marginTop: 14 }}>
        {eventsBusy && <Text style={s.muted}>Loading events…</Text>}
        {!eventsBusy && !events.length && <Text style={s.muted}>No events found.</Text>}

        {events.map((e) => {
          const editing = editId === e.id;
          const busy = rowBusyId === e.id;
          if (editing) {
            return (
              <View key={String(e.id)} style={s.card}>
                <Text style={s.cardTitle}>Editing: {friendly(e)}</Text>
                <Text style={s.cardMeta}>id: {String(e.id)}</Text>
                <Text style={s.label}>Title</Text>
                <TextInput
                  placeholder="Title"
                  placeholderTextColor="#888"
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={s.input}
                />
                <Text style={s.label}>Fee (credits, cents)</Text>
                <TextInput
                  placeholder="e.g. 500"
                  placeholderTextColor="#888"
                  keyboardType="numeric"
                  blurOnSubmit={false}
                  value={editFeeCents}
                  onChangeText={setEditFeeCents}
                  style={s.input}
                />
                <View style={s.row}>
                  <TouchableOpacity onPress={saveEdit} style={[s.btn, s.btnPrimary]} disabled={busy}>
                    {busy ? <ActivityIndicator /> : <Text style={s.btnText}>Save</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={cancelEdit} style={[s.btn, s.btnSecondary, { marginLeft: 8 }]} disabled={busy}>
                    <Text style={s.btnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          return (
            <View key={String(e.id)} style={s.card}>
              <Text style={s.cardTitle}>{friendly(e)}</Text>
              <Text style={s.cardMeta}>id: {String(e.id)}</Text>
              <Text style={s.cardMeta}>
                feeCents: {Number(e.feeCents ?? 0)} (${toDollars(e.feeCents ?? 0)})
              </Text>
              <View style={s.row}>
                <TouchableOpacity onPress={() => startEdit(e)} style={[s.btn, s.btnSecondary]}>
                  <Text style={s.btnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeEvent(e.id)} style={[s.btn, s.btnDanger, { marginLeft: 8 }]}>
                  <Text style={s.btnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {!eventsBusy && (
          <TouchableOpacity onPress={loadEvents} style={[s.btn, s.btnSecondary, { marginTop: 10 }]}>
            <Text style={s.btnText}>Refresh Events</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ===== Render =====
  return (
    <ScrollView style={s.root} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <TabHeader />
      {tab === 'credits' ? <CreditsPanel /> : <EventsPanel />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  tabs: { flexDirection: 'row', padding: 8, gap: 8, borderBottomColor: '#1b1b1b', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#121212' },
  tabActive: { backgroundColor: '#1e90ff22', borderColor: '#1e90ff55', borderWidth: 1 },
  tabText: { color: '#bbb', fontWeight: '700' },
  tabTextActive: { color: '#fff' },

  section: { padding: 16, borderBottomColor: '#1b1b1b', borderBottomWidth: 1 },
  h1: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  label: { color: '#bbb', marginTop: 6, marginBottom: 6 },
  input: {
    backgroundColor: '#0f0f0f',
    color: '#fff',
    borderColor: '#1f1f1f',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  btnPrimary: { backgroundColor: '#1e90ff' },
  btnSecondary: { backgroundColor: '#2f2f2f' },
  btnDanger: { backgroundColor: '#ff4d4f' },
  balancePill: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#121212',
    borderRadius: 10,
    borderColor: '#1f1f1f',
    borderWidth: 1,
  },
  balanceText: { color: '#fff', fontWeight: '800' },
  balanceSub: { color: '#9a9a9a', fontSize: 12 },
  subH: { color: '#ddd', fontWeight: '700', marginBottom: 6 },
  historyItem: { color: '#aaa', fontSize: 12, marginBottom: 4 },
  muted: { color: '#999' },
  card: { backgroundColor: '#0e0e0e', borderColor: '#1f1f1f', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  cardTitle: { color: '#fff', fontWeight: '800' },
  cardMeta: { color: '#bbb', fontSize: 12, marginTop: 4 },

  // autocomplete
  suggestBox: {
    position: 'absolute',
    top: 74,
    left: 0,
    right: 0,
    backgroundColor: '#0f0f0f',
    borderColor: '#1f1f1f',
    borderWidth: 1,
    borderRadius: 10,
    maxHeight: 180,
    zIndex: 100,
    overflow: 'hidden',
  },
  suggestItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomColor: '#1a1a1a', borderBottomWidth: 1 },
  suggestText: { color: '#ddd' },
  historyBox: {
    maxHeight: 220,
    borderColor: '#1f1f1f',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});