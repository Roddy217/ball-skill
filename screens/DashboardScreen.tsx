// screens/DashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { getApiBase, loadApiBase } from '../services/api';

const ORANGE = '#FF6600';
const CARD = '#111';
const BORDER = '#2a2a2a';
const MUTED = '#9a9a9a';
const GREEN = '#2ecc71';
const RED = '#e74c3c';

type ServerStatus = 'checking' | 'ok' | 'down';

export default function DashboardScreen() {
  const { user, signInGuest } = useAuth();

  const [status, setStatus] = useState<ServerStatus>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [lastUrl, setLastUrl] = useState<string>('');
  const [pingBusy, setPingBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

  // Origin WITHOUT trailing /api (e.g., http://192.168.1.244:3001)
  const [origin, setOrigin] = useState<string>('');

  // Resolve base from env/storage and derive origin
  useEffect(() => {
    (async () => {
      try { await loadApiBase(); } catch {}
      const baseRaw = String(getApiBase() || '').replace(/\/+$/, '') || 'http://localhost:3001';
      const originNoApi = baseRaw.replace(/\/api$/, '');
      setOrigin(originNoApi);
      console.log('[Dashboard] origin =', originNoApi);
    })();
  }, []);

  const pingOnce = useCallback(async () => {
    setPingBusy(true);
    setStatus('checking');
    setLatency(null);
    try {
      await loadApiBase().catch(() => {});
      const baseRaw = String(getApiBase() || '').replace(/\/+$/, '') || 'http://localhost:3001';
      const originNoApi = baseRaw.replace(/\/api$/, '');
      const pingUrl = `${originNoApi}/api/ping`;

      setLastUrl(pingUrl);
      console.log('[Dashboard] ping →', pingUrl);

      const t0 = Date.now();
      const res = await fetch(pingUrl);
      const json: any = await res.json().catch(() => ({}));
      const dt = Date.now() - t0;
      setLatency(dt);

      const isOk = !!(json && (json.ok === true || json.status === 'ok'));
      setStatus(res.ok && isOk ? 'ok' : 'down');
      console.log('[Dashboard] ping ←', { ok: res.ok, json, latency: dt });
    } catch (e) {
      console.log('[Dashboard] ping error', e);
      setStatus('down');
    } finally {
      setPingBusy(false);
    }
  }, []);

  useEffect(() => {
    console.log('[Dashboard] mounted');
    pingOnce();
  }, [pingOnce]);

  const doGuest = useCallback(async () => {
    if (guestBusy) return;
    setGuestBusy(true);
    try {
      console.log('[Guest Login] start');
      await signInGuest();
      console.log('[Guest Login] success');
    } catch (e) {
      console.log('[Guest Login] error', e);
    } finally {
      setGuestBusy(false);
    }
  }, [guestBusy, signInGuest]);

  const hostLabel = useMemo(
    () => String(origin || '').replace(/^https?:\/\//, ''),
    [origin]
  );

  return (
    <View style={s.screen}>
      <Text style={s.h1}>Dashboard</Text>
      <Text style={s.sub}>
        {user?.email ? `Signed in as ${user.email}` : (user ? 'Guest session' : 'Signed out')}
      </Text>

      {/* Server status */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Server</Text>
        <Text style={s.meta}>Base: {hostLabel || 'not set'}</Text>
        <Text style={[s.status, status === 'ok' ? s.ok : status === 'down' ? s.down : s.checking]}>
          {status === 'checking' && 'Checking…'}
          {status === 'ok' && `OK${latency != null ? ` · ${latency}ms` : ''}`}
          {status === 'down' && 'Down'}
        </Text>
        {lastUrl ? <Text style={s.metaSmall}>Last: {lastUrl}</Text> : null}

        <Pressable
          onPress={pingOnce}
          disabled={pingBusy}
          style={({ pressed }) => [
            s.btnOutline,
            pressed && { opacity: 0.85 },
            pingBusy && { opacity: 0.6 },
          ]}
        >
          {pingBusy ? <ActivityIndicator /> : <Text style={s.btnOutlineText}>Recheck</Text>}
        </Pressable>
      </View>

      {/* Guest login (only when NOT signed in with email) */}
      {!user?.email && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Quick test</Text>
          <Text style={s.meta}>Start a guest session (anonymous auth).</Text>

          <Pressable
            onPress={doGuest}
            disabled={guestBusy}
            style={({ pressed }) => [
              s.btnOutline,
              pressed && { opacity: 0.85 },
              guestBusy && { opacity: 0.6 },
            ]}
          >
            {guestBusy ? <ActivityIndicator /> : <Text style={s.btnOutlineText}>Guest login</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', padding: 16 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },

  card: {
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },

  meta: { color: MUTED, fontSize: 12, marginTop: 4 },
  metaSmall: { color: MUTED, fontSize: 11, marginTop: 6 },

  status: { marginTop: 8, fontWeight: '800', fontSize: 14 },
  ok: { color: GREEN },
  down: { color: RED },
  checking: { color: MUTED },

  btnOutline: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ORANGE,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnOutlineText: { color: ORANGE, fontWeight: '800' },
});
