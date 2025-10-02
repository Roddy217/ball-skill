import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

const ORANGE = '#FF6600';
const GREEN = '#16a34a';
const RED = '#ef4444';

export default function CreditsHelpCard() {
  return (
    <View style={s.card}>
      <Text style={s.title}>Credits & wallet tips</Text>
      <View style={{ gap: 6 }}>
        <Text style={s.item}>
          • Use{' '}
          <Text style={[s.tag, { color: ORANGE }]}>promo</Text>,{' '}
          <Text style={[s.tag, { color: ORANGE }]}>bonus</Text>,{' '}
          <Text style={[s.tag, { color: ORANGE }]}>demo</Text>,{' '}
          <Text style={[s.tag, { color: ORANGE }]}>signup</Text>,{' '}
          <Text style={[s.tag, { color: ORANGE }]}>referral</Text>{' '}
          to route credits into <Text style={{ color: ORANGE, fontWeight: '900' }}>$Skill</Text>.
        </Text>
        <Text style={s.item}>
          • Notes like <Text style={[s.tag, { color: GREEN }]}>prize</Text>,{' '}
          <Text style={[s.tag, { color: GREEN }]}>payout</Text>,{' '}
          <Text style={[s.tag, { color: GREEN }]}>purchase</Text>,{' '}
          <Text style={[s.tag, { color: GREEN }]}>won</Text>{' '}
          default to <Text style={{ color: GREEN, fontWeight: '900' }}>$Dollars</Text>.
        </Text>
        <Text style={s.item}>
          • Debits (join fees) show in <Text style={{ color: RED, fontWeight: '900' }}>red</Text>.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderColor: '#2a2a2a',
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  title: { color: colors.WHITE, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  item: { color: '#ddd', fontSize: 13, lineHeight: 18 },
  tag: { fontWeight: '900' },
});
