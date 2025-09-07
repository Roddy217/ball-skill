import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Keyboard, TouchableWithoutFeedback } from 'react-native';
import colors from '../theme/colors';
import { getAuthInstance } from '../services/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useAuth } from '../providers/AuthProvider';

export default function ProfileScreen() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const auth = getAuthInstance();

  const onSignup = async () => {
    try {
      if (!email || !pw) return Alert.alert('Missing', 'Email and password required.');
      await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pw);
      setEmail(''); setPw('');
      Alert.alert('Account created', 'Signed in.');
    } catch (e: any) {
      Alert.alert('Sign up failed', e?.message || 'Unknown error');
    }
  };
  const onSignin = async () => {
    try {
      if (!email || !pw) return Alert.alert('Missing', 'Email and password required.');
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pw);
      setEmail(''); setPw('');
      Alert.alert('Signed in', 'Welcome back!');
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message || 'Unknown error');
    }
  };
  const onSignout = async () => {
    try { await signOut(auth); Alert.alert('Signed out'); }
    catch (e: any) { Alert.alert('Error', e?.message || 'Unable to sign out'); }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={s.container}>
        <Text style={s.h1}>Profile</Text>

        <View style={s.card}>
          <Text style={s.label}>Status</Text>
          <Text style={s.value}>{user?.email ? user.email : 'Signed in anonymously'}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.MUTED_TEXT}
            autoCapitalize="none"
            keyboardType="email-address"
            style={s.input}
          />
          <Text style={s.label}>Password</Text>
          <TextInput
            value={pw}
            onChangeText={setPw}
            placeholder="••••••••"
            placeholderTextColor={colors.MUTED_TEXT}
            secureTextEntry
            style={s.input}
          />

          <View style={s.row}>
            <Pressable onPress={onSignin} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}>
              <Text style={s.btnText}>Sign In</Text>
            </Pressable>
            <Pressable onPress={onSignup} style={({ pressed }) => [s.btnOutline, pressed && { opacity: 0.9 }]}>
              <Text style={s.btnOutlineText}>Sign Up</Text>
            </Pressable>
          </View>
        </View>

        {user?.email && (
          <Pressable onPress={onSignout} style={({ pressed }) => [s.btnDanger, pressed && { opacity: 0.9 }]}>
            <Text style={s.btnText}>Sign Out</Text>
          </Pressable>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16, gap: 12 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },

  card: {
    backgroundColor: colors.SURFACE,
    borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12, padding: 14, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  value: { color: colors.TEXT, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: colors.CANVAS, color: colors.TEXT,
    borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },

  row: { flexDirection: 'row', gap: 12, marginTop: 6 },
  btn: { flex: 1, backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: colors.WHITE, fontWeight: '800' },
  btnOutline: { flex: 1, borderColor: colors.ORANGE, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnOutlineText: { color: colors.ORANGE, fontWeight: '800' },
  btnDanger: { backgroundColor: '#ff6b6b', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});
