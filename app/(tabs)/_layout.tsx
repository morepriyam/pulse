import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useFirstTimeOpen } from "@/hooks/useFirstTimeOpen";
import AntDesign from "@expo/vector-icons/AntDesign";
import Entypo from "@expo/vector-icons/Entypo";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isFirstTimeOpen, isLoading } = useFirstTimeOpen();
  if (isLoading) {
    return <></>;
  }
  if (isFirstTimeOpen) {
    return <Redirect href="/onboarding" />;
  }
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tabBarButtonColor,
        tabBarInactiveTintColor:
          Colors[colorScheme ?? "light"].tabBarButtonColor,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: "absolute",
            backgroundColor: "transparent",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Entypo name="home" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shorts"
        options={{
          title: "Shorts",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="pulse" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 25,
                backgroundColor:
                  Colors[colorScheme ?? "light"].tabBarButtonColorBg,
                justifyContent: "center",
                alignItems: "center",
                marginTop: 12,
              }}
            >
              <AntDesign name="plus" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{
          title: "Subscriptions",
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name="subscriptions" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="person-circle-outline" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
