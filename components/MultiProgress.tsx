import React from 'react';
import { View, StyleSheet } from 'react-native';

type Segment = { key: string; pct: number; color: string };

export default function MultiProgress({ segments, height = 8, radius = 6, bg = '#222' }:{
  segments: Segment[];
  height?: number;
  radius?: number;
  bg?: string;
}) {
  const norm = segments.filter(s => s.pct > 0);
  const total = norm.reduce((sum, s) => sum + s.pct, 0);
  const segs = total > 0 ? norm.map(s => ({ ...s, pct: s.pct / total })) : [];

  return (
    <View style={[styles.track, { height, borderRadius: radius, backgroundColor: bg }]}>
      {segs.map((s, i) => (
        <View key={s.key} style={{ flex: s.pct, backgroundColor: s.color, borderTopLeftRadius: i===0?radius:0, borderBottomLeftRadius: i===0?radius:0, borderTopRightRadius: i===segs.length-1?radius:0, borderBottomRightRadius: i===segs.length-1?radius:0 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', flexDirection: 'row' },
});
