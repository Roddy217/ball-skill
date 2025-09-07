import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function ProfileScreen() {
  return (
    <View style={s.container}>
      <Text style={s.h1}>Profile</Text>
      <Text style={s.p}>Login/logout and my stuff.</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  p: { color: colors.MUTED_TEXT, fontSize: 14 },
});
