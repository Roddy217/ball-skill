import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import colors from './theme/colors';
import { AuthProvider, useAuth } from './providers/AuthProvider';

import DashboardScreen from './screens/DashboardScreen';
import EventsScreen from './screens/EventsScreen';
import RankingsScreen from './screens/RankingsScreen';
import ProfileScreen from './screens/ProfileScreen';
import EarningsScreen from './screens/EarningsScreen';
import AdminScreen from './screens/AdminScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import AppHeader from './components/AppHeader';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  const { user } = useAuth();
  const emailLc = (user?.email || '').toLowerCase();
  const isAdmin = ['admin@ballskill.com', 'support@ballskill.com'].includes(emailLc);

  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: colors.CANVAS }}
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.CANVAS },
        headerShadowVisible: true,
        headerTintColor: colors.TEXT,
        headerTitle: () => <AppHeader />,
        tabBarActiveTintColor: colors.ORANGE,
        tabBarInactiveTintColor: '#666',
        tabBarStyle: { backgroundColor: '#000', borderTopColor: '#333', borderTopWidth: 1 },
        tabBarIcon: ({ focused, color, size }) => {
          let icon: any = 'home-outline';
          if (route.name === 'Dashboard') icon = focused ? 'home' : 'home-outline';
          else if (route.name === 'Events') icon = focused ? 'basketball' : 'basketball-outline';
          else if (route.name === 'Rankings') icon = focused ? 'trophy' : 'trophy-outline';
          else if (route.name === 'Profile') icon = focused ? 'person' : 'person-outline';
          else if (route.name === 'Earnings') icon = focused ? 'wallet' : 'wallet-outline';
          else if (route.name === 'Admin') icon = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Rankings" component={RankingsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
      {isAdmin && <Tab.Screen name="Admin" component={AdminScreen} />}
    </Tab.Navigator>
  );
}

export default function App() {
  useEffect(() => {}, []);
  return (
    <AuthProvider>
      <NavigationContainer theme={{...DefaultTheme, colors: {...DefaultTheme.colors, background: colors.CANVAS}}}>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Root" component={Tabs} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: true, headerStyle: { backgroundColor: colors.CANVAS }, headerTintColor: colors.TEXT, title: 'Notifications' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}
