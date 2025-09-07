import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';
import AdminDev from './admin/AdminDev';

export default function SettingsScreen() {
  return (
    <View style={s.container}>
      <Text style={s.h1}>Settings</Text>
      <Text style={s.sub}>Developer options (for testing):</Text>
      <View style={{ height: 12 }} />
      <AdminDev />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 4 },
  sub: { color: colors.MUTED_TEXT, marginBottom: 6 },
});
