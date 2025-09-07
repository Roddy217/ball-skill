import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import colors from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import CreditsPanel from './admin/CreditsPanel';
import DevPanel from './admin/DevPanel';
import ProfilesPanel from './admin/ProfilesPanel';

type TabKey = 'CREDITS' | 'DEV' | 'PROFILES';

export default function AdminScreen() {
  const { user } = useAuth();
  const emailLc = (user?.email || '').toLowerCase();
  const isAdmin = useMemo(() => ['admin@ballskill.com', 'support@ballskill.com'].includes(emailLc), [emailLc]);
  const [tab, setTab] = React.useState<TabKey>('CREDITS');

  if (!isAdmin) {
    return (
      <View style={s.container}>
        <Text style={s.h1}>Settings</Text>
        <Text style={s.p}>This area is for admins. Your personal settings will appear here soon.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={s.h1}>Admin</Text>

      <View style={s.tabs}>
        <Tab label="Credits" active={tab==='CREDITS'} onPress={()=>setTab('CREDITS')} />
        <Tab label="Dev" active={tab==='DEV'} onPress={()=>setTab('DEV')} />
        <Tab label="Profiles" active={tab==='PROFILES'} onPress={()=>setTab('PROFILES')} />
      </View>

      {tab === 'CREDITS' && <CreditsPanel />}
      {tab === 'DEV' && <DevPanel />}
      {tab === 'PROFILES' && <ProfilesPanel />}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Tab({ label, active, onPress }:{ label:string; active?:boolean; onPress:()=>void }) {
  return (
    <Pressable onPress={onPress} style={({pressed})=>[cs.chip, active && cs.active, pressed && {opacity:0.9}]}>
      <Text style={[cs.txt, active && cs.txtActive]}>{label}</Text>
    </Pressable>
  );
}

const cs = StyleSheet.create({
  chip: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  active: { backgroundColor: colors.ORANGE, borderColor: colors.ORANGE },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '800' },
  txtActive: { color: colors.WHITE },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  p: { color: colors.MUTED_TEXT, fontSize: 14 },
  tabs: { flexDirection: 'row', alignItems: 'center' },
});
