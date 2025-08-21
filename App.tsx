import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { onAuthStateChanged } from 'firebase/auth';
import { StripeProvider } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from './services/firebase';
import { STRIPE_PUBLISHABLE_KEY } from './services/stripe';
import DashboardScreen from './screens/DashboardScreen';
import EventsScreen from './screens/EventsScreen';
import RankingsScreen from './screens/RankingsScreen';
import ProfileScreen from './screens/ProfileScreen';
import EarningsScreen from './screens/EarningsScreen';
import LoginScreen from './screens/LoginScreen';
import EventDetailsScreen from './screens/EventDetailsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#FF6600" />
    <Text style={styles.loadingText}>Loading Ball Skill...</Text>
  </View>
);

const MainTabs = () => (
  <View style={styles.container}>
    <LinearGradient colors={['#f97316', '#ea580c']} style={styles.header}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>B</Text>
      </View>
      <Text style={styles.title}>Ball Skill</Text>
      <Text style={styles.subtitle}>Monetize Your Basketball Skills</Text>
    </LinearGradient>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Events') iconName = focused ? 'basketball' : 'basketball-outline';
          else if (route.name === 'Rankings') iconName = focused ? 'trophy' : 'trophy-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === 'Earnings') iconName = focused ? 'wallet' : 'wallet-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#FF6600',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: { backgroundColor: '#000000', borderTopColor: '#333333', borderTopWidth: 1 },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Rankings" component={RankingsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Earnings" component={EarningsScreen} />
    </Tab.Navigator>
  </View>
);

const AppNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabs} />
    <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
  </Stack.Navigator>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? <Stack.Screen name="Main" component={AppNavigator} /> : <Stack.Screen name="Login" component={LoginScreen} />}
        </Stack.Navigator>
      </NavigationContainer>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  loadingText: { color: '#FFFFFF', marginTop: 10 },
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: { color: '#FF6600', fontSize: 24, fontWeight: 'bold' },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#FFFFFF', fontSize: 16, opacity: 0.8 },
});
