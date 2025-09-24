import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import EventsScreen from './screens/EventsScreen';
import AdminScreen from './screens/AdminScreen';
import NetStatus from './components/NetStatus';
import AuthStatus from './components/AuthStatus';
import { AuthProvider } from './providers/AuthProvider';

const ORANGE = '#FF6600';

function HomeScreen() {
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <Text style={s.title}>Ball Skill</Text>
      <Text style={s.sub}>Home tab — shell OK ✅</Text>
      <NetStatus />
      <AuthStatus />
    </View>
  );
}

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = React.useState<Error | null>(null);
  if (err) {
    return (
      <View style={[s.container, { padding: 16 }]}>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.errMsg}>{String(err.message || err)}</Text>
      </View>
    );
  }
  return (
    <React.Suspense fallback={
      <View style={s.container}><Text style={s.sub}>Loading…</Text></View>
    }>
      <ErrorCatcher onError={setErr}>{children}</ErrorCatcher>
    </React.Suspense>
  );
}

function ErrorCatcher({ children, onError }: { children: React.ReactNode; onError: (e: Error)=>void }) {
  const ref = React.useRef(onError);
  ref.current = onError;
  React.useEffect(() => {
    const orig = console.error;
    console.error = (...args: any[]) => {
      try {
        const first = args?.[0];
        if (first instanceof Error) ref.current(first);
      } catch {}
      orig(...args);
    };
    return () => { console.error = orig; };
  }, []);
  return <>{children}</>;
}

const Tab = createBottomTabNavigator();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#000', card: '#000', text: '#fff', border: '#111' },
};

export default function App() {
  return (
    <NavigationContainer theme={theme}>
      <AuthProvider>
        <ErrorBoundary>
          <Tab.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle: { backgroundColor: '#000' },
              headerTintColor: '#fff',
              tabBarActiveTintColor: ORANGE,
              tabBarInactiveTintColor: '#888',
              tabBarStyle: { backgroundColor: '#000', borderTopColor: '#222' },
            }}
          >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Events" component={EventsScreen} />
            <Tab.Screen name="Admin" component={AdminScreen} />
          </Tab.Navigator>
        </ErrorBoundary>
      </AuthProvider>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  title: { color: ORANGE, fontSize: 28, fontWeight: '900' },
  sub: { color: '#fff', marginTop: 8, fontSize: 16 },
  errMsg: { color: '#fff', marginTop: 10 },
});
