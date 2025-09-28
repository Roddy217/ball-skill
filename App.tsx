import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { Ionicons } from '@expo/vector-icons';
import HeaderSignOut from './components/HeaderSignOut';
import { bank } from './services/balanceService';

const ORANGE = '#FF6600';

const DashboardScreen = require('./screens/DashboardScreen').default;
const EventsScreen = require('./screens/EventsScreen').default;
const AdminScreen = require('./screens/AdminScreen').default;
const ProfileScreen = require('./screens/ProfileScreen').default;
const EarningsScreen = require('./screens/EarningsScreen').default;

const Tab = createBottomTabNavigator();

function Tabs() {
  const { user, isAdmin } = useAuth() as any; // `isAdmin` may be undefined on non-admins

  // Log balance notifications for the signed‑in user only
  React.useEffect(() => {
    if (!user?.email) return;
    const myEmail = String(user.email).toLowerCase();
    const unsub = bank.subscribe(({ email, balanceCents, source }) => {
      if (email === myEmail) {
        console.log('[bank][notify][me]', email, balanceCents, source || '');
      }
    });
    return unsub;
  }, [user?.email]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerRight: () => <HeaderSignOut />,
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#000', borderTopColor: '#222' },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => {
          const map: Record<string, any> = {
            Dashboard: focused ? 'grid' : 'grid-outline',
            Events: focused ? 'trophy' : 'trophy-outline',
            Earnings: focused ? 'card' : 'card-outline',
            Profile: focused ? 'person' : 'person-outline',
            Admin: focused ? 'settings' : 'settings-outline',
          };
          const name = map[route.name] || (focused ? 'ellipse' : 'ellipse-outline');
          return <Ionicons name={name as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      {isAdmin && <Tab.Screen name="Admin" component={AdminScreen} />}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  // Global logger: any balance refresh for any user
  React.useEffect(() => {
    const unsub = bank.subscribe(({ email, balanceCents, source }) => {
      console.log('[bank][notify]', email, balanceCents, source || '');
    });
    return unsub;
  }, []);

  return (
    <NavigationContainer>
      <AuthProvider>
        <Tabs />
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