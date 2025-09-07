import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Keyboard, TouchableWithoutFeedback } from 'react-native';
import colors from '../../theme/colors';
import { searchProfiles, getProfile, saveProfile } from '../../services/api';

export default function ProfilesPanel() {
  const [q, setQ] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const set = (k:string, v:any) => setProfile({ ...profile, [k]: v });

  useEffect(() => {
    let on = true;
    (async () => { const list = await searchProfiles(q.trim().toLowerCase()); if (on) setCandidates(list); })();
    return () => { on = false; };
  }, [q]);

  const loadOne = async (email: string) => {
    const p = await getProfile(email);
    if (!p) return Alert.alert('Not found', 'No profile exists.');
    setProfile(p);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ gap: 10 }}>
        <Text style={s.h2}>Profiles</Text>

        <Text style={s.label}>Search</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="email or name" placeholderTextColor={colors.MUTED_TEXT} autoCapitalize="none" style={s.input} />
        <View style={s.chipsRow}>
          {candidates.slice(0, 12).map(c => (
            <Pressable key={c.email} onPress={()=>loadOne(c.email)} style={({pressed})=>[cs.chip, pressed && {opacity:0.9}]}>
              <Text style={cs.txt}>{c.email}</Text>
            </Pressable>
          ))}
        </View>

        {profile && (
          <View style={s.card}>
            <Text style={s.label}>Editing: {profile.email}</Text>
            <Field label="Display name" value={profile.displayName||''} onChangeText={v=>set('displayName', v)} />
            <Field label="Avatar URL" value={profile.avatarUrl||''} onChangeText={v=>set('avatarUrl', v)} />
            <Field label="Team" value={profile.team||''} onChangeText={v=>set('team', v)} />
            <Field label="Position" value={profile.position||''} onChangeText={v=>set('position', v)} />
            <Field label="League" value={profile.league||''} onChangeText={v=>set('league', v)} />
            <Field label="Jersey" value={String(profile.jersey||'')} onChangeText={v=>set('jersey', v)} kb="number-pad" />
            <Field label="Rank" value={String(profile.rank ?? '')} onChangeText={v=>set('rank', Number(v)||0)} kb="number-pad" />
            <Field label="Rank Δ" value={String(profile.rankDelta ?? '')} onChangeText={v=>set('rankDelta', Number(v)||0)} kb="number-pad" />
            <Field label="Type (youth/teens/adult/pro/elite…)" value={profile.type||'adult'} onChangeText={v=>set('type', v.toLowerCase())} />
            <Pressable onPress={()=>set('verified', !profile.verified)} style={({pressed})=>[s.toggle, profile.verified && s.toggleOn, pressed && {opacity:0.95}]}>
              <Text style={s.toggleTxt}>{profile.verified ? 'Verified: Yes' : 'Verified: No'}</Text>
            </Pressable>

            <Pressable onPress={async()=>{ const out = await saveProfile(profile); if (out?.success) Alert.alert('Saved', 'Profile updated.'); else Alert.alert('Error', 'Could not save.'); }} style={({pressed})=>[s.btn, pressed && {opacity:0.9}]}>
              <Text style={s.btnTxt}>Save</Text>
            </Pressable>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

function Field({ label, value, onChangeText, kb }:{ label:string; value:string; onChangeText:(v:string)=>void; kb?: any }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType={kb} placeholderTextColor={colors.MUTED_TEXT} style={s.input} />
    </View>
  );
}

const cs = StyleSheet.create({
  chip: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, marginRight: 6, marginBottom: 6 },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
});

const s = StyleSheet.create({
  h2: { color: colors.TEXT, fontSize: 18, fontWeight: '900' },
  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  input: { backgroundColor: colors.CANVAS, color: colors.TEXT, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  card: { backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginTop: 8, gap: 8 },
  toggle: { borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, alignItems: 'center' },
  toggleOn: { backgroundColor: '#133015' },
  toggleTxt: { color: colors.TEXT, fontWeight: '800' },
  btn: { backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 6 },
  btnTxt: { color: colors.WHITE, fontWeight: '900' },
});
