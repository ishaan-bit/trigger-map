import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/utils/theme";

export function createTabOptions(iconName, label) {
  return {
    title: label,
    headerShown: false,
    tabBarStyle: {
      backgroundColor: palette.background,
      borderTopColor: palette.glassBorder,
      borderTopWidth: 1,
      height: 72,
      paddingTop: 8,
      paddingBottom: 12,
      elevation: 0,
    },
    tabBarActiveTintColor: palette.accent,
    tabBarInactiveTintColor: palette.muted,
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    tabBarIcon: ({ color, size }) => <Ionicons name={iconName} color={color} size={size - 2} />,
  };
}