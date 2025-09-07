import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import colors from '../theme/colors';
import { getNotifications, loadNotifications, subscribe, clearNotifications } from '../state/notify';

export default function NotificationsScreen() {
  const [rows, setRows] = useState(getNotifications());
  useEffect(() => {
    loadNotifications();
    const unsub = subscribe(() => setRows(getNotifications()));
    return unsub;
  }, []);
  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.h1}>Notifications</Text>
        <Pressable onPress={clearNotifications} style={({pressed})=>[s.clear, pressed && {opacity:0.9}]}>
          <Text style={s.clearTxt}>Clear</Text>
        </Pressable>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(it) => it.id}
        renderItem={({item}) => (
          <View style={s.card}>
            <Text style={s.title}>{item.title}</Text>
            {!!item.body && <Text style={s.body}>{item.body}</Text>}
            <Text style={s.ts}>{new Date(item.ts).toLocaleString()}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{color:colors.MUTED_TEXT}}>No notifications yet.</Text>}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: colors.TEXT, fontWeight: '900', fontSize: 20, marginBottom: 8 },
  clear: { borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  clearTxt: { color: colors.MUTED_TEXT, fontWeight: '800', fontSize: 12 },
  card: { backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, marginTop: 10 },
  title: { color: colors.TEXT, fontWeight: '800' },
  body: { color: colors.MUTED_TEXT, marginTop: 4 },
  ts: { color: colors.MUTED_TEXT, fontSize: 12, marginTop: 6 },
});
