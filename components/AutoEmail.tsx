import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable } from 'react-native';
import { getEmails } from '../services/emailStore';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: any;
};

export default function AutoEmail({ value, onChangeText, placeholder="email", style }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    (async () => setAll(await getEmails()))();
  }, []);

  const list = useMemo(() => {
    const v = (value || '').toLowerCase();
    if (!v) return all.slice(0, 6);
    return all.filter(e => e.toLowerCase().includes(v)).slice(0, 6);
  }, [value, all]);

  return (
    <View style={s.wrap}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => { onChangeText(t); setOpen(true); }}
        onFocus={() => { setOpen(true); }}
        onBlur={() => { setTimeout(() => setOpen(false), 250); }}  // give tap a beat to land
        placeholder={placeholder}
        placeholderTextColor="#9a9a9a"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={style}
      />
      {open && list.length > 0 && (
        <View style={s.popup} pointerEvents="box-none">
          {list.map(e => (
            <Pressable
              key={e}
              style={({pressed})=>[s.item, pressed && s.itemPressed]}
              onPressIn={() => { onChangeText(e); setOpen(false); ref.current?.blur(); }}  // fire before blur closes
            >
              <Text style={s.itemText}>{e}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 50 }, // ensure it layers above card content
  popup: {
    position: 'absolute',
    left: 0, right: 0, top: '100%',
    backgroundColor: '#0b0b0b',
    borderColor: '#1e1e1e',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 100,
    marginTop: 4,
  },
  item: { paddingVertical: 10, paddingHorizontal: 12 },
  itemPressed: { opacity: 0.8 },
  itemText: { color: '#fff', fontSize: 13 },
});
