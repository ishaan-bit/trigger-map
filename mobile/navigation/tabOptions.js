import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/utils/theme";

const TAB_BAR_CONTENT_HEIGHT = 56;
const TAB_BAR_INNER_PAD_TOP = 8;
const TAB_BAR_INNER_PAD_BOTTOM = 4;

export function createTabOptions(iconName, label, bottomInset = 0) {
  return {
    title: label,
    headerShown: false,
    tabBarStyle: {
      backgroundColor: palette.background,
      borderTopColor: palette.glassBorder,
      borderTopWidth: 1,
      height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_INNER_PAD_TOP + TAB_BAR_INNER_PAD_BOTTOM + bottomInset,
      paddingTop: TAB_BAR_INNER_PAD_TOP,
      paddingBottom: TAB_BAR_INNER_PAD_BOTTOM + bottomInset,
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