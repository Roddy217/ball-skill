import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

export default function PlayerBadge({
  displayName,
  verified,
  avatarUrl,
  team,
  position,
  league,
  jersey,
  rank,
  rankDelta,
  onMessage,
}:{
  displayName: string;
  verified?: boolean;
  avatarUrl?: string;
  team?: string;
  position?: string;
  league?: string;
  jersey?: string | number;
  rank?: number;
  rankDelta?: number;
  onMessage?: () => void;
}) {
  const up = (rankDelta ?? 0) > 0;
  const dn = (rankDelta ?? 0) < 0;
  const deltaAbs = Math.abs(rankDelta ?? 0);

  const initials = (displayName || '').trim()
    .split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase()||'').join('') || 'P';
  const showLetter = !avatarUrl;
  const uri = avatarUrl || '';

  return (
    <View style={s.wrap}>
      <View style={s.avatarWrap}>
        {showLetter ? (
          <View style={s.letterAvatar}><Text style={s.letterText}>{initials}</Text></View>
        ) : (
          <Image source={{ uri }} style={s.avatar} />
        )}
        {verified && (
          <View style={s.verified}>
            <Ionicons name="checkmark-circle" size={14} color="#3DDC84" />
          </View>
        )}
        {(up || dn) && (
          <View style={[s.deltaDot, up ? s.deltaUp : s.deltaDown]}>
            <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color="#fff" />
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{displayName}</Text>
        <Text style={s.meta} numberOfLines={1}>
          {[team, position, league, jersey ? `#${jersey}` : null].filter(Boolean).join(' • ')}
        </Text>
        <Text style={s.meta}>
          Rank: <Text style={s.rank}>{rank ?? '—'}</Text>
          {deltaAbs ? <Text style={up ? s.up : s.down}> {up?'+':'-'}{deltaAbs}</Text> : null}
        </Text>
      </View>

      <Pressable onPress={onMessage} disabled={!onMessage} style={({ pressed }) => [s.msgBtn, pressed && { opacity: 0.8 }]}>
        <Ionicons name="chatbubble-ellipses" size={18} color={colors.WHITE} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  avatarWrap: { width: 54, height: 54 },
  avatar: { width: 54, height: 54, borderRadius: 54/2 },
  letterAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#1f1f23', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#333' },
  letterText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  verified: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#0f0f11', borderRadius: 10, padding: 1 },
  deltaDot: { position: 'absolute', right: -6, top: -6, borderRadius: 10, padding: 2 },
  deltaUp: { backgroundColor: '#3DDC84' },
  deltaDown: { backgroundColor: '#ff6b6b' },
  name: { color: colors.TEXT, fontWeight: '800', fontSize: 14 },
  meta: { color: colors.MUTED_TEXT, fontSize: 12 },
  rank: { color: colors.TEXT, fontWeight: '900' },
  up: { color: '#3DDC84', fontWeight: '900' },
  down: { color: '#ff6b6b', fontWeight: '900' },
  msgBtn: { backgroundColor: colors.ORANGE, padding: 10, borderRadius: 10 },
});
