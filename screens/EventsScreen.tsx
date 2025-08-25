import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import { useStripe } from '@stripe/stripe-react-native';
import { API_BASE_URL } from '../services/api';

const ORANGE = '#FF6600';
const DARK = '#000';
const CARD = '#111';
const BORDER = '#2a2a2a';
const MUTED = '#9a9a9a';

type Challenge = '3PT' | 'FT' | '1v1';

export default function EventsScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [challenge, setChallenge] = useState<Challenge>('3PT');
  const [entryFee, setEntryFee] = useState(5);
  const [shots, setShots] = useState(25);
  const [loading, setLoading] = useState(false);

  const prizePool = useMemo(() => {
    const mult = challenge === '3PT' ? 4 : challenge === 'FT' ? 2 : 6;
    return Math.round(entryFee * 0.85 * mult * 100) / 100;
  }, [entryFee, challenge]);

  const joinEvent = async () => {
    try {
      setLoading(true);
      const amountCents = entryFee * 100;

      const res = await fetch(`${API_BASE_URL}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents,
          currency: 'usd',
          description: `Ball Skill - ${challenge} entry`
        })
      });

      const data = await res.json();
      if (!res.ok || !data?.clientSecret) {
        throw new Error(data?.error || 'Failed to create payment intent');
      }

      const init = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'Ball Skill',
      });
      if (init.error) throw new Error(init.error.message);

      const present = await presentPaymentSheet();
      if (present.error) throw new Error(present.error.message);

      Alert.alert('Success', 'You’ve joined the event! (Test mode)');
    } catch (err: any) {
      Alert.alert('Payment failed', err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.h1}>Join a Skill Event</Text>
      <Text style={s.sub}>Pick your challenge, draft your attempt plan, and enter.</Text>

      <View style={s.segment}>
        {(['3PT', 'FT', '1v1'] as Challenge[]).map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => setChallenge(opt)}
            style={[s.segmentBtn, challenge === opt && s.segmentBtnActive]}
          >
            <Text style={[s.segmentText, challenge === opt && s.segmentTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Your Draft</Text>
        <View style={s.row}>
          <Text style={s.label}>Shots Planned</Text>
          <View style={s.pill}><Text style={s.pillText}>{shots}</Text></View>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Entry Fee</Text>
          <View style={s.pill}><Text style={s.pillText}>${entryFee.toFixed(2)}</Text></View>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Projected Prize Pool</Text>
          <View style={[s.pill, { backgroundColor: '#0f2a14', borderColor: '#1f7a35' }]}>
            <Text style={[s.pillText, { color: '#54e18a' }]}>${prizePool.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={s.controlCard}>
        <Text style={s.controlTitle}>Adjust Entry & Attempts</Text>
        <Text style={s.sliderLabel}>Entry Fee: ${entryFee.toFixed(2)}</Text>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={1}
          maximumValue={20}
          step={1}
          minimumTrackTintColor={ORANGE}
          maximumTrackTintColor="#333"
          thumbTintColor={ORANGE}
          value={entryFee}
          onValueChange={setEntryFee}
        />
        <Text style={[s.sliderLabel, { marginTop: 16 }]}>Shots Planned: {shots}</Text>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={5}
          maximumValue={50}
          step={1}
          minimumTrackTintColor={ORANGE}
          maximumTrackTintColor="#333"
          thumbTintColor={ORANGE}
          value={shots}
          onValueChange={setShots}
        />
      </View>

      <TouchableOpacity style={[s.cta, loading && s.ctaDisabled]} onPress={joinEvent} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={s.ctaText}>Join {challenge} Event</Text>}
      </TouchableOpacity>

      <Text style={s.hint}>Test mode: use Stripe test cards like 4242 4242 4242 4242</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK, padding: 16, paddingTop: 22 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: MUTED, marginTop: 4, marginBottom: 14 },
  segment: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  segmentBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#161616' },
  segmentText: { color: MUTED, fontWeight: '700' },
  segmentTextActive: { color: ORANGE },
  card: {
    marginTop: 14,
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: { color: '#fff', fontWeight: '800', marginBottom: 8, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 6 },
  label: { color: MUTED },
  pill: {
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#151515',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { color: '#fff', fontWeight: '700' },
  controlCard: {
    marginTop: 14,
    backgroundColor: CARD,
    borderColor: BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  controlTitle: { color: '#fff', fontWeight: '800', marginBottom: 10 },
  sliderLabel: { color: MUTED, marginBottom: 6 },
  cta: {
    marginTop: 16,
    backgroundColor: ORANGE,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#000', fontWeight: '800', fontSize: 16 },
  hint: { color: MUTED, marginTop: 12, textAlign: 'center' },
});
