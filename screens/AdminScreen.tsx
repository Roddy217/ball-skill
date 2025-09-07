import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import colors from '../theme/colors';
import AdminCredits from './admin/AdminCredits';
import AdminDev from './admin/AdminDev';
import { useAuth } from '../providers/AuthProvider';

type TabKey = 'CREDITS' | 'DEV'; // ready for future: 'EVENTS'

export default function AdminScreen() {
  const { user } = useAuth();
  const isAdmin = (user?.email || '').toLowerCase() === 'admin@ballskill.com';

  const [tab, setTab] = useState<TabKey>('CREDITS');

  if (!isAdmin) {
    return (
      <View style={s.container}>
        <Text style={s.locked}>Admin only</Text>
        <Text style={s.sub}>Sign in as admin@ballskill.com to access tools.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.tabs}>
        <Tab label="Credits" active={tab==='CREDITS'} onPress={()=>setTab('CREDITS')} />
        <Tab label="Dev"     active={tab==='DEV'}     onPress={()=>setTab('DEV')} />
        {/* <Tab label="Events"  active={tab==='EVENTS'}  onPress={()=>setTab('EVENTS')} /> */}
      </View>

      <View style={s.body}>
        {tab === 'CREDITS' && <AdminCredits />}
        {tab === 'DEV' && <AdminDev />}
      </View>
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ts.tab, active && ts.active, pressed && { opacity: 0.9 }]}>
      <Text style={[ts.txt, active && ts.txtActive]}>{label}</Text>
    </Pressable>
  );
}

const ts = StyleSheet.create({
  tab: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  active: { backgroundColor: colors.ORANGE, borderColor: colors.ORANGE },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
  txtActive: { color: colors.WHITE },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  tabs: { flexDirection: 'row', marginBottom: 12 },
  body: { flex: 1 },
  locked: { color: colors.TEXT, fontWeight: '800', fontSize: 18, marginBottom: 6 },
  sub: { color: colors.MUTED_TEXT },
});
