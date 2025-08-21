import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  const handleSignup = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('Error creating user');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#f97316', '#ea580c']} style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>B</Text>
        </View>
        <Text style={styles.title}>Ball Skill Login</Text>
      </LinearGradient>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <LinearGradient colors={['#f97316', '#ea580c']} style={styles.buttonGradient}>
          <Text style={styles.buttonText}>Login</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleSignup}>
        <LinearGradient colors={['#f97316', '#ea580c']} style={styles.buttonGradient}>
          <Text style={styles.buttonText}>Signup</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#FFFFFF' },
  header: { padding: 40, alignItems: 'center' },
  logo: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  logoText: { color: '#FF6600', fontSize: 24, fontWeight: 'bold' },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold' },
  input: { padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#000000', borderRadius: 5 },
  button: { borderRadius: 12, overflow: 'hidden', marginTop: 10 },
  buttonGradient: { paddingVertical: 16, paddingHorizontal: 32 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  error: { color: 'red', marginBottom: 10 },
});

export default LoginScreen;
