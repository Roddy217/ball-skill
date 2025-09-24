import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';

// TEMP DIAGNOSTIC APP — single screen to prove Simulator rendering is working
export default function App() {
  console.log('App.tsx: diagnostic screen mounted');
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <Text style={s.title}>Ball Skill</Text>
      <Text style={s.sub}>Simulator diagnostic OK ✅</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FF6600', fontSize: 28, fontWeight: '900' },
  sub: { color: '#fff', marginTop: 8, fontSize: 16 },
});
