import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { auth } from '../services/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInAnonymously,
} from 'firebase/auth';

const ORANGE = '#FF6600';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    try {
      setBusy(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      Alert.alert('Login failed', e?.message || 'Check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async () => {
    try {
      setBusy(true);
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      Alert.alert('Sign up failed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    try {
      if (!email.trim()) return Alert.alert('Enter email', 'Type your email above first.');
      setBusy(true);
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Check your email', 'Password reset sent.');
    } catch (e: any) {
      Alert.alert('Reset failed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onGuest = async () => {
    try {
      setBusy(true);
      try {
        // Preferred (enable in Firebase console):
        await signInAnonymously(auth);
        return;
      } catch {
        // Fallback demo account:
        await signInWithEmailAndPassword(auth, 'demo@ballskill.com', 'demo123');
      }
    } catch (e: any) {
      Alert.alert('Guest sign-in failed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const HEADER_OFFSET = Platform.OS === 'ios' ? 64 : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={HEADER_OFFSET}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="always"
      >
        <View style={s.card}>
          <Text style={s.h1}>{mode === 'login' ? 'Log In' : 'Sign Up'}</Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#666"
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#666"
          />

          <TouchableOpacity
            style={[s.btn, busy && s.btnDisabled]}
            disabled={busy}
            onPress={mode === 'login' ? onLogin : onSignup}
          >
            {busy ? (
              <ActivityIndicator />
            ) : (
              <Text style={s.btnText}>{mode === 'login' ? 'Log In' : 'Create Account'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} disabled={busy}>
            <Text style={s.link}>
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onReset} disabled={busy}>
            <Text style={s.link}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.ghostBtn} onPress={onGuest} disabled={busy}>
            <Text style={s.ghostText}>Continue as Guest</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 24 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  label: { color: '#9a9a9a', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#0c0c0c',
  },
  btn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontWeight: '800' },
  link: { color: ORANGE, textAlign: 'center', marginTop: 12 },
  divider: { height: 1, backgroundColor: '#1b1b1b', marginVertical: 16 },
  ghostBtn: { borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  ghostText: { color: '#fff', fontWeight: '700' },
});
