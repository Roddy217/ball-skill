import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInAnonymously } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    if (!email || !password) return Alert.alert('Missing info', 'Please enter email and password.');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged in App.tsx will navigate you to the tabs
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async () => {
    if (!email || !password) return Alert.alert('Missing info', 'Please enter email and password.');
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Automatically signed in after sign up
    } catch (e: any) {
      Alert.alert('Sign up failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!email) return Alert.alert('Missing email', 'Enter your email to receive a reset link.');
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Check your inbox', 'Password reset email sent.');
    } catch (e: any) {
      Alert.alert('Reset failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const onGuest = async () => {
    setBusy(true);
    try {
      await signInAnonymously(auth);
    } catch (e: any) {
      Alert.alert('Guest sign-in failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ball Skill</Text>
      <Text style={styles.subtitle}>Monetize Your Basketball Skills</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#7a7a7a"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#7a7a7a"
        />

        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.disabledBtn]}
          onPress={mode === 'login' ? onLogin : onSignup}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryText}>{mode === 'login' ? 'Log In' : 'Create Account'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          <Text style={styles.link}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onReset}>
          <Text style={styles.link}>Forgot password?</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.ghostBtn} onPress={onGuest} disabled={busy}>
          <Text style={styles.ghostText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ORANGE = '#FF6600';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 24, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  subtitle: { color: '#bbb', fontSize: 14, textAlign: 'center', marginBottom: 28 },
  form: { gap: 12 },
  label: { color: '#bbb', marginBottom: 4 },
  input: {
    backgroundColor: '#111',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#000', fontWeight: '700', fontSize: 16 },
  link: { color: ORANGE, textAlign: 'center', marginTop: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 18 },
  ghostBtn: { borderColor: '#333', borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  ghostText: { color: '#fff', fontWeight: '600' },
  disabledBtn: { opacity: 0.6 },
});
