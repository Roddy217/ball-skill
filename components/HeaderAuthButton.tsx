import React, { useState } from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../providers/AuthProvider';

const ORANGE = '#FF6600';
const BORDER = '#2a2a2a';

export default function HeaderAuthButton() {
  const { user, signIn, signOut, resetPassword } = useAuth();
  const signedIn = !!user?.email;

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const doSignOut = () => {
    Alert.alert('Sign out', `Sign out of ${user?.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try { await signOut(); } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not sign out');
          }
        },
      },
    ]);
  };

  const doSignIn = async () => {
    if (!email || !pw) {
      Alert.alert('Missing info', 'Enter email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), pw);
      setOpen(false);
      setEmail('');
      setPw('');
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (!email) {
      Alert.alert('Enter email', 'Type your email, then tap “Forgot password”.');
      return;
    }
    try {
      await resetPassword(email.trim());
      Alert.alert('Check your email', 'Password reset link sent (if the account exists).');
    } catch (e: any) {
      Alert.alert('Reset failed', e?.message || 'Could not send reset email');
    }
  };

  // Render the small header button
  if (signedIn) {
    return (
      <View style={{ marginRight: 12 }}>
        <Pressable
          onPress={doSignOut}
          hitSlop={8}
          style={({ pressed }) => ({
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: ORANGE,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: ORANGE, fontWeight: '800' }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  // Signed out: show "Sign in" + a simple modal form
  return (
    <View style={{ marginRight: 12 }}>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => ({
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: ORANGE,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: ORANGE, fontWeight: '800' }}>Sign in</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => !busy && setOpen(false)}>
        <View style={{ flex:1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent:'center', padding:20 }}>
          <View style={{ backgroundColor:'#0f0f10', borderRadius:12, borderColor:BORDER, borderWidth:1, padding:16 }}>
            <Text style={{ color:'#fff', fontWeight:'900', fontSize:16, marginBottom:8 }}>Sign in</Text>

            <Text style={{ color:'#9a9a9a', fontSize:12, marginBottom:6 }}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@email.com"
              placeholderTextColor="#777"
              style={{
                color:'#fff', borderColor:BORDER, borderWidth:1, borderRadius:8,
                paddingHorizontal:10, paddingVertical:8, marginBottom:10,
                backgroundColor:'#121214',
              }}
              editable={!busy}
            />

            <Text style={{ color:'#9a9a9a', fontSize:12, marginBottom:6 }}>Password</Text>
            <TextInput
              value={pw}
              onChangeText={setPw}
              placeholder="••••••••"
              placeholderTextColor="#777"
              secureTextEntry
              style={{
                color:'#fff', borderColor:BORDER, borderWidth:1, borderRadius:8,
                paddingHorizontal:10, paddingVertical:8, marginBottom:14,
                backgroundColor:'#121214',
              }}
              editable={!busy}
            />

            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <Pressable onPress={doReset} disabled={busy} hitSlop={6}>
                <Text style={{ color:'#9a9a9a', textDecorationLine:'underline' }}>Forgot password</Text>
              </Pressable>

              <View style={{ flexDirection:'row', gap:8 }}>
                <Pressable
                  onPress={() => !busy && setOpen(false)}
                  disabled={busy}
                  style={{
                    paddingVertical:8, paddingHorizontal:12, borderRadius:8,
                    borderWidth:1, borderColor:BORDER,
                  }}
                >
                  <Text style={{ color:'#fff', fontWeight:'800' }}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={doSignIn}
                  disabled={busy}
                  style={{
                    paddingVertical:8, paddingHorizontal:12, borderRadius:8,
                    borderWidth:1, borderColor:ORANGE,
                    backgroundColor: busy ? 'transparent' : 'transparent',
                  }}
                >
                  {busy ? <ActivityIndicator color={ORANGE} /> : <Text style={{ color: ORANGE, fontWeight:'800' }}>Sign in</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
