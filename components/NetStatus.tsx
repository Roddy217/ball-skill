import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ORANGE = '#FF6600';
const MUTED = '#9a9a9a';

const serverURL = (process.env.EXPO_PUBLIC_SERVER_URL as string) || 'http://localhost:3001';
const apiBase = `${serverURL.replace(/\/+$/,'')}/api`;

export default function NetStatus() {
  const [status, setStatus] = useState<'idle'|'ok'|'fail'|'checking'>('idle');
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('checking');
    setError(null);
    setLatency(null);

    const started = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);

    try {
      const res = await fetch(`${apiBase}/events`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        setStatus('fail');
        setError(`HTTP ${res.status}`);
      } else {
        setStatus('ok');
        setLatency(Date.now() - started);
      }
    } catch (e:any) {
      clearTimeout(t);
      setStatus('fail');
      setError(e?.name === 'AbortError' ? 'timeout' : (e?.message || 'network error'));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const badgeStyle = useMemo(() => {
    switch (status) {
      case 'ok': return [s.badge, { backgroundColor: '#113311', borderColor: '#1f5f1f' }];
      case 'fail': return [s.badge, { backgroundColor: '#331111', borderColor: '#5f1f1f' }];
      case 'checking':
      default: return [s.badge, { backgroundColor: '#111133', borderColor: '#1f1f5f' }];
    }
  }, [status]);

  const dotStyle = useMemo(() => {
    switch (status) {
      case 'ok': return [s.dot, { backgroundColor: '#22cc55' }];
      case 'fail': return [s.dot, { backgroundColor: '#ff3344' }];
      case 'checking':
      default: return [s.dot, { backgroundColor: '#ffd166' }];
    }
  }, [status]);

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <View style={badgeStyle}>
          <View style={dotStyle} />
          <Text style={s.badgeText}>
            {status === 'ok' && (latency != null ? `Server OK • ${latency}ms` : 'Server OK')}
            {status === 'checking' && 'Checking…'}
            {status === 'fail' && `Server FAIL${error ? ` • ${error}` : ''}`}
          </Text>
        </View>
        <TouchableOpacity onPress={check} style={s.refresh}>
          <Text style={s.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.meta} selectable>
        {`API: ${apiBase}`}
      </Text>
      <Text style={s.meta}>
        {`Device: ${__DEV__ ? 'Dev' : 'Prod'} • ${status.toUpperCase()}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 20, width: '100%', paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  badgeText: { color: '#fff', fontWeight: '700' },
  refresh: { marginLeft: 12, backgroundColor: ORANGE, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  refreshText: { color: '#000', fontWeight: '800' },
  meta: { color: MUTED, marginTop: 6, fontSize: 12 },
});
