import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../providers/AuthProvider';

const ORANGE = '#FF6600';
const MUTED = '#9a9a9a';

export default function AuthStatus() {
  const { user, loading, error, signInAnon, signOut } = useAuth();

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Auth</Text>
      {loading ? (
        <Text style={s.meta}>Checking session…</Text>
      ) : user ? (
        <>
          <Text style={s.meta}>
            {`Signed in • uid: ${user.uid}${user.isAnonymous ? ' (anon)' : ''}`}
          </Text>
          <TouchableOpacity style={s.btn} onPress={signOut}>
            <Text style={s.btnText}>Sign out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.meta}>Not signed in</Text>
          <TouchableOpacity style={s.btn} onPress={signInAnon}>
            <Text style={s.btnText}>Sign in (Anonymous)</Text>
          </TouchableOpacity>
          <Text style={s.hint}>
            Tip: If this fails, enable Anonymous provider in Firebase Console.
          </Text>
        </>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 24, width: '100%', paddingHorizontal: 24 },
  title: { color: '#fff', fontWeight: '800', marginBottom: 8 },
  meta: { color: MUTED, marginBottom: 10, fontSize: 12 },
  hint: { color: MUTED, marginTop: 8, fontSize: 11 },
  error: { color: '#ff6666', marginTop: 8, fontSize: 12 },
  btn: { backgroundColor: ORANGE, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { color: '#000', fontWeight: '800' },
});
