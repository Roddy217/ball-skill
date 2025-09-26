import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../providers/AuthProvider';

const ORANGE = '#FF6600', MUTED = '#9a9a9a', CARD = '#111', BORDER = '#2a2a2a';

export default function DashboardScreen() {
  const nav = useNavigation<any>();
  const { user, isAdmin } = useAuth();

  return (
    <View style={{ flex:1, backgroundColor:'#000', padding:16 }}>
      <Text style={s.h1}>Dashboard</Text>
      {user ? (
        <View style={s.card}>
          <Text style={s.title}>Welcome back</Text>
          <Text style={s.meta}>Signed in as <Text style={{color:'#fff'}}>{user.isAnonymous ? '(guest)' : user.email}</Text></Text>
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity style={[s.btn, { flex:1 }]} onPress={() => nav.navigate('Events')}>
              <Text style={s.btnText}>Browse Events</Text>
            </TouchableOpacity>
            {isAdmin ? (
              <TouchableOpacity style={[s.btnOutline, { flex:1 }]} onPress={() => nav.navigate('Admin')}>
                <Text style={s.btnOutlineText}>Go to Admin</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.btnOutline, { flex:1 }]} onPress={() => nav.navigate('Profile')}>
                <Text style={s.btnOutlineText}>Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.title}>Welcome</Text>
          <Text style={s.meta}>Sign in to join events, track results, and manage credits.</Text>
          <TouchableOpacity style={s.btn} onPress={() => nav.navigate('Profile')}>
            <Text style={s.btnText}>Sign in / Create account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnGhost} onPress={() => nav.navigate('Profile')}>
            <Text style={s.btnGhostText}>Continue as Guest (on Profile)</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  h1:{ color:'#fff', fontSize:22, fontWeight:'800' },
  card:{ backgroundColor: CARD, borderColor: BORDER, borderWidth:1, borderRadius:14, padding:14, marginTop:12 },
  title:{ color:'#fff', fontWeight:'800', fontSize:16, marginBottom:6 },
  meta:{ color:MUTED, marginBottom:8 },
  btn:{ backgroundColor: ORANGE, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:8 },
  btnText:{ color:'#000', fontWeight:'800' },
  btnOutline:{ borderColor: ORANGE, borderWidth:1.5, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:8 },
  btnOutlineText:{ color: ORANGE, fontWeight:'800' },
  btnGhost:{ borderColor:'#3a3a3a', borderWidth:1, borderRadius:12, paddingVertical:12, alignItems:'center', marginTop:8 },
  btnGhostText:{ color:'#ddd', fontWeight:'700' },
});
