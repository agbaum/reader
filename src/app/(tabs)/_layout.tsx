import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import Colors from "@/constants/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        tabBarActiveTintColor: Colors.light.accent,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen
        name="feeds"
        options={{ href: null }}
      />
    </Tabs>
  );
}
