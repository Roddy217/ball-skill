import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';
import { useNavigation } from '@react-navigation/native';

const LOGO_URI = 'https://images.squarespace-cdn.com/content/v1/686b2fd98b2e632b3af9a3cf/8c22ac79-9a12-4c5b-aba7-1a55b7cfb6bd/IMG_3025.jpeg?format=1500w';

export default function AppHeader() {
  const nav = useNavigation<any>();
  return (
    <View style={s.wrap}>
      {/* Left: logo */}
      <View style={s.left}>
        <Image source={{ uri: LOGO_URI }} style={s.logo} />
      </View>

      {/* Center: title */}
      <View style={s.center} pointerEvents="none">
        <Text style={s.title}>Ball Skill</Text>
      </View>

      {/* Right: bell */}
      <Pressable onPress={() => nav.navigate('Notifications')} style={({pressed})=>[s.right, pressed && {opacity:0.8}]}>
        <Ionicons name="notifications-outline" size={20} color={colors.WHITE} />
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { height: 44, justifyContent: 'center' },
  left: { position: 'absolute', left: 0, top: 0, bottom: 0, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  right: { position: 'absolute', right: 0, top: 0, bottom: 0, paddingHorizontal: 12, justifyContent: 'center' },

  logo: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#111' },
  title: { color: colors.TEXT, fontWeight: '900', fontSize: 16 },
});
