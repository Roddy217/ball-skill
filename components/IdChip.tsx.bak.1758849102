import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';

const ORANGE = '#FF6600';

export default function IdChip({ id }: { id?: string }) {
  if (!id) return null;
  const onCopy = async () => {
    await Clipboard.setStringAsync(String(id));
    // non-intrusive: no Alert() to avoid shifting your layout
    console.log('Copied event id', id);
  };
  return (
    <View style={s.row} accessibilityRole="summary" accessibilityLabel={`Event ID ${id}`}>
      <Text style={s.label}>ID:</Text>
      <Text style={s.value} numberOfLines={1} selectable>{id}</Text>
      <TouchableOpacity onPress={onCopy} style={s.copyBtn} accessibilityRole="button">
        <Text style={s.copyText}>Copy</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row:{ flexDirection:'row', alignItems:'center', marginTop:8 },
  label:{ color:'#9a9a9a', fontSize:12, marginRight:6 },
  value:{ color:'#fff', fontSize:12, flex:1 },
  copyBtn:{ backgroundColor: ORANGE, paddingVertical:6, paddingHorizontal:10, borderRadius:8, marginLeft:8 },
  copyText:{ color:'#000', fontWeight:'800', fontSize:12 },
});
