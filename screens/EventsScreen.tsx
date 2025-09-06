// screens/EventsScreen.tsx (Public Events)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import api, { toDollars } from '../services/api';
import { auth } from '../services/firebase';

type EventItem = { id: string; title?: string; name?: string; feeCents?: number };

export default function EventsScreen() {
  const email = auth?.currentUser?.email || '';
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedMap, setJoinedMap] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState(10); // client-side "Load more"

  const friendly = (e: EventItem) => e.title ?? e.name ?? e.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getEvents();
      setEvents(Array.isArray(list) ? list : []);
      setVisibleCount(10);
    } catch (e: any) {
      Alert.alert('Events error', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      if (email) {
        const acc: Record<string, boolean> = {};
        for (const ev of events) {
          try {
            const r = await api.isJoined(ev.id, email);
            acc[ev.id] = !!(r && r.joined);
          } catch {}
        }
        setJoinedMap(acc);
      }
    } finally {
      setRefreshing(false);
    }
  }, [load, email, events]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!email || !events.length) {
        setJoinedMap({});
        return;
      }
      const acc: Record<string, boolean> = {};
      for (const ev of events) {
        try {
          const r = await api.isJoined(ev.id, email);
          if (cancelled) return;
          acc[ev.id] = !!(r && r.joined);
        } catch {
          // ignore
        }
      }
      if (!cancelled) setJoinedMap(acc);
    }
    check();
    return () => { cancelled = true; };
  }, [email, events]);

  const onJoin = useCallback(async (eventId: string) => {
    const who = (auth?.currentUser?.email || '').trim();
    if (!who) {
      Alert.alert('Sign in required', 'Please sign in to join events.');
      return;
    }
    setJoiningId(eventId);
    try {
      const res = await api.joinAndCharge(eventId, who); // charges feeCents (credits)
      Alert.alert('Joined', `Success! Charged ${res.charged} credits.`);
      setJoinedMap((m) => ({ ...m, [eventId]: true }));
    } catch (e: any) {
      Alert.alert('Join failed', e?.message ?? String(e));
    } finally {
      setJoiningId(null);
    }
  }, []);

  const canLoadMore = useMemo(() => visibleCount < events.length, [visibleCount, events.length]);
  const visible = useMemo(() => events.slice(0, visibleCount), [events, visibleCount]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
        <Text style={s.muted}>Loading events…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* small debug header */}
      <View style={s.debugBar}>
        <Text style={s.debugText}>events: {events.length}</Text>
        {!!events.length && (
          <Text style={s.debugTextSmall}>
            first: {friendly(events[0])} (fee {events[0].feeCents ?? 0} / ${toDollars(events[0].feeCents ?? 0)})
          </Text>
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
      >
        {visible.map((e) => {
          const joined = !!joinedMap[e.id];
          const busy = joiningId === e.id;
          return (
            <View key={String(e.id)} style={s.card}>
              <Text style={s.title} numberOfLines={1}>{friendly(e)}</Text>
              <Text style={s.meta}>id: {String(e.id)}</Text>
              <Text style={s.meta}>feeCents: {Number(e.feeCents ?? 0)} (${toDollars(e.feeCents ?? 0)})</Text>

              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onJoin(e.id)}
                disabled={joined || busy}
                style={[s.btn, (joined || busy) && { opacity: 0.6 }]}
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={s.btnText}>{joined ? 'Already joined' : 'Join'}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        {canLoadMore && (
          <TouchableOpacity onPress={() => setVisibleCount((n) => n + 10)} style={[s.btn, s.btnSecondary, { marginTop: 12 }]}>
            <Text style={s.btnText}>Load more</Text>
          </TouchableOpacity>
        )}

        {!events.length && (
          <Text style={[s.meta, { marginTop: 12 }]}>No events available.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const BORDER = '#1f1f1f';
const CARD = '#0f0f0f';
const ORANGE = '#ff9d00';

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  muted: { color: '#9a9a9a' },
  debugBar: { padding: 10, borderBottomColor: BORDER, borderBottomWidth: 1, backgroundColor: '#0b0b0b' },
  debugText: { color: '#9ad', fontSize: 12, fontWeight: '700' },
  debugTextSmall: { color: '#789', fontSize: 11 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  meta: { color: '#bbb', fontSize: 12, marginTop: 4 },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnSecondary: { backgroundColor: '#2f2f2f' },
  btnText: { color: '#000', fontWeight: '800' },
});