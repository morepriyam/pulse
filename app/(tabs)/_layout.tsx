import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import PulseLogoIcon from "@/components/ui/PulseLogoIcon";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useFirstTimeOpen } from "@/hooks/useFirstTimeOpen";

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
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shorts"
        options={{
          title: "Shorts",
          tabBarIcon: ({ focused }) => (
            <PulseLogoIcon
              size={32}
              style={{
                opacity: focused ? 1 : 0.6,
                marginBottom: 0,
                alignSelf: "center",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              size={28}
              name="plus.circle.fill"
              color={color}
              style={{
                marginBottom: 0,
                alignSelf: "center",
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{
          title: "Subscriptions",
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="rectangle.stack.person.crop.fill"
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="person.crop.circle" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}