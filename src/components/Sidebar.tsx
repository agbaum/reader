import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";

const SIDEBAR_WIDTH = 270;

export interface SidebarItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
  items: SidebarItem[];
}

export function Sidebar({ visible, onClose, items }: SidebarProps) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
          mass: 0.8,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleItemPress = (item: SidebarItem) => {
    Haptics.selectionAsync();
    onClose();
    setTimeout(item.onPress, 180);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        </Animated.View>

        <Animated.View
          style={[
            styles.sidebar,
            {
              paddingTop: insets.top + 20,
              paddingBottom: insets.bottom + 24,
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.sidebarHeader}>
            <Text style={styles.appName}>Menu</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="x" size={20} color={Colors.light.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.items}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => handleItemPress(item)}
                style={({ pressed }) => [
                  styles.item,
                  pressed && { backgroundColor: Colors.light.surfaceAlt },
                ]}
              >
                <View style={styles.itemIcon}>
                  <Feather name={item.icon} size={17} color={Colors.light.accent} />
                </View>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Feather name="chevron-right" size={15} color={Colors.light.textTertiary} />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 16,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  appName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.separator,
    marginBottom: 12,
  },
  items: {
    gap: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.accentLight,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
});
