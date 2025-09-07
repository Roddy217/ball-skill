import React from 'react';
import { View, StatusBar, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import colors from './theme/colors';
import EventsScreen from './screens/EventsScreen';
import RankingsScreen from './screens/RankingsScreen';
import EarningsScreen from './screens/EarningsScreen';
import ProfileScreen from './screens/ProfileScreen';
import AdminScreen from './screens/AdminScreen';
import { AuthProvider, useAuth } from './providers/AuthProvider';

const Tab = createBottomTabNavigator();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.CANVAS,
    card: colors.SURFACE,
    border: colors.BORDER,
    text: colors.TEXT,
    primary: colors.ORANGE,
  },
};

function Tabs() {
  const { user } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === 'admin@ballskill.com';

  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: colors.CANVAS }}
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.SURFACE,
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 5 },
          elevation: 5,
        },
        // gradient bg with thin orange line on bottom
        headerBackground: () => (
          <View style={{ flex: 1 }}>
            <LinearGradient
              style={{ flex: 1 }}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              colors={['#0d0d0f', '#151518', '#1b1b1e']}
            />
            <View style={styles.headerAccent} />
          </View>
        ),
        headerTintColor: colors.TEXT,
        headerTitleStyle: { color: colors.TEXT, fontWeight: '800' },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;
          if (route.name === 'Events') iconName = focused ? 'trophy' : 'trophy-outline';
          else if (route.name === 'Rankings') iconName = focused ? 'podium' : 'podium-outline';
          else if (route.name === 'Earnings') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          else if (route.name === 'Admin') iconName = focused ? 'settings' : 'settings-outline';
          else iconName = focused ? 'ellipse' : 'ellipse-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.ORANGE,
        tabBarInactiveTintColor: colors.MUTED_TEXT,
        tabBarStyle: {
          backgroundColor: colors.SURFACE,
          borderTopColor: colors.BORDER,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      })}
    >
      <Tab.Screen name="Events" component={EventsScreen} options={{ title: 'Events' }} />
      <Tab.Screen name="Rankings" component={RankingsScreen} options={{ title: 'Rankings' }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Earnings' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      {isAdmin && <Tab.Screen name="Admin" component={AdminScreen} options={{ title: 'Admin' }} />}
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <AuthProvider>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" />
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.CANVAS }} edges={['bottom']}>
            <View style={{ flex: 1, backgroundColor: colors.CANVAS }}>
              <Tabs />
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </AuthProvider>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerAccent: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 2,
    backgroundColor: colors.ORANGE,
  },
});
