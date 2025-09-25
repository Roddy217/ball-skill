import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './providers/AuthProvider';

const ORANGE = '#FF6600';

const DashboardScreen = require('./screens/DashboardScreen').default;
const EventsScreen = require('./screens/EventsScreen').default;
const AdminScreen = require('./screens/AdminScreen').default;
const ProfileScreen = require('./screens/ProfileScreen').default;

const Tab = createBottomTabNavigator();

function Tabs() {
  const { isAdmin } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: ORANGE,
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#000', borderTopColor: '#222' },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      {isAdmin && <Tab.Screen name="Admin" component={AdminScreen} />}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
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
