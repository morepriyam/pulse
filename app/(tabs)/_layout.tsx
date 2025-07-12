import { Redirect, Tabs, router } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useFirstTimeOpen } from "@/hooks/useFirstTimeOpen";
import AntDesign from "@expo/vector-icons/AntDesign";

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
      {/* Commented out - Home Tab */}
      {/* <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarButton: HapticTab,
          tabBarIcon: ({ color, focused }) => (
            <Entypo name="home" size={24} color={color} />
          ),
        }}
      /> */}

      {/* Placeholder tab to maintain center positioning */}
      <Tabs.Screen
        name="index"
        options={{
          title: "",
          tabBarButton: () => null, // Hidden tab
          tabBarIcon: () => null,
        }}
      />

      {/* Commented out - Shorts Tab */}
      {/* <Tabs.Screen
        name="shorts"
        options={{
          title: "Shorts",
          tabBarButton: HapticTab,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="pulse" size={24} color={color} />
          ),
        }}
      /> */}

      {/* Placeholder tab to maintain center positioning */}
      <Tabs.Screen
        name="shorts"
        options={{
          title: "",
          tabBarButton: () => null, // Hidden tab
          tabBarIcon: () => null,
        }}
      />

      {/* ACTIVE - Create Button (+ button) */}
      <Tabs.Screen
        name="dummy-create"
        options={{
          title: "",
          tabBarIcon: ({ color }) => (
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
          // Prevent routing to a screen
          tabBarButton: (props) => (
            <HapticTab
              {...props}
              onPress={() => {
                router.push("/(camera)/shorts");
              }}
            />
          ),
        }}
      />

      {/* Commented out - Subscriptions Tab */}
      {/* <Tabs.Screen
        name="subscriptions"
        options={{
          title: "Subscriptions",
          tabBarButton: HapticTab,
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name="subscriptions" size={24} color={color} />
          ),
        }}
      /> */}

      {/* Placeholder tab to maintain center positioning */}
      <Tabs.Screen
        name="subscriptions"
        options={{
          title: "",
          tabBarButton: () => null, // Hidden tab
          tabBarIcon: () => null,
        }}
      />

      {/* Commented out - Profile Tab */}
      {/* <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButton: HapticTab,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="person-circle-outline" size={24} color={color} />
          ),
        }}
      /> */}

      {/* Placeholder tab to maintain center positioning */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "",
          tabBarButton: () => null, // Hidden tab
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}
