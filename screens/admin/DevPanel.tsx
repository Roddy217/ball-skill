import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Keyboard, TouchableWithoutFeedback } from 'react-native';
import colors from '../../theme/colors';
import { getApiBase, setApiBaseAndTest, seedProfiles, seedEvents, refreshEvents } from '../../services/api';

export default function DevPanel() {
  const [base, setBase] = useState('');
  const [ping, setPing] = useState<string>('');

  useEffect(() => { (async ()=>{ const b = await getApiBase(); setBase(b); })(); }, []);

  const onSaveTest = async () => {
    const r = await setApiBaseAndTest(base);
    setPing(r?.ok ? 'Ping OK' : 'Ping FAIL');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ gap: 10 }}>
        <Text style={s.h2}>Dev settings</Text>

        <Text style={s.label}>API Base URL</Text>
        <TextInput value={base} onChangeText={setBase} placeholder="http://192.168.x.x:3001/api" placeholderTextColor={colors.MUTED_TEXT} autoCapitalize="none" style={s.input} />
        <Pressable onPress={onSaveTest} style={({pressed})=>[s.btn, pressed && {opacity:0.9}]}><Text style={s.btnTxt}>Save & Test</Text></Pressable>
        {!!ping && <Text style={{ color: ping.includes('OK') ? '#3DDC84' : '#ff6b6b' }}>{ping}</Text>}

        <View style={{ height: 6 }} />
        <Pressable onPress={async()=>{ const r=await seedProfiles(); Alert.alert('Seeded', `Demo profiles created: ${r?.count ?? 0}\nNote: demo data resets on server restart.`); }} style={({pressed})=>[s.btnOutline, pressed && {opacity:0.9}]}>
          <Text style={s.btnOutlineTxt}>Seed demo profiles + credits</Text>
        </Pressable>

        <Pressable onPress={async()=>{ await seedEvents(); await refreshEvents(); Alert.alert('Seeded', 'Demo events seeded. Go to Events and tap Refresh.'); }} style={({pressed})=>[s.btnOutline, pressed && {opacity:0.9}]}>
          <Text style={s.btnOutlineTxt}>Seed demo events</Text>
        </Pressable>

        <Pressable onPress={async()=>{ await refreshEvents(); Alert.alert('Refreshed', 'Events refreshed.'); }} style={({pressed})=>[s.btnOutline, pressed && {opacity:0.9}]}>
          <Text style={s.btnOutlineTxt}>Refresh events</Text>
        </Pressable>

        <Text style={s.tips}>
          Tips (Android): If the bundle won’t load over LAN, use Tunnel mode in Expo. If API calls fail on device, ensure the base URL points to your Mac’s LAN IP.
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  h2: { color: colors.TEXT, fontSize: 18, fontWeight: '900' },
  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  input: { backgroundColor: colors.CANVAS, color: colors.TEXT, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  btn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: colors.WHITE, fontWeight: '900' },
  btnOutline: { borderColor: colors.ORANGE, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  btnOutlineTxt: { color: colors.ORANGE, fontWeight: '900' },
  tips: { color: colors.MUTED_TEXT, fontSize: 12, marginTop: 8 },
});
