import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function RankingsScreen() {
  return (
    <View style={s.container}>
      <Text style={s.p}>Leaderboards coming soon.</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS, padding: 16 },
  p: { color: colors.MUTED_TEXT, fontSize: 14 },
});
