import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import colors from '../../theme/colors';
import { getApiBase, loadApiBase, setApiBase, ping } from '../../services/api';

export default function AdminDev() {
  const [base, setBase] = useState<string>('');
  const [testing, setTesting] = useState(false);
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

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={s.container}>
        <Text style={s.h1}>Dev Settings</Text>

        <Text style={s.label}>API Base URL</Text>
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

        <Pressable onPress={onSaveTest} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}>
          {testing ? <ActivityIndicator /> : <Text style={s.btnText}>Save & Test</Text>}
        </Pressable>

        {ok !== null && (
          <View style={[s.badge, ok ? s.badgeOk : s.badgeErr]}>
            <Text style={s.badgeText}>{ok ? 'Ping OK' : 'Ping failed'}</Text>
          </View>
        )}

        <View style={s.hintBox}>
          <Text style={s.hintTitle}>Tips</Text>
          <Text style={s.hintText}>• iPhone on LAN → http://YOUR_LAN_IP:3001/api</Text>
          <Text style={s.hintText}>• iOS Simulator → http://localhost:3001/api</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16, gap: 12 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  label: { color: colors.MUTED_TEXT, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.SURFACE, color: colors.TEXT,
    borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  btn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  btnText: { color: colors.WHITE, fontWeight: '800', fontSize: 14 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 10 },
  badgeOk: { backgroundColor: '#143016' },
  badgeErr: { backgroundColor: '#3a1818' },
  badgeText: { color: colors.WHITE, fontWeight: '800', fontSize: 12 },
  hintBox: { backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 4 },
  hintTitle: { color: colors.TEXT, fontWeight: '800' },
  hintText: { color: colors.MUTED_TEXT, fontSize: 12 },
});
