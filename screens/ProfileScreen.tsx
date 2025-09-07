import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Keyboard, TouchableWithoutFeedback, ScrollView } from 'react-native';
import colors from '../theme/colors';
import { getAuthInstance } from '../services/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, signInAnonymously } from 'firebase/auth';
import { useAuth } from '../providers/AuthProvider';
import { getUserRegistrations, getProfile, saveProfile, searchProfiles, seedProfiles } from '../services/api';
import PlayerBadge from '../components/PlayerBadge';
import { addNotification } from '../state/notify';

type SortKey = 'ALL' | 'UPCOMING' | 'NEAR' | 'PAST';

function niceAuthError(e: any): string {
  const code = (e?.code || '').toString();
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('missing-password')) return 'Please enter your password.';
  if (code.includes('user-not-found') || code.includes('wrong-password')) return 'Email and password did not match.';
  if (code.includes('email-already-in-use')) return 'That email is already registered. Try signing in.';
  if (code.includes('weak-password')) return 'Please choose a stronger password.';
  return 'We couldn’t complete that request. Please try again.';
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const auth = getAuthInstance();

  const loggedIn = !!user?.email;
  const emailLc = (user?.email || '').toLowerCase();
  const lastLogin = user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '—';

  const [regs, setRegs] = useState<any[]>([]);
  const [sort, setSort] = useState<SortKey>('ALL');
  const [q, setQ] = useState('');

  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);

  // Admin helpers (will move to Admin Dev > Profiles later)
  const [adminEmailQ, setAdminEmailQ] = useState('');
  const [adminCandidates, setAdminCandidates] = useState<any[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const isAdmin = ['admin@ballskill.com','support@ballskill.com'].includes(emailLc);

  useEffect(() => {
    (async () => {
      if (!emailLc) { setRegs([]); setProfile(null); return; }
      const [r, p] = await Promise.all([getUserRegistrations(emailLc), getProfile(emailLc)]);
      setRegs(r);
      if (!p) {
        const created = await saveProfile({
          email: emailLc,
          displayName: emailLc.split('@')[0],
          verified: false,
          team: '',
          position: '',
          league: '',
          jersey: '',
          rank: 1000,
          rankDelta: 0,
          type: 'adult',
          skillPercents: {},
        });
        setProfile(created?.profile || null);
      } else {
        setProfile(p);
      }
    })();
  }, [emailLc]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAdmin) return;
      const list = await searchProfiles(adminEmailQ.trim().toLowerCase());
      if (active) setAdminCandidates(list);
    })();
    return () => { active = false; };
  }, [adminEmailQ, isAdmin]);

  const onSignup = async () => {
    try {
      if (!email || !pw) return Alert.alert('Missing info', 'Email and password are required.');
      await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), pw);
      setEmail(''); setPw('');
      Alert.alert('Welcome!', 'Your account has been created.');
    } catch (e: any) {
      Alert.alert('Sign up failed', niceAuthError(e));
    }
  };
  const onSignin = async () => {
    try {
      if (!email || !pw) return Alert.alert('Missing info', 'Email and password are required.');
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), pw);
      setEmail(''); setPw('');
    } catch (e: any) {
      Alert.alert('Sign in failed', niceAuthError(e));
    }
  };
  const onSignout = async () => {
    try { await signOut(auth); addNotification({ title: 'Signed out', body: emailLc }); }
    catch (e: any) { Alert.alert('Sign out failed', niceAuthError(e)); }
  };
  const onGuest = async () => {
    try { await signInAnonymously(auth); Alert.alert('Guest mode', 'You are browsing as a guest.'); }
    catch (e: any) { Alert.alert('Guest sign-in failed', niceAuthError(e)); }
  };
  const onForgot = async () => {
    try {
      if (!email) return Alert.alert('Enter your email', 'Type your email above, then tap Forgot password.');
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      Alert.alert('Check your email', 'We sent password reset instructions.');
    } catch (e: any) { Alert.alert('Reset failed', niceAuthError(e)); }
  };

  const list = filteredRegs(regs, sort, q);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView style={s.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={s.h1}>Profile</Text>

        {loggedIn && profile && (
          <View style={s.card}>
            <PlayerBadge
              displayName={profile.displayName || emailLc}
              verified={!!profile.verified}
              avatarUrl={profile.avatarUrl}
              team={profile.team}
              position={profile.position}
              league={profile.league}
              jersey={profile.jersey}
              rank={profile.rank}
              rankDelta={profile.rankDelta}
              onMessage={() => {}}
            />
          </View>
        )}

        <View style={s.card}>
          <Text style={s.label}>Status</Text>
          <Text style={s.value}>{loggedIn ? user?.email : 'Not signed in'}</Text>
          <Text style={s.label}>Last login</Text>
          <Text style={s.value}>{lastLogin}</Text>
        </View>

        {!loggedIn ? (
          <View style={s.card}>
            <Text style={s.label}>Email</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.MUTED_TEXT} autoCapitalize="none" keyboardType="email-address" style={s.input} />
            <Text style={s.label}>Password</Text>
            <TextInput value={pw} onChangeText={setPw} placeholder="••••••••" placeholderTextColor={colors.MUTED_TEXT} secureTextEntry style={s.input} />
            <View style={s.row}>
              <Pressable onPress={onSignin} style={({ pressed }) => [s.btn, pressed && { opacity: 0.9 }]}><Text style={s.btnText}>Sign In</Text></Pressable>
              <Pressable onPress={onSignup} style={({ pressed }) => [s.btnOutline, pressed && { opacity: 0.9 }]}><Text style={s.btnOutlineText}>Sign Up</Text></Pressable>
            </View>
            <View style={s.row}>
              <Pressable onPress={onGuest} style={({ pressed }) => [s.btnMini, pressed && { opacity: 0.9 }]}><Text style={s.btnMiniTxt}>Continue as Guest</Text></Pressable>
              <Pressable onPress={onForgot} style={({ pressed }) => [s.btnMiniOutline, pressed && { opacity: 0.9 }]}><Text style={s.btnMiniOutlineTxt}>Forgot Password</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={onSignout} style={({ pressed }) => [s.btnDanger, pressed && { opacity: 0.9 }]}><Text style={s.btnText}>Sign Out</Text></Pressable>
        )}

        {/* Self Edit */}
        {loggedIn && profile && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.label}>Edit Profile</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {editing && (
                  <Pressable
                    onPress={async () => {
                      const out = await saveProfile({ ...profile, email: emailLc });
                      if (out?.success) Alert.alert('Saved', 'Profile updated.');
                      else Alert.alert('Error', 'Could not save profile.');
                    }}
                    style={({pressed})=>[s.btnMini, pressed&&{opacity:0.9}]}
                  >
                    <Text style={s.btnMiniTxt}>Save</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setEditing(e => !e)} style={({pressed})=>[s.btnMiniOutline, pressed&&{opacity:0.9}]}>
                  <Text style={s.btnMiniOutlineTxt}>{editing ? 'Close' : 'Edit'}</Text>
                </Pressable>
              </View>
            </View>
            {editing && (
              <>
                {renderProfileEditor(profile, setProfile, { isAdmin })}
                <Pressable
                  onPress={async () => {
                    const out = await saveProfile({ ...profile, email: emailLc });
                    if (out?.success) Alert.alert('Saved', 'Profile updated.');
                    else Alert.alert('Error', 'Could not save profile.');
                  }}
                  style={({pressed})=>[s.btn, pressed&&{opacity:0.9}]}
                >
                  <Text style={s.btnText}>Save</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* Admin helpers (temporary here; moving to Admin Dev > Profiles soon) */}
        {isAdmin && (
          <View style={s.card}>
            <Text style={s.label}>Admin: Edit Any Profile</Text>
            <TextInput value={adminEmailQ} onChangeText={setAdminEmailQ} placeholder="search email or name" placeholderTextColor={colors.MUTED_TEXT} style={s.input} autoCapitalize="none" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {adminCandidates.map((c:any) => (
                <Pressable key={c.email} onPress={async () => {
                  const p = await getProfile(c.email);
                  if (p) setProfile(p);
                  else {
                    const created = await saveProfile({ email: c.email, displayName: c.email.split('@')[0], type: 'adult' });
                    setProfile(created?.profile || null);
                  }
                  setEditing(true);
                }} style={({pressed})=>[cs.chip, pressed && {opacity:0.9}]}>
                  <Text style={cs.txt}>{c.displayName}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: 12 }} />
            <Pressable
              onPress={async () => {
                setIsSeeding(true);
                try {
                  const r = await seedProfiles();
                  Alert.alert('Seeded (demo)', 'Created demo profiles and granted credits.\nNote: demo data is temporary.');
                } finally { setIsSeeding(false); }
              }}
              disabled={isSeeding}
              style={({pressed})=>[s.btnOutline, pressed&&{opacity:0.9}]}
            >
              <Text style={s.btnOutlineText}>{isSeeding ? 'Seeding…' : 'Seed demo profiles + credits'}</Text>
            </Pressable>
            <Text style={{ color: colors.MUTED_TEXT, marginTop: 6 }}>
              Tips: Demo profiles include: youth1@…, teens1@…, adult1@…, elite1@…, pro1@… . Use them to test joins and payouts. Demo credits and seeded data reset on server restart.
            </Text>
          </View>
        )}

        {/* My Events */}
        <View style={s.card}>
          <Text style={s.label}>My Events</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Chip label="All" active={sort==='ALL'} onPress={()=>setSort('ALL')} />
            <Chip label="Upcoming" active={sort==='UPCOMING'} onPress={()=>setSort('UPCOMING')} />
            <Chip label="Near" active={sort==='NEAR'} onPress={()=>setSort('NEAR')} />
            <Chip label="Past" active={sort==='PAST'} onPress={()=>setSort('PAST')} />
            <TextInput value={q} onChangeText={setQ} placeholder="filter" placeholderTextColor={colors.MUTED_TEXT} style={s.filterBox} returnKeyType="search" />
          </View>
          <View style={{ height: 8 }} />
          {list.map((row) => {
            const ev = row.event;
            const date = new Date(ev.dateISO);
            return (
              <View key={row.eventId} style={s.item}>
                <Text style={s.itemTitle}>{ev.name}</Text>
                <Text style={s.itemSub}>{ev.locationType} • {date.toLocaleString()}</Text>
              </View>
            );
          })}
          {list.length === 0 && <Text style={{ color: colors.MUTED_TEXT, marginTop: 4 }}>No events to show.</Text>}
        </View>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

function filteredRegs(regs: any[], sort: SortKey, q: string) {
  const now = Date.now();
  const NEAR_MS = 72 * 60 * 60 * 1000;
  const lc = q.trim().toLowerCase();
  let rows = regs.filter(r => !lc || (r?.event?.name||'').toLowerCase().includes(lc) || (r?.event?.locationType||'').toLowerCase().includes(lc));
  rows = rows.filter(r => !!r.event);
  if (sort === 'UPCOMING') rows = rows.filter(r => new Date(r.event.dateISO).getTime() >= now);
  if (sort === 'PAST') rows = rows.filter(r => new Date(r.event.dateISO).getTime() < now);
  if (sort === 'NEAR') rows = rows.filter(r => { const t = new Date(r.event.dateISO).getTime(); return t >= now && (t - now) <= NEAR_MS; });
  rows.sort((a, b) => new Date(a.event.dateISO).getTime() - new Date(b.event.dateISO).getTime());
  return rows;
}

function renderProfileEditor(profile: any, setProfile: (p:any)=>void, opts: { isAdmin: boolean }) {
  const set = (k: string, v: any) => setProfile({ ...profile, [k]: v });
  const { isAdmin } = opts;
  return (
    <View style={{ gap: 8 }}>
      <L label="Display name"><I value={profile.displayName||''} onChangeText={v=>set('displayName', v)} /></L>
      <L label="Avatar URL (optional)"><I value={profile.avatarUrl||''} onChangeText={v=>set('avatarUrl', v)} autoCapitalize="none" /></L>
      <L label="Team"><I value={profile.team||''} onChangeText={v=>set('team', v)} /></L>
      <L label="Position"><I value={profile.position||''} onChangeText={v=>set('position', v)} /></L>
      <L label="League"><I value={profile.league||''} onChangeText={v=>set('league', v)} /></L>
      <L label="Jersey #"><I value={profile.jersey||''} onChangeText={v=>set('jersey', v)} keyboardType="number-pad" /></L>

      {/* Non-admin: simpler fields (Player type / Skill level) */}
      {!isAdmin ? (
        <>
          <L label="Player type (quick type)"><I value={profile.type||'adult'} onChangeText={v=>set('type', v.toLowerCase())} autoCapitalize="none" /></L>
          <L label="Skill level"><I value={(profile.skillPercents?.primary || '')} onChangeText={v=>set('skillPercents', { ...(profile.skillPercents||{}), primary: v })} /></L>
        </>
      ) : (
        <>
          <L label="Rank"><I value={String(profile.rank ?? '')} onChangeText={v=>set('rank', Number(v)||0)} keyboardType="number-pad" /></L>
          <L label="Rank Δ"><I value={String(profile.rankDelta ?? '')} onChangeText={v=>set('rankDelta', Number(v)||0)} keyboardType="number-pad" /></L>
          <L label="Type (youth/teens/adult/pro/elite…)"><I value={profile.type||'adult'} onChangeText={v=>set('type', v.toLowerCase())} autoCapitalize="none" /></L>
          <L label="Verified">
            <Pressable onPress={()=>set('verified', !profile.verified)} style={({pressed})=>[{ padding:10, borderRadius:8, borderWidth:1, borderColor: colors.BORDER, backgroundColor: profile.verified ? '#133015':'#0e0e10' }, pressed&&{opacity:0.9}]}>
              <Text style={{ color: profile.verified ? '#3DDC84' : colors.MUTED_TEXT }}>{profile.verified ? 'Yes' : 'No'}</Text>
            </Pressable>
          </L>
        </>
      )}

      {profile.email && <Text style={{ color: colors.MUTED_TEXT, fontSize: 12 }}>Editing: {profile.email}</Text>}
    </View>
  );
}

function L({ label, children }:{ label: string; children: React.ReactNode }) { return (<View><Text style={s.label}>{label}</Text>{children}</View>); }
function I(props: any) { return <TextInput {...props} placeholderTextColor={colors.MUTED_TEXT} style={s.input} />; }

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cs.chip, active && cs.active, pressed && { opacity: 0.9 }]}>
      <Text style={[cs.txt, active && cs.txtActive]}>{label}</Text>
    </Pressable>
  );
}

const cs = StyleSheet.create({
  chip: { backgroundColor: '#1b1b1e', borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  active: { backgroundColor: colors.ORANGE, borderColor: colors.ORANGE },
  txt: { color: colors.TEXT, fontSize: 12, fontWeight: '700' },
  txtActive: { color: colors.WHITE },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.CANVAS },
  h1: { color: colors.TEXT, fontWeight: '800', fontSize: 22, marginBottom: 8, paddingHorizontal: 16 },

  card: { backgroundColor: colors.SURFACE, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3, },

  label: { color: colors.MUTED_TEXT, fontSize: 12 },
  value: { color: colors.TEXT, fontSize: 14, fontWeight: '700' },

  input: { backgroundColor: colors.CANVAS, color: colors.TEXT, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, },

  row: { flexDirection: 'row', gap: 12, marginTop: 6 },
  btn: { flex: 1, backgroundColor: colors.ORANGE, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: colors.WHITE, fontWeight: '800' },
  btnOutline: { flex: 1, borderColor: colors.ORANGE, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnOutlineText: { color: colors.ORANGE, fontWeight: '800' },
  btnDanger: { backgroundColor: '#ff6b6b', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },

  btnMini: { borderColor: colors.ORANGE, borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  btnMiniTxt: { color: colors.ORANGE, fontWeight: '800', fontSize: 12 },
  btnMiniOutline: { borderColor: colors.BORDER, borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  btnMiniOutlineTxt: { color: colors.MUTED_TEXT, fontWeight: '800', fontSize: 12 },

  filterBox: { marginLeft: 'auto', backgroundColor: colors.CANVAS, color: colors.TEXT, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, width: 110, textAlign: 'center', },
  item: { backgroundColor: colors.CANVAS, borderColor: colors.BORDER, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, marginBottom: 8, },
  itemTitle: { color: colors.TEXT, fontWeight: '800' },
  itemSub: { color: colors.MUTED_TEXT, fontSize: 12 },
});
