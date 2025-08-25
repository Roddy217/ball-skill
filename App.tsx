import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { StripeProvider } from "@stripe/stripe-react-native";
import { Ionicons } from "@expo/vector-icons";

import { auth } from "./services/firebase";
import { STRIPE_PUBLISHABLE_KEY } from "./services/stripe";

// Screens (ensure these files exist)
import DashboardScreen from "./screens/DashboardScreen";
import EventsScreen from "./screens/EventsScreen";
import RankingsScreen from "./screens/RankingsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import EarningsScreen from "./screens/EarningsScreen";
import LoginScreen from "./screens/LoginScreen";
import EventDetailsScreen from "./screens/EventDetailsScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#FF6600" />
    <Text style={styles.loadingText}>Loading Ball Skill...</Text>
  </View>
);

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap = "home";
        if (route.name === "Dashboard") iconName = focused ? "home" : "home-outline";
        else if (route.name === "Events") iconName = focused ? "basketball" : "basketball-outline";
        else if (route.name === "Rankings") iconName = focused ? "trophy" : "trophy-outline";
        else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
        else if (route.name === "Earnings") iconName = focused ? "wallet" : "wallet-outline";
        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: "#FF6600",
      tabBarInactiveTintColor: "#666",
      tabBarStyle: { backgroundColor: "#000", borderTopColor: "#333", borderTopWidth: 1 },
      headerStyle: { backgroundColor: "#111" },
      headerTintColor: "#fff",
      headerTitleStyle: { fontWeight: "bold" },
    })}
  >
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Events" component={EventsScreen} />
    <Tab.Screen name="Rankings" component={RankingsScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
    <Tab.Screen name="Earnings" component={EarningsScreen} />
  </Tab.Navigator>
);

const AppNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabs} />
    <Stack.Screen name="EventDetails" component={EventDetailsScreen} />
  </Stack.Navigator>
);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsub;
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
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  loadingText: { color: "#fff", marginTop: 10 },
});
