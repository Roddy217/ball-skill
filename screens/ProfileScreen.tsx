import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { auth } from '../services/firebase';
import { signOut } from 'firebase/auth';

const ORANGE = '#FF6600';
const CARD = '#111';
const BORDER = '#2a2a2a';
const MUTED = '#9a9a9a';

export default function ProfileScreen() {
  const user = auth.currentUser;
  const email = user?.email || 'guest';

  const doSignOut = async () => {
    try {
      await signOut(auth);
      // App.tsx listens to onAuthStateChanged; it will switch to Login automatically
    } catch (e: any) {
      Alert.alert('Sign out failed', e.message);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.h1}>Profile</Text>
      <Text style={s.sub}>Account info & session</Text>

      <View style={s.card}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{email}</Text>
      </View>

      <TouchableOpacity style={s.btn} onPress={doSignOut}>
        <Text style={s.btnText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 16, paddingTop: 22 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },
  card: { backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  label: { color: MUTED, marginBottom: 6 },
  value: { color: '#fff', fontWeight: '700' },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '800' },
});
