import { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  DynamicColorIOS,
  Platform,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import type { ColorValue } from 'react-native';

const adaptive = (light: string, dark: string) =>
  Platform.OS === 'ios' ? DynamicColorIOS({ light, dark }) : light;
const system = (iosName: string, fallback: string) =>
  Platform.OS === 'ios' ? PlatformColor(iosName) : fallback;

export const colors = {
  tint: adaptive('#237F78', '#72D5CA'),
  brand: adaptive('#56B5AA', '#72D5CA'),
  destructive: system('systemRedColor', '#FF3B30'),
  label: system('labelColor', '#171717'),
  secondaryLabel: adaptive('#667370', '#A7B1AF'),
  tertiaryLabel: adaptive('#89928F', '#7E8986'),
  separator: adaptive('#D5E0DD', '#394946'),
  systemBackground: adaptive('#FFFFFF', '#121817'),
  secondarySystemBackground: adaptive('#EDF5F3', '#202B29'),
  systemGroupedBackground: adaptive('#F2F8F6', '#101615'),
  secondaryGroupedBackground: adaptive('#FFFFFF', '#1B2422'),
  bar: adaptive('rgba(248,253,251,0.96)', 'rgba(24,33,31,0.96)'),
  errorBackground: adaptive('#FDE9EB', '#4B1C21'),
  successBackground: adaptive('#E3F5F0', '#133A34'),
  success: adaptive('#237F62', '#72D5B0'),
};

export function LargeTitle({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={styles.largeTitle}>
      {children}
    </Text>
  );
}
export function Section({
  title,
  footer,
  children,
}: PropsWithChildren<{ title?: string; footer?: string }>) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}
export function Separator() {
  return <View style={styles.separator} />;
}
export function ChevronIcon({
  direction = 'right',
  size = 9,
  color = colors.tertiaryLabel,
}: {
  direction?: 'right' | 'down';
  size?: number;
  color?: ColorValue;
}) {
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderColor: color,
        transform: [{ rotate: direction === 'down' ? '45deg' : '-45deg' }],
      }}
      testID={`chevron-${direction}`}
    />
  );
}
export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={styles.fieldRow}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
        style={[styles.input, !label && styles.placeholderInput, props.style]}
        placeholderTextColor={colors.tertiaryLabel}
        selectionColor={colors.tint}
      />
    </View>
  );
}
export function ActionButton({
  title,
  onPress,
  disabled,
  destructive = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
}) {
  const color = destructive ? colors.destructive : colors.tint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dim]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.actionText, { color }]}>{title}</Text>
      )}
    </Pressable>
  );
}
export function ListRow({
  title,
  detail,
  selected,
  onPress,
  trailing,
  testID,
}: {
  title: string;
  detail?: string;
  selected?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  testID?: string;
}) {
  const content = (
    <>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {trailing ?? (selected ? <Text style={styles.check}>✓</Text> : null)}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View
      accessibilityState={{ selected }}
      aria-selected={selected}
      style={styles.listRow}
      testID={testID}
    >
      {content}
    </View>
  );
}
export function Notice({
  children,
  kind = 'error',
  testID,
}: PropsWithChildren<{ kind?: 'error' | 'success'; testID?: string }>) {
  return (
    <Text
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.notice, kind === 'success' ? styles.success : styles.error]}
      testID={testID}
    >
      {children}
    </Text>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.systemGroupedBackground },
  safe: { flex: 1, backgroundColor: colors.systemGroupedBackground },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 18 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  muted: { color: colors.secondaryLabel, fontSize: 15, lineHeight: 20 },
});
export const sheetModal = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' },
  sheet: {
    flex: 0,
    height: '92%',
    minHeight: '92%',
    backgroundColor: colors.systemGroupedBackground,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
});
const styles = StyleSheet.create({
  largeTitle: {
    color: colors.label,
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  section: { gap: 7 },
  sectionTitle: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    textTransform: 'uppercase',
    marginLeft: 16,
  },
  group: {
    backgroundColor: colors.secondaryGroupedBackground,
    borderRadius: 10,
    overflow: 'hidden',
  },
  footer: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginHorizontal: 16 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: 16,
  },
  fieldRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldLabel: { color: colors.label, fontSize: 17, width: 82 },
  input: { flex: 1, color: colors.label, fontSize: 17, paddingVertical: 11, textAlign: 'right' },
  placeholderInput: { textAlign: 'left' },
  action: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  actionText: { fontSize: 17, fontWeight: '400' },
  dim: { opacity: 0.42 },
  listRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  pressed: { backgroundColor: colors.secondarySystemBackground },
  rowText: { flex: 1, paddingVertical: 9 },
  rowTitle: { color: colors.label, fontSize: 17, lineHeight: 22 },
  rowDetail: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 17, marginTop: 1 },
  check: { color: colors.tint, fontSize: 20, fontWeight: '600' },
  chevron: { color: colors.tertiaryLabel, fontSize: 28, lineHeight: 28, fontWeight: '300' },
  notice: {
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    overflow: 'hidden',
  },
  error: { color: colors.destructive, backgroundColor: colors.errorBackground },
  success: { color: colors.success, backgroundColor: colors.successBackground },
});
