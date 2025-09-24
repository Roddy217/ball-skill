import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';

const SERVER = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001').replace(/\/+$/,'');
const API = `${SERVER}/api`;

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: any;
};

type Ev = { id: string; name?: string; dateISO?: string; };

export default function AutoEventId({ value, onChangeText, placeholder="eventId", style }: Props) {
  const [all, setAll] = useState<Ev[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/events`);
        const data = await res.json();
        const events: Ev[] = (data?.events || []).map((e: any) => ({ id: e?.id || e?._id || '', name: e?.name, dateISO: e?.dateISO }));
        setAll(events.filter(e => !!e.id));
      } catch {}
    })();
  }, []);

  const items = useMemo(() => {
    const q = (value || '').toLowerCase();
    if (!q) return all.slice(0, 8);
    return all.filter(e =>
      e.id.toLowerCase().includes(q) ||
      (e.name || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [value, all]);

  return (
    <View style={s.wrap}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => { onChangeText(t); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        placeholderTextColor="#9a9a9a"
        autoCapitalize="none"
        autoCorrect={false}
        style={style}
      />
      {open && items.length > 0 && (
        <View style={s.popup} pointerEvents="box-none">
          {items.map(e => (
            <Pressable
              key={e.id}
              style={({pressed})=>[s.item, pressed && s.itemPressed]}
              onPressIn={() => { onChangeText(e.id); setOpen(false); ref.current?.blur(); }}
            >
              <Text style={s.idText}>{e.id}</Text>
              {!!e.name && <Text style={s.nameText}>{e.name}</Text>}
              {!!e.dateISO && <Text style={s.metaText}>{new Date(e.dateISO).toLocaleString()}</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 50 },
  popup: {
    position: 'absolute', left: 0, right: 0, top: '100%',
    backgroundColor: '#0b0b0b', borderColor: '#1e1e1e', borderWidth: 1,
    borderRadius: 10, overflow: 'hidden', zIndex: 100, marginTop: 4,
  },
  item: { paddingVertical: 10, paddingHorizontal: 12, borderBottomColor: '#131313', borderBottomWidth: 1 },
  itemPressed: { opacity: 0.85 },
  idText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  nameText: { color: '#ddd', fontSize: 12, marginTop: 2 },
  metaText: { color: '#9a9a9a', fontSize: 11, marginTop: 2 },
});
