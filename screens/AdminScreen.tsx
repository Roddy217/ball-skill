import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Pressable,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Switch
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import AutoEmail from '../components/AutoEmail';
import AutoEventId from '../components/AutoEventId';
import { useAuth } from '../providers/AuthProvider';
import * as bank from '../services/balanceService';
import { addEmail } from '../services/emailStore';

const ORANGE = '#FF6600', CARD = '#111', BORDER = '#2a2a2a', MUTED = '#9a9a9a', GREEN = '#16a34a', RED = '#ef4444';
const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/,'');
const API = `${SERVER}/api`;

type EventRow = {
  id: string;
  name?: string;
  dateISO?: string;
  locationType?: string;
  feeCents?: number;
  drillsEnabled?: string[];
};
type HistRow = { ts: number; delta: number; note?: string | null; balanceAfter: number };

function toDollars(cents: number) {
  const n = Number(cents || 0);
  return `${(n / 100).toFixed(2)}`;
}
const fmtDelta = (n: number) => `${n >= 0 ? '+' : ''}${toDollars(n)}`;
// Tag routing helpers: decide wallet color and badge based on note
const isSkillTag = (note?: string | null) => /(^|\s)(promo|bonus|demo|skill\s*wallet|signup|referral)(\s|$)/i.test(String(note || ''));
const badgeFor = (delta: number, note?: string | null) => {
  if (delta < 0) return ''; // debits don't carry a wallet badge
  return isSkillTag(note) ? '[Skill]' : '[Dollars]';
};
const colorForAmount = (delta: number, note?: string | null) => {
  if (delta < 0) return RED;
  return isSkillTag(note) ? ORANGE : GREEN;
};

async function getJSON<T=any>(path: string) {
  const res = await fetch(`${API}${path}`);
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${path} (HTTP ${res.status})`);
  return data as T;
}
async function postJSON(path: string, body: any, method: 'POST'|'GET' = 'POST') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${path} (HTTP ${res.status})`);
  return data;
}

async function fetchEvents(): Promise<EventRow[]> {
  const data = await getJSON<{ success: boolean; events: EventRow[] }>('/events');
  return (data?.events || []).map(e => ({
    ...e,
    drillsEnabled: Array.isArray(e?.drillsEnabled) ? e.drillsEnabled.map(d => String(d).toUpperCase()) : [],
  }));
}
async function fetchHistory(email: string, q: string, limit = 50): Promise<HistRow[]> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const url = `/credits/${enc}/history?limit=${Math.max(1, Math.min(200, limit))}` + (q ? `&q=${encodeURIComponent(q)}` : '');
  const data = await getJSON<{ success: boolean; history: HistRow[] }>(url);
  return data?.history || [];
}

async function createEvent(ev: any) { return postJSON('/events', ev); }
async function applyCredits(email: string, delta: number, note?: string) {
  return postJSON('/credits/apply', { email: email.trim().toLowerCase(), delta: Number(delta)||0, note: (note || '').trim() || undefined });
}
async function getBalance(email: string): Promise<number> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const data = await getJSON<{ success: boolean; balance: number }>(`/credits/${enc}`);
  return Number(data?.balance || 0);
}
async function submitResult(eventId: string, payload: any) {
  return postJSON(`/events/${encodeURIComponent(eventId.trim())}/submit`, payload);
}

function msFromParts(h: string, m: string, s: string, ms: string) {
  const H = Math.max(0, Number(h)||0);
  const M = Math.max(0, Number(m)||0);
  const S = Math.max(0, Number(s)||0);
  const MS = Math.max(0, Number(ms)||0);
  return (((H * 60 + M) * 60 + S) * 1000) + MS;
}

// ---- Participants API helpers (demo tool) ----
async function fetchEventsListLite(): Promise<Array<{ id: string; name?: string }>> {
  const data = await getJSON<{ success: boolean; events: Array<{ id: string; name?: string }> }>(`/events`);
  return data?.events || [];
}

async function upsertParticipants(
  eventId: string,
  payload: { teen?: number; adult?: number; pro?: number; celebrity?: number; totalSpots?: number; }
) {
  return postJSON(`/events/${encodeURIComponent(eventId)}/participants`, payload);
}

// ---- Direct Wallet Ops helper ----
async function applyDirectToWallet(payload: { email: string; wallet: 'skill' | 'dollars'; delta: number; note?: string }) {
  const email = String(payload.email || '').trim().toLowerCase();
  const encEmail = encodeURIComponent(email);
  const wallet = payload.wallet === 'skill' ? 'skill' : 'dollars';
  const op = payload.delta >= 0 ? 'add' : 'deduct';
  const amount = Math.abs(Number(payload.delta || 0));
  const note = payload.note || `${op} via admin`;

  const res = await fetch(`${API}/credits/${encEmail}/${wallet}/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, note }),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || !data?.success) throw new Error(data?.error || 'wallet_v2 request failed');
  return data as { success: true; email: string; skill: number; dollars: number };
}

const DEFAULT_DRILLS = ['FT','3PT'];

export default function AdminScreen() {
  const { user } = useAuth();
  // --- Admin balance quick chip ---
const [adminBalCents, setAdminBalCents] = useState<number | null>(null);
const [balRefreshing, setBalRefreshing] = useState(false);

const refreshMyBalance = useCallback(async () => {
  try {
    const email = user?.email?.toLowerCase();
    if (!email) {
      Alert.alert('Not signed in', 'Sign in to refresh your balance.');
      return;
    }
    setBalRefreshing(true);
    const cents = await getBalance(email);
    setAdminBalCents(typeof cents === 'number' ? cents : Number(cents) || 0);
  } catch (e: any) {
    Alert.alert('Balance', e?.message || 'Failed to refresh.');
  } finally {
    setBalRefreshing(false);
  }
}, [user?.email]);
  const email = user?.email?.toLowerCase() || '';
  const adminAllowed = email === 'admin@ballskill.com' || email === 'support@ballskill.com';
  if (!adminAllowed) {
    return (
      <View style={{ flex:1, backgroundColor:'#000', padding:16 }}>
        <Text style={{ color:'#fff', fontSize:18, fontWeight:'800' }}>Admins only</Text>
        <Text style={{ color:'#9a9a9a', marginTop:8 }}>
          Sign in as admin@ballskill.com or support@ballskill.com to access this section.
        </Text>
      </View>
    );
  }
  
  // Events cache for dynamic drills
  const [events, setEvents] = useState<EventRow[]>([]);
  const [evLoading, setEvLoading] = useState(false);
  const reloadEvents = useCallback(async () => {
    try {
      setEvLoading(true);
      const list = await fetchEvents();
      setEvents(list);
    } catch {
      // silent
    } finally {
      setEvLoading(false);
    }
  }, []);
  useEffect(() => { reloadEvents(); }, [reloadEvents]);

  // --- Demo: Participant Editor toggle + fields ---
  const [demoParticipantsEnabled, setDemoParticipantsEnabled] = useState(false);
  const [peEventId, setPeEventId] = useState('');
  const [peTeen, setPeTeen] = useState<string>('');
  const [peAdult, setPeAdult] = useState<string>('');
  const [pePro, setPePro] = useState<string>('');
  const [peCeleb, setPeCeleb] = useState<string>('');
  const [peTotalSpots, setPeTotalSpots] = useState<string>('100');
  const [peLoading, setPeLoading] = useState(false);
  const [peEvents, setPeEvents] = useState<Array<{ id: string; name?: string }>>([]);

  // Auto-select first event after loading if none selected
  useEffect(() => {
    if (!peEventId && peEvents.length > 0) {
      setPeEventId(peEvents[0].id);
    }
  }, [peEvents, peEventId]);

  const loadEventsIntoPicker = useCallback(async () => {
    try {
      setPeLoading(true);
      const list = await fetchEventsListLite();
      if (list.length > 0) {
        setPeEvents(list.map((e) => ({ id: e.id, name: e.name })));
        setPeEventId((prev) => prev || list[0].id);
      } else {
        setPeEvents([]);
      }
    } catch (e) {
      console.warn('[Admin][participants] load events failed', e);
    } finally {
      setPeLoading(false);
    }
  }, [peEventId]);
  
  const saveParticipants = useCallback(async () => {
    if (!peEventId) { Alert.alert('Missing', 'Select or paste an Event ID.'); return; }
    try {
      setPeLoading(true);
      const payload = {
        teen: peTeen !== '' ? Math.max(0, Math.floor(Number(peTeen) || 0)) : undefined,
        adult: peAdult !== '' ? Math.max(0, Math.floor(Number(peAdult) || 0)) : undefined,
        pro: pePro !== '' ? Math.max(0, Math.floor(Number(pePro) || 0)) : undefined,
        celebrity: peCeleb !== '' ? Math.max(0, Math.floor(Number(peCeleb) || 0)) : undefined,
        totalSpots: peTotalSpots !== '' ? Math.max(0, Math.floor(Number(peTotalSpots) || 0)) : undefined,
      };
      const res = await upsertParticipants(peEventId, payload);
      if (!res?.success) {
        console.warn('[Admin][participants] save failed', res);
        Alert.alert('Participants', 'Save failed');
      } else {
        Alert.alert('Participants', 'Updated successfully');
      }
    } catch (e) {
      console.warn('[Admin][participants] save error', e);
      Alert.alert('Participants', 'Save error');
    } finally {
      setPeLoading(false);
    }
  }, [peEventId, peTeen, peAdult, pePro, peCeleb, peTotalSpots]);

  // Seed
  const [seedBusy, setSeedBusy] = useState(false);

  // --- Direct Wallet Ops ---
  const [dwEnabled, setDwEnabled] = useState(false);
  const [dwEmail, setDwEmail] = useState('');
  const [dwAmount, setDwAmount] = useState(''); // dollars as string, e.g. "100.00"
  const [dwWallet, setDwWallet] = useState<'skill' | 'dollars'>('skill');
  const [dwMode, setDwMode] = useState<'add' | 'deduct'>('add');
  const [dwNote, setDwNote] = useState('');
  const [dwBusy, setDwBusy] = useState(false);

  const doSeed = useCallback(async () => {
    setSeedBusy(true);
    try {
      const now = Date.now();
      const eventsToMake = [
        { name: '3-Point Challenge', feeCents: 500, drillsEnabled: ['3PT'], locationType: 'in_person', dateISO: new Date(now + 24*3600*1000).toISOString() },
        { name: 'Free Throw Frenzy', feeCents: 300, drillsEnabled: ['FT'],  locationType: 'online',    dateISO: new Date(now + 48*3600*1000).toISOString() },
      ];
      for (const ev of eventsToMake) await createEvent(ev);
      for (const e of ['test@ballskill.com','alice@ballskill.com','bob@ballskill.com']) {
        await applyCredits(e, 2500, 'seed');
      }
      await reloadEvents(); // reflect new events
      await bank.refresh(email, 'admin-apply');
      console.log('[Admin][balance] refreshed after apply');
      Alert.alert('Seed', 'Seeded 2 events + granted $25 to 3 users.');
    } catch (e:any) {
      Alert.alert('Seed failed', String(e?.message || e));
    } finally {
      setSeedBusy(false);
    }
  }, [reloadEvents]);

  const submitDirectWallet = useCallback(async () => {
    const email = (dwEmail || '').trim().toLowerCase();
    if (!email) { Alert.alert('Email required', 'Enter the target user email.'); return; }

    const amt = Number((dwAmount || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) { Alert.alert('Amount required', 'Enter a positive dollar amount.'); return; }

    const cents = Math.round(amt * 100);
    const delta = dwMode === 'add' ? cents : -cents;
    try {
      setDwBusy(true);
      const res = await applyDirectToWallet({ email, wallet: dwWallet, delta, note: dwNote || `${dwMode} via admin` });
      if (!res?.success) {
        Alert.alert('Direct Wallet', `Failed${(res as any)?.error ? `: ${(res as any).error}` : ''}`);
      } else {
        const latest = res as { success: true; email: string; skill: number; dollars: number };
        Alert.alert(
          'Direct Wallet',
          `${dwMode === 'add' ? 'Added' : 'Deducted'} $${amt.toFixed(2)} ${dwMode === 'add' ? 'to' : 'from'} ${dwWallet}.\n\nNow — Skill: $${(latest.skill/100).toFixed(2)} · Dollars: $${(latest.dollars/100).toFixed(2)}`
        );
      }
      // refresh quick balance if we just adjusted the email visible in this panel
      if (gEmail.trim().toLowerCase() === email) {
        const bal = await getBalance(email);
        setGBal(bal);
      }
    } catch (e: any) {
      const msg = e?.message || 'Request error';
      Alert.alert('Direct Wallet', msg);
    } finally {
      setDwBusy(false);
    }
  }, [dwEmail, dwAmount, dwWallet, dwMode, dwNote, gEmail]);

  // Grant/Deduct
  const [gEmail, setGEmail] = useState('test@ballskill.com');
  const [gDelta, setGDelta] = useState('2500'); // cents
  const [gNote, setGNote] = useState('');       // note
  const [gWallet, setGWallet] = useState<'skill'|'dollars'>('dollars');

  const [gBusy, setGBusy] = useState(false);
  const [gBal, setGBal] = useState<number | null>(null);
  const [gBalLoading, setGBalLoading] = useState(false);

  // History
  const [hItems, setHItems] = useState<HistRow[]>([]);
  const [hLoading, setHLoading] = useState(false);
  const [hQ, setHQ] = useState('');
  const [hLimit, setHLimit] = useState('50');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest'>('newest');
  const [signFilter, setSignFilter] = useState<'all' | 'credits' | 'debits'>('all');

  const loadHistory = useCallback(async (email: string, q: string, limitNum: number) => {
    if (!email.trim()) { setHItems([]); return; }
    setHLoading(true);
    try {
      const list = await fetchHistory(email, q, limitNum);
      setHItems(list);
    } catch {
      setHItems([]);
    } finally {
      setHLoading(false);
    }
  }, []);

  // debounce: balance + history when email or filter changes
  useEffect(() => {
    let t: any;
    const limitNum = Math.max(1, Math.min(200, Number(hLimit) || 50));
    if (!gEmail.trim()) { setGBal(null); setHItems([]); return; }
    setGBalLoading(true);
    t = setTimeout(async () => {
      try {
        const bal = await getBalance(gEmail);
        setGBal(bal);
      } finally {
        setGBalLoading(false);
      }
      // history fetch
      loadHistory(gEmail, hQ, limitNum);
    }, 300);
    return () => clearTimeout(t);
  }, [gEmail, hQ, hLimit, loadHistory]);

  // display rows with chips applied
  const displayRows = useMemo(() => {
    let rows = [...hItems];
    if (signFilter === 'credits') rows = rows.filter(r => r.delta > 0);
    if (signFilter === 'debits') rows = rows.filter(r => r.delta < 0);
    if (sortMode === 'oldest') rows = rows.slice().reverse(); // API returns newest first
    return rows;
  }, [hItems, sortMode, signFilter]);

  const gDeltaNum = useMemo(() => Number(gDelta) || 0, [gDelta]);

  const doGrant = useCallback(async () => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email.'); return; }
    const amountCents = Math.abs(Number(gDelta) || 0);
    if (amountCents <= 0) { Alert.alert('Amount required', 'Enter a positive amount in cents.'); return; }
    setGBusy(true);
    try {
      console.log('[Admin][doGrant] START', { email: gEmail, delta: gDelta, note: gNote });

      // 1) apply credits (cents)
      await applyDirectToWallet({ email: gEmail, wallet: gWallet, delta: amountCents,  note: gNote });
      console.log('[Admin][doGrant] applyCredits OK');

      // 2) remember email for autocomplete
      await addEmail(gEmail);

      // 3) refresh centralized cache so Profile/Events can see the new balance
      await bank.refresh(gEmail, 'admin-apply');
      console.log('[Admin][doGrant] bank.refresh DONE');

      // 4) update the inline Admin “Balance:” row
      const bal = await getBalance(gEmail);
      console.log('[Admin][doGrant] getBalance OK', { bal });
      setGBal(bal);

      // 5) if you adjusted your own account, refresh the “My Balance” card too
      if (gEmail.trim().toLowerCase() === (user?.email || '').toLowerCase()) {
        await refreshMyBalance();
      }

      // 6) refresh history immediately
      const limitNum = Math.max(1, Math.min(200, Number(hLimit) || 50));
      await loadHistory(gEmail, hQ, limitNum);

      // auto-clear inputs after success
      setGDelta('');
      setGNote('');

      Alert.alert(
        'Credits',
        `Granted ${fmtDelta(amountCents)} to ${gEmail.trim().toLowerCase()}`
      );
    } catch (e: any) {
      console.log('[Admin][doGrant] ERROR', e);
      Alert.alert('Grant failed', String(e?.message || e));
    } finally {
      setGBusy(false);
      console.log('[Admin][doGrant] END');
    }
  }, [gEmail, gDelta, gNote, gWallet, hLimit, hQ, loadHistory, refreshMyBalance, user?.email]);

  const doDeduct = useCallback(async () => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email.'); return; }
    const amountCents = Math.abs(Number(gDelta) || 0);
    if (amountCents <= 0) { Alert.alert('Amount required', 'Enter a positive amount in cents.'); return; }
    setGBusy(true);
    try {
      console.log('[Admin][doDeduct] START', { email: gEmail, delta: gDelta, note: gNote });
  
      // 1) apply negative credits (cents)
      await applyDirectToWallet({ email: gEmail, wallet: gWallet, delta: -amountCents, note: gNote });
      console.log('[Admin][doDeduct] applyCredits OK');
  
      // 2) remember email for autocomplete
      await addEmail(gEmail);
  
      // 3) refresh centralized cache so Profile/Events can see the new balance
      await bank.refresh(gEmail, 'admin-apply');
      console.log('[Admin][doDeduct] bank.refresh DONE');
  
      // 4) update the inline Admin “Balance:” row
      const bal = await getBalance(gEmail);
      console.log('[Admin][doDeduct] getBalance OK', { bal });
      setGBal(bal);
  
      // 5) if you adjusted your own account, refresh the “My Balance” card too
      if (gEmail.trim().toLowerCase() === (user?.email || '').toLowerCase()) {
        await refreshMyBalance();
      }
  
      // 6) refresh history immediately
      const limitNum = Math.max(1, Math.min(200, Number(hLimit) || 50));
      await loadHistory(gEmail, hQ, limitNum);
  
      // auto-clear inputs after success
      setGDelta('');
      setGNote('');

      Alert.alert(
        'Credits',
        `Deducted ${fmtDelta(-amountCents)} from ${gEmail.trim().toLowerCase()}`
      );
    } catch (e: any) {
      console.log('[Admin][doDeduct] ERROR', e);
      Alert.alert('Deduct failed', String(e?.message || e));
    } finally {
      setGBusy(false);
      console.log('[Admin][doDeduct] END');
    }
  }, [gEmail, gDelta, gNote, gWallet, hLimit, hQ, loadHistory, refreshMyBalance, user?.email]);

  const refreshGBal = useCallback(async () => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email.'); return; }
    setGBalLoading(true);
    try {
      const bal = await getBalance(gEmail);
      setGBal(bal);
    } catch (e: any) {
      Alert.alert('Balance', String(e?.message || 'Failed to refresh.'));
    } finally {
      setGBalLoading(false);
    }
  }, [gEmail]);

  useFocusEffect(
    useCallback(() => {
      if (gEmail.trim()) {
        refreshGBal();
      }
    }, [gEmail, refreshGBal])
  );

  // Submit Result
  const [rEventId, setREventId] = useState('');
  const [rEmail, setREmail] = useState('test@ballskill.com');

  // Dynamic drills
  const [availableDrills, setAvailableDrills] = useState<string[]>(DEFAULT_DRILLS);
  const [rDrill, setRDrill] = useState<string>('FT');
  useEffect(() => {
    if (!rEventId) {
      setAvailableDrills(DEFAULT_DRILLS);
      if (!DEFAULT_DRILLS.includes(rDrill)) setRDrill(DEFAULT_DRILLS[0]);
      return;
    }
    const ev = events.find(e => e.id === rEventId);
    const drills = (ev?.drillsEnabled && ev.drillsEnabled.length) ? ev.drillsEnabled.map(d => String(d).toUpperCase()) : DEFAULT_DRILLS;
    setAvailableDrills(drills);
    if (!drills.includes(rDrill)) setRDrill(drills[0]);
  }, [rEventId, events]); // sync drill options with selected event

  const [rMade, setRMade] = useState('8');
  const [rAttempts, setRAttempts] = useState('10');
  const [tH, setTH] = useState('0');
  const [tM, setTM] = useState('0');
  const [tS, setTS] = useState('12');
  const [tMS, setTMS] = useState('0');
  const [rBusy, setRBusy] = useState(false);

  const doSubmit = useCallback(async () => {
    if (!rEventId.trim()) { Alert.alert('Missing', 'Enter an Event ID (type to search, then tap).'); return; }
    if (!rEmail.trim()) { Alert.alert('Missing', 'Enter the player email.'); return; }
    setRBusy(true);
    try {
      await submitResult(rEventId, {
        email: rEmail.trim().toLowerCase(),
        drillType: rDrill.trim().toUpperCase(),
        made: Number(rMade)||0,
        attempts: Number(rAttempts)||0,
        timeMs: msFromParts(tH, tM, tS, tMS),
      });
      await addEmail(rEmail);
      Alert.alert('Result', 'Saved result.');
    } catch (e:any) {
      Alert.alert('Submit failed', String(e?.message || e));
    } finally {
      setRBusy(false);
    }
  }, [rEventId, rEmail, rDrill, rMade, rAttempts, tH, tM, tS, tMS]);

  // Quick chips (cents) - positive only
  const chips = useMemo(() => ([100, 500, 1000, 2500, 5000]), []);
  const chipLabel = (c: number) => toDollars(c);

  // Copy note
  const copyNote = useCallback(async (note?: string | null) => {
    if (!note) return;
    try {
      await Clipboard.setStringAsync(note);
      Alert.alert('Copied', 'Note copied to clipboard.');
    } catch {
      Alert.alert('Copy failed', 'Could not copy note.');
    }
  }, []);

  // CSV + email helpers
  const buildCSV = useCallback((rows: HistRow[]) => {
    const header = 'timestamp_iso,delta_cents,delta_dollars,note,balance_after_cents,balance_after_dollars';
    const lines = rows.map(r => {
      const iso = new Date(r.ts).toISOString();
      const deltaC = Number(r.delta)||0;
      const note = (r.note ?? '').toString().replace(/"/g,'""');
      const balC = Number(r.balanceAfter)||0;
      return [
        `"${iso}"`,
        `${deltaC}`,
        `"${toDollars(deltaC)}"`,
        `"${note}"`,
        `${balC}`,
        `"${toDollars(balC)}"`
      ].join(',');
    });
    return [header, ...lines].join('\n');
  }, []);

  const emailBodySafe = (text: string) =>
    encodeURIComponent(text).replace(/%0A/g, '%0D%0A'); // better newline rendering in mail clients

  const handleEmailCSV = useCallback(() => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email first.'); return; }
    const csv = buildCSV(displayRows);
    const subject = `Ball Skill credit history for ${gEmail.trim().toLowerCase()}`;
    const body = emailBodySafe(csv);
    const mailto = `mailto:${encodeURIComponent(gEmail.trim().toLowerCase())}?subject=${encodeURIComponent(subject)}&body=${body}`;
    Linking.openURL(mailto).catch(() => Alert.alert('Email', 'Could not open mail app.'));
  }, [gEmail, displayRows, buildCSV]);

  const handleEmailNotes = useCallback(() => {
    if (!gEmail.trim()) { Alert.alert('Missing', 'Enter an email first.'); return; }
    const lines = displayRows.map(r => {
      const when = new Date(r.ts).toLocaleString();
      const sign = r.delta >= 0 ? '+' : '';
      return `• ${when} — ${sign}${toDollars(r.delta)} — bal ${toDollars(r.balanceAfter)} — ${r.note ?? ''}`;
    }).join('\n');
    const subject = `Ball Skill credit notes for ${gEmail.trim().toLowerCase()}`;
    const body = emailBodySafe(lines || 'No history.');
    const mailto = `mailto:${encodeURIComponent(gEmail.trim().toLowerCase())}?subject=${encodeURIComponent(subject)}&body=${body}`;
    Linking.openURL(mailto).catch(() => Alert.alert('Email', 'Could not open mail app.'));
  }, [gEmail, displayRows]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        style={{ flex:1, backgroundColor:'#000' }}
        contentContainerStyle={{ padding:16, paddingBottom: 200 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollIndicatorInsets={{ bottom: 80 }}
      >
        {/* -------- Direct Wallet Ops (explicit add/deduct to a chosen wallet) -------- */}
        <View style={{ marginTop: 24, padding: 12, borderRadius: 8, backgroundColor: '#111', borderColor: '#333', borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Direct Wallet Ops</Text>
            <Switch value={dwEnabled} onValueChange={setDwEnabled} />
          </View>

          {dwEnabled && (
            <View style={{ marginTop: 12, gap: 10 }}>
              <Text style={{ color: '#ccc' }}>User Email</Text>
              <AutoEmail value={dwEmail} onChangeText={setDwEmail} placeholder="user email" style={s.input} />

              <Text style={{ color: '#ccc' }}>Amount ($)</Text>
              <TextInput
                placeholder="100.00"
                placeholderTextColor="#777"
                value={dwAmount}
                onChangeText={setDwAmount}
                keyboardType="decimal-pad"
                style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }}
              />

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setDwWallet('skill')} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: dwWallet === 'skill' ? '#FFB84D' : '#333', backgroundColor: dwWallet === 'skill' ? '#2a200f' : '#1a1a1a' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Skill Wallet</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDwWallet('dollars')} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: dwWallet === 'dollars' ? '#7DFF70' : '#333', backgroundColor: dwWallet === 'dollars' ? '#103014' : '#1a1a1a' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Dollars Wallet</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setDwMode('add')} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: dwMode === 'add' ? '#FF6600' : '#333', backgroundColor: dwMode === 'add' ? '#2a170a' : '#1a1a1a' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDwMode('deduct')} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: dwMode === 'deduct' ? '#FF6600' : '#333', backgroundColor: dwMode === 'deduct' ? '#2a170a' : '#1a1a1a' }}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Deduct</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: '#ccc' }}>Note (optional)</Text>
              <TextInput
                placeholder={dwMode === 'add' ? 'e.g., admin grant' : 'e.g., adjustment'}
                placeholderTextColor="#777"
                value={dwNote}
                onChangeText={setDwNote}
                style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }}
              />

              <TouchableOpacity onPress={submitDirectWallet} disabled={dwBusy} style={{ marginTop: 8, backgroundColor: '#FF6600', paddingVertical: 12, borderRadius: 6, alignItems: 'center' }}>
                <Text style={{ color: '#000', fontWeight: '800' }}>{dwBusy ? 'Working…' : (dwMode === 'add' ? 'Add to Wallet' : 'Deduct from Wallet')}</Text>
              </TouchableOpacity>

              <Text style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Uses explicit wallet v2 routes (no tags). Toggle off to hide. Remove later by searching for “Direct Wallet Ops”.</Text>
            </View>
          )}
        </View>
        <Text style={s.h1}>Admin {evLoading ? <Text style={{color:MUTED, fontSize:12}}>(loading events…)</Text> : null}</Text>
        <Text style={s.sub}>Server: <Text style={{color:'#fff'}}>{API}</Text></Text>

        {/* --- My Balance (quick refresh) --- */}
        <View style={{ backgroundColor:'#111', borderColor:'#2a2a2a', borderWidth:1, borderRadius:12, padding:12, marginBottom:12 }}>
          <Text style={{ color:'#fff', fontWeight:'800' }}>My Balance</Text>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
            <Text style={{ color:'#9a9a9a', fontVariant:['tabular-nums'] }}>
              {adminBalCents == null ? '—' : `${(adminBalCents/100).toFixed(2)}`}
            </Text>
            <Pressable
              onPress={refreshMyBalance}
              disabled={balRefreshing}
              style={({ pressed }) => [
                { borderColor:'#FF6600', borderWidth:1, borderRadius:999, paddingVertical:6, paddingHorizontal:12 },
                pressed && { opacity:0.9 }
              ]}
              hitSlop={8}
            >
              {balRefreshing
                ? <ActivityIndicator color="#FF6600" />
                : <Text style={{ color:'#FF6600', fontWeight:'800' }}>Refresh</Text>}
            </Pressable>
          </View>
        </View>
        
        {/* Seed */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Seed Demo Data</Text>
          <Text style={s.meta}>Creates 2 events and grants $25 to a few test users.</Text>
          <TouchableOpacity disabled={seedBusy} style={[s.btn, seedBusy && s.btnDisabled]} onPress={doSeed}>
            <Text style={s.btnText}>{seedBusy ? 'Seeding…' : 'Run Seed'}</Text>
          </TouchableOpacity>
        </View>

        {/* Grant / Deduct */}
        
        <View style={s.card}>
          <Text style={s.cardTitle}>Grant / Deduct Credits</Text>
          
          {/* Email */}
          <Text style={[s.meta, { marginTop: 0 }]}>Email</Text>
          <AutoEmail value={gEmail} onChangeText={setGEmail} placeholder="email" style={s.input} />
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', minHeight:18, marginTop:6 }}>
            {gBalLoading ? (
              <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                <ActivityIndicator color={ORANGE} size="small" />
                <Text style={s.meta}>Fetching balance…</Text>
              </View>
            ) : (
              <Text style={s.meta}>
                Balance: <Text style={{color:'#fff'}}>{gBal != null ? toDollars(gBal) : '—'}</Text>
              </Text>
            )}
            <Pressable
              onPress={refreshGBal}
              disabled={gBalLoading || !gEmail.trim()}
              style={({ pressed }) => [
                { borderColor: ORANGE, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 10 },
                pressed && { opacity: 0.9 },
                (!gEmail.trim() || gBalLoading) && { opacity: 0.6 }
              ]}
              hitSlop={8}
            >
              {gBalLoading
                ? <ActivityIndicator color={ORANGE} />
                : <Text style={{ color: ORANGE, fontWeight: '800' }}>Refresh</Text>}
            </Pressable>
          </View>

          {/* Amount */}
          <Text style={[s.meta, { marginTop: 10 }]}>Amount (cents)</Text>
          <View style={s.amountRow}>
            <TextInput
              style={[s.input, { flex:1 }]}
              placeholder="delta cents (e.g., 500)"
              placeholderTextColor={MUTED}
              value={gDelta}
              onChangeText={setGDelta}
              keyboardType="number-pad"
            />
            <Text style={s.amountPreview}>= {toDollars(gDeltaNum)}</Text>
          </View>

          {/* Quick chips */}
          <View style={s.chipRow}>
            {chips.map(c => (
              <TouchableOpacity key={c} style={s.chip} onPress={() => setGDelta(String(c))}>
                <Text style={s.chipText}>{chipLabel(c)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Wallet selector for Grant/Deduct */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setGWallet('skill')}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: gWallet === 'skill' ? '#FFB84D' : '#333', backgroundColor: gWallet === 'skill' ? '#2a200f' : '#1a1a1a' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Skill wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setGWallet('dollars')}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: gWallet === 'dollars' ? '#7DFF70' : '#333', backgroundColor: gWallet === 'dollars' ? '#103014' : '#1a1a1a' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Dollars wallet</Text>
            </TouchableOpacity>
          </View>

          {/* Note */}
          <View style={s.noteHeaderRow}>
            <Text style={[s.meta, { marginTop: 10, marginBottom: 0 }]}>Note (optional)</Text>
            {gNote ? (
              <Pressable
                onPress={() => setGNote('')}
                hitSlop={8}
                style={({ pressed }) => [s.clearChip, pressed && { opacity: 0.85 }]}
              >
                <Text style={s.clearChipText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            style={s.input}
            placeholder="e.g., refund / promo / manual adj"
            placeholderTextColor={MUTED}
            value={gNote}
            onChangeText={setGNote}
          />
          {/* Actions */}
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity disabled={gBusy} style={[s.btn, { flex:1 }, gBusy && s.btnDisabled]} onPress={doGrant}>
              <Text style={s.btnText}>{gBusy ? 'Working…' : 'Grant'}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={gBusy} style={[s.btnOutline, { flex:1 }, gBusy && s.btnDisabled]} onPress={doDeduct}>
              <Text style={s.btnOutlineText}>{gBusy ? 'Working…' : 'Deduct'}</Text>
            </TouchableOpacity>
          </View>

          {/* History */}
          <Text style={[s.cardTitle, { marginTop: 12 }]}>History</Text>

          {/* Chips: sort/filter */}
          <View style={s.chipRow}>
            <TouchableOpacity
              style={[s.drillChip, sortMode==='newest' && s.drillChipActive]}
              onPress={() => setSortMode('newest')}
            ><Text style={[s.drillChipText, sortMode==='newest' && s.drillChipTextActive]}>Newest</Text></TouchableOpacity>

            <TouchableOpacity
              style={[s.drillChip, sortMode==='oldest' && s.drillChipActive]}
              onPress={() => setSortMode('oldest')}
            ><Text style={[s.drillChipText, sortMode==='oldest' && s.drillChipTextActive]}>Oldest</Text></TouchableOpacity>

            <TouchableOpacity
              style={[s.drillChip, signFilter==='credits' && s.drillChipActive]}
              onPress={() => setSignFilter('credits')}
            ><Text style={[s.drillChipText, signFilter==='credits' && s.drillChipTextActive]}>Credits</Text></TouchableOpacity>

            <TouchableOpacity
              style={[s.drillChip, signFilter==='debits' && s.drillChipActive]}
              onPress={() => setSignFilter('debits')}
            ><Text style={[s.drillChipText, signFilter==='debits' && s.drillChipTextActive]}>Debits</Text></TouchableOpacity>

            <TouchableOpacity
              style={[s.drillChip, signFilter==='all' && s.drillChipActive]}
              onPress={() => setSignFilter('all')}
            ><Text style={[s.drillChipText, signFilter==='all' && s.drillChipTextActive]}>All</Text></TouchableOpacity>
          </View>

          {/* Search + Limit (with label) */}
          <View style={{ flexDirection:'row', gap:8, marginTop:8 }}>
            <TextInput
              style={[s.input, { flex:1 }]}
              placeholder="search notes (optional)"
              placeholderTextColor={MUTED}
              value={hQ}
              onChangeText={setHQ}
            />
            <View style={{ width:110 }}>
              <Text style={[s.meta, { marginBottom: -2 }]}>Limit</Text>
              <TextInput
                style={[s.input, { textAlign:'center', marginTop:4 }]}
                placeholder="50"
                placeholderTextColor={MUTED}
                value={hLimit}
                onChangeText={setHLimit}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={s.historyBox}>
            {hLoading ? (
              <View style={{ padding:12, flexDirection:'row', alignItems:'center', gap:8 }}>
                <ActivityIndicator color={ORANGE} />
                <Text style={s.meta}>Loading history…</Text>
              </View>
            ) : displayRows.length === 0 ? (
              <Text style={[s.meta, { padding:12 }]}>No history.</Text>
            ) : (
              <ScrollView style={s.historyScroll} nestedScrollEnabled>
                {displayRows.map((it, idx) => {
                  const color = colorForAmount(it.delta, it.note);
                  const badge = badgeFor(it.delta, it.note);
                  const when = new Date(it.ts).toLocaleString();
                  const hasNote = !!(it.note && it.note.length);
                  return (
                    <View key={idx} style={s.historyRow}>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                        <Text style={[s.histDelta, { color }]}>
                          {fmtDelta(it.delta)}{badge ? ' ' : ''}<Text style={{ color }}>{badge}</Text>
                        </Text>
                        <Text style={s.histWhen}>{when}</Text>
                      </View>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4, alignItems:'center' }}>
                        <Text style={s.histBalance}>Balance: {toDollars(it.balanceAfter)}</Text>
                        {hasNote ? (
                          <TouchableOpacity onPress={() => copyNote(it.note)} style={s.copyBtn}>
                            <Text style={s.copyBtnText}>Copy</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {hasNote ? (
                        <Text style={[s.histNote, { marginTop:6 }]} numberOfLines={2}>{it.note}</Text>
                      ) : null}
                    </View>
                  );
                })}
                <View style={{ height: 6 }} />
                
              </ScrollView>
            )}
          </View>

          {/* Export / Email */}
          <View style={{ flexDirection:'row', gap:10, marginTop:10 }}>
            <TouchableOpacity style={[s.btn, { flex:1 }]} onPress={handleEmailCSV}>
              <Text style={s.btnText}>Email CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnOutline, { flex:1 }]} onPress={handleEmailNotes}>
              <Text style={s.btnOutlineText}>Email Notes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Result */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Enter Drill Result</Text>

          <Text style={s.meta}>Event ID</Text>
          <AutoEventId value={rEventId} onChangeText={setREventId} placeholder="eventId (searchable)" style={s.input} />

          <Text style={[s.meta, { marginTop: 10 }]}>Player Email</Text>
          <AutoEmail value={rEmail} onChangeText={setREmail} placeholder="player email" style={s.input} />

          {/* Drill Type (dynamic) */}
          <Text style={[s.meta, { marginTop: 10 }]}>Drill Type</Text>
          {availableDrills.length > 0 && (
            <Text style={[s.meta, { marginTop: -4 }]}>
              Available: <Text style={{color:'#fff'}}>{availableDrills.join(' / ')}</Text>
            </Text>
          )}
          <View style={s.chipRow}>
            {availableDrills.map(dt => {
              const selected = rDrill === dt;
              return (
                <TouchableOpacity
                  key={dt}
                  style={[s.drillChip, selected && s.drillChipActive]}
                  onPress={() => setRDrill(dt)}
                >
                  <Text style={[s.drillChipText, selected && s.drillChipTextActive]}>{dt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={s.input}
            placeholder={`type to set (e.g., ${availableDrills[0] || 'FT'})`}
            placeholderTextColor={MUTED}
            value={rDrill}
            onChangeText={(t) => {
              const up = (t || '').toUpperCase();
              const match = availableDrills.find(d => d.startsWith(up));
              setRDrill(match || up);
            }}
            autoCapitalize="characters"
          />

          {/* Made / Attempts */}
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:8 }}>
            <Text style={s.smallLabel}>Made</Text>
            <Text style={s.smallLabel}>Attempts</Text>
          </View>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TextInput style={[s.input, { flex:1 }]} placeholder="made" placeholderTextColor={MUTED} value={rMade} onChangeText={setRMade} keyboardType="number-pad" />
            <TextInput style={[s.input, { flex:1 }]} placeholder="attempts" placeholderTextColor={MUTED} value={rAttempts} onChangeText={setRAttempts} keyboardType="number-pad" />
          </View>

          {/* Time */}
          <Text style={[s.meta, { marginTop: 10 }]}>Time</Text>
          <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:4 }}>
            <Text style={s.timeLabel}>H</Text>
            <Text style={s.timeLabel}>M</Text>
            <Text style={s.timeLabel}>S</Text>
            <Text style={s.timeLabel}>ms</Text>
          </View>
          <View style={s.timeRow}>
            <TextInput style={[s.input, s.timeCell]} placeholder="H"  placeholderTextColor={MUTED} value={tH}  onChangeText={setTH}  keyboardType="number-pad" />
            <TextInput style={[s.input, s.timeCell]} placeholder="M"  placeholderTextColor={MUTED} value={tM}  onChangeText={setTM}  keyboardType="number-pad" />
            <TextInput style={[s.input, s.timeCell]} placeholder="S"  placeholderTextColor={MUTED} value={tS}  onChangeText={setTS}  keyboardType="number-pad" />
            <TextInput style={[s.input, s.timeCell]} placeholder="ms" placeholderTextColor={MUTED} value={tMS} onChangeText={setTMS} keyboardType="number-pad" />
          </View>

          <TouchableOpacity disabled={rBusy} style={[s.btn, rBusy && s.btnDisabled]} onPress={doSubmit}>
            <Text style={s.btnText}>{rBusy ? 'Saving…' : 'Save Result'}</Text>
          </TouchableOpacity>
        </View>

        {/* spacer so last control never hides behind keyboard */}
        <View style={{ height: 40 }} />

     {/* -------- Demo: Participant Editor (toggleable) -------- */}
     <View style={{ marginTop: 24, padding: 12, borderRadius: 8, backgroundColor: '#111', borderColor: '#333', borderWidth: 1 }}>
       <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
         <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Demo: Participant Editor</Text>
         <Switch value={demoParticipantsEnabled} onValueChange={setDemoParticipantsEnabled} />
       </View>
       {demoParticipantsEnabled && (
         <View style={{ marginTop: 12, gap: 10 }}>
           <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
             <TouchableOpacity onPress={loadEventsIntoPicker} disabled={peLoading} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#222', borderRadius: 6 }}>
               <Text style={{ color: '#fff' }}>{peLoading ? 'Loading…' : 'Load Events'}</Text>
             </TouchableOpacity>
             <Text style={{ color: '#aaa', fontSize: 12 }}>{peEvents.length ? `${peEvents.length} events` : 'No events yet'}</Text>
           </View>

           {/* Event ID field (paste from /api/events) */}
           <Text style={{ color: '#ccc', marginTop: 4 }}>Event ID</Text>
           <TextInput
             placeholder="paste event id"
             placeholderTextColor="#777"
             value={peEventId}
             onChangeText={setPeEventId}
             autoCapitalize="none"
             autoCorrect={false}
             style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }}
           />
           {!!peEvents.length && (
             <Text style={{ color: '#888', fontSize: 12 }}>Hint: {peEvents[0]?.id} — {peEvents[0]?.name || ''}</Text>
           )}
           {/* Quick-pick event ID buttons */}
           {peEvents.length > 0 && (
             <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
               {peEvents.slice(0, 5).map(e => (
                 <TouchableOpacity key={e.id} onPress={() => setPeEventId(e.id)} style={{ borderColor: '#333', borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 }}>
                   <Text style={{ color: '#fff', fontSize: 12 }}>{e.name || 'Event'} · {e.id}</Text>
                 </TouchableOpacity>
               ))}
             </View>
           )}

           {/* Counts */}
           <View style={{ flexDirection: 'row', gap: 8 }}>
             <View style={{ flex: 1 }}>
               <Text style={{ color: '#9ecbff' }}>Teens</Text>
               <TextInput value={peTeen} onChangeText={setPeTeen} keyboardType="number-pad" placeholder="0" placeholderTextColor="#666" style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }} />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={{ color: '#7DFF70' }}>Adults</Text>
               <TextInput value={peAdult} onChangeText={setPeAdult} keyboardType="number-pad" placeholder="0" placeholderTextColor="#666" style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }} />
             </View>
           </View>
           <View style={{ flexDirection: 'row', gap: 8 }}>
             <View style={{ flex: 1 }}>
               <Text style={{ color: '#FFB84D' }}>Pro</Text>
               <TextInput value={pePro} onChangeText={setPePro} keyboardType="number-pad" placeholder="0" placeholderTextColor="#666" style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }} />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={{ color: '#FF6B6B' }}>Celebrity</Text>
               <TextInput value={peCeleb} onChangeText={setPeCeleb} keyboardType="number-pad" placeholder="0" placeholderTextColor="#666" style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }} />
             </View>
           </View>

           {/* Total spots */}
           <Text style={{ color: '#ccc', marginTop: 4 }}>Total Spots</Text>
           <TextInput value={peTotalSpots} onChangeText={setPeTotalSpots} keyboardType="number-pad" placeholder="100" placeholderTextColor="#666" style={{ color: '#fff', borderColor: '#333', borderWidth: 1, borderRadius: 6, padding: 10 }} />

           <TouchableOpacity onPress={saveParticipants} disabled={peLoading || !peEventId} style={{ marginTop: 8, backgroundColor: '#FF6600', paddingVertical: 12, borderRadius: 6, alignItems: 'center' }}>
             <Text style={{ color: '#000', fontWeight: '800' }}>{peLoading ? 'Saving…' : 'Save Participant Counts'}</Text>
           </TouchableOpacity>

           <Text style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Demo-only tool – toggle off to hide. Remove this block later by searching for “Demo: Participant Editor”.</Text>
         </View>
       )}
     </View>   
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  h1:{ color:'#fff', fontSize:22, fontWeight:'800' },
  sub:{ color:MUTED, marginTop:4, marginBottom:14 },
  card:{ backgroundColor: CARD, borderColor: BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  cardTitle:{ color:'#fff', fontWeight:'800', fontSize:16, marginBottom:8 },
  meta:{ color:MUTED, fontSize:12, marginTop:2, marginBottom:8 },
  smallLabel:{ color: MUTED, fontSize: 11, width: '50%', textAlign: 'center' },
  input:{ backgroundColor:'#090909', borderColor:'#1e1e1e', color:'#fff', borderWidth:1, borderRadius:10, paddingHorizontal:12, paddingVertical:10, marginTop:8 },
  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnDisabled:{ opacity:0.6 },
  btnText:{ color:'#000', fontWeight:'800' },

  // Outline for secondary action
  btnOutline:{ borderColor: ORANGE, borderWidth:1.5, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:12 },
  btnOutlineText:{ color: ORANGE, fontWeight:'800' },

  // Amount helpers
  amountRow:{ flexDirection:'row', alignItems:'center', gap:8 },
  amountPreview:{ color:'#fff', fontWeight:'700', minWidth:80, textAlign:'right' },

  // Chips (shared)
  chipRow:{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 },
  chip:{ backgroundColor:'#0b0b0b', borderColor:'#2a2a2a', borderWidth:1, paddingVertical:6, paddingHorizontal:10, borderRadius:999 },
  chipText:{ color:'#fff', fontWeight:'700', fontSize:12 },

  // Drill chips (selected state) + history chips reusing same styles
  drillChip:{ backgroundColor:'#0b0b0b', borderColor:'#2a2a2a', borderWidth:1, paddingVertical:6, paddingHorizontal:10, borderRadius:999 },
  drillChipActive:{ backgroundColor: ORANGE, borderColor: ORANGE },
  drillChipText:{ color:'#fff', fontWeight:'700', fontSize:12 },
  drillChipTextActive:{ color:'#000', fontWeight:'800' },

  // History styles
  historyBox:{ backgroundColor:'#0b0b0b', borderColor:'#1e1e1e', borderWidth:1, borderRadius:10, marginTop:8, overflow:'hidden' },
  historyScroll:{ maxHeight: 260 },
  historyRow:{ paddingVertical:10, paddingHorizontal:12, borderBottomColor:'#161616', borderBottomWidth:1 },
  histDelta:{ fontWeight:'800', fontSize:13 },
  histWhen:{ color:MUTED, fontSize:11, marginLeft:8 },
  histBalance:{ color:'#fff', fontSize:12, fontWeight:'600' },
  histNote:{ color:'#ddd', fontSize:12, maxWidth:'100%' },

  copyBtn:{ borderColor:'#444', borderWidth:1, paddingVertical:4, paddingHorizontal:8, borderRadius:8 },
  copyBtnText:{ color:'#fff', fontSize:12, fontWeight:'700' },

  noteHeaderRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  clearChip:{ borderColor:'#444', borderWidth:1, borderRadius:999, paddingVertical:4, paddingHorizontal:10, marginTop:10 },
  clearChipText:{ color:'#fff', fontSize:12, fontWeight:'700' },

  // Time inputs
  timeRow:{ flexDirection:'row', gap:8, marginTop:8 },
  timeCell:{ flex:1 },
  timeLabel:{ color: MUTED, fontSize: 11, width: '25%', textAlign: 'center' },
});
