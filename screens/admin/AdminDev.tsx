import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import colors from '../../theme/colors';
import { getApiBase, loadApiBase, setApiBase, ping, seedDemoEvents } from '../../services/api';

export default function AdminDev() {
  const [base, setBase] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const v = await loadApiBase();
      setBase(v);
    })();
  }, []);

  const onSaveTest = async () => {
    Keyboard.dismiss();
    if (!base) return;
    await setApiBase(base);
    setTesting(true);
    try {
      const good = await ping();
      setOk(good);
      if (!good) Alert.alert('Ping failed', 'Double-check the base URL and server.');
    } finally {
      setTesting(false);
    }
  };

  const onSeed = async () => {
    Keyboard.dismiss();
    setSeeding(true);
    try {
      const res = await seedDemoEvents();
      if (res.success) {
        Alert.alert('Seed complete', `Added ${res.count ?? 0} demo events.`);
      } else {
        Alert.alert('Seed failed', 'Could not create demo events.');
      }
    } finally {
      setSeeding(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={s.container}>
        <Text style={s.h1}>Dev Settings</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.label}>Current base:</Text>
          <View style={[s.badge, ok === true ? s.badgeOk : ok === false ? s.badgeErr : s.badgeNeutral]}>
            <Text style={s.badgeText} numberOfLines={1}>{getApiBase()}</Text>
          </View>
        </View>

        <Text style={[s.label, { marginTop: 10 }]}>API Base URL</Text>
        <TextInput
          value={base}
          onChangeText={setBase}
          placeholder="http://192.168.1.244:3001/api"
          placeholderTextColor={colors.MUTED_TEXT}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={onSaveTest}
          style={s.input}
        />

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Pressable onPress={onSaveTest} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}>
            {testing ? <ActivityIndicator /> : <Text style={s.btnText}>Save & Test</Text>}
          </Pressable>
          <Pressable onPress={onSeed} style={({ pressed }) => [s.btnOutline, pressed && { opacity: 0.9 }]}>
            {seeding ? <ActivityIndicator /> : <Text style={s.btnOutlineText}>Seed demo events</Text>}
          </Pressable>
        </View>

        {ok !== null && (
          <View style={[s.result, ok ? s.resultOk : s.resultErr]}>
            <Text style={s.resultTxt}>{ok ? 'Ping OK' : 'Ping failed'}</Text>
          </View>
        )}

        <View style={s.hintBox}>
          <Text style={s.hintTitle}>Platform tips</Text>
          <Text style={s.hintText}>• iOS Simulator → <Text style={s.mono}>http://localhost:3001/api</Text></Text>
          <Text style={s.hintText}>• Android Emulator → <Text style={s.mono}>http://10.0.2.2:3001/api</Text></Text>
          <Text style={s.hintText}>• Real iPhone/Android (same Wi-Fi) → <Text style={s.mono}>http://YOUR_LAN_IP:3001/api</Text></Text>
          <Text style={s.hintText}>• Confirm server: curl <Text style={s.mono}>http://YOUR_LAN_IP:3001/api/ping</Text></Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16, gap: 12 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 4 },

  label: { color: colors.MUTED_TEXT, fontSize: 12 },

  input: {
    backgroundColor: colors.SURFACE, color: colors.TEXT,
    borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },

  btn: { flex: 1, backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: colors.WHITE, fontWeight: '800', fontSize: 14 },
  btnOutline: { flex: 1, borderColor: colors.ORANGE, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnOutlineText: { color: colors.ORANGE, fontWeight: '800', fontSize: 14 },

  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: '70%' },
  badgeNeutral: { backgroundColor: '#333' },
  badgeOk: { backgroundColor: '#143016' },
  badgeErr: { backgroundColor: '#3a1818' },
  badgeText: { color: colors.WHITE, fontWeight: '800', fontSize: 12 },

  result: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 6 },
  resultOk: { backgroundColor: '#143016' },
  resultErr: { backgroundColor: '#3a1818' },
  resultTxt: { color: colors.WHITE, fontWeight: '800', fontSize: 12 },

  hintBox: { backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 4 },
  hintTitle: { color: colors.TEXT, fontWeight: '800' },
  hintText: { color: colors.MUTED_TEXT, fontSize: 12, lineHeight: 18 },
  mono: { fontFamily: 'Courier', color: colors.TEXT },
});
