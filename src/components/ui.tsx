import { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol, SymbolViewProps } from 'expo-symbols';
import {
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
import { NativeActionButton } from './NativeActionButton';

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

const liquidGlassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

export function GlassSurface({
  children,
  fallbackColor = colors.secondaryGroupedBackground,
  ...props
}: ComponentProps<typeof GlassView> & { fallbackColor?: ColorValue }) {
  if (liquidGlassAvailable) {
    return (
      <GlassView glassEffectStyle="regular" {...props}>
        {children}
      </GlassView>
    );
  }
  return (
    <View {...props} style={[props.style, { backgroundColor: fallbackColor }]}>
      {children}
    </View>
  );
}

export function NativeIcon({
  ios,
  android,
  size = 24,
  color = colors.label,
  testID,
  weight = 'regular',
}: {
  ios: SFSymbol;
  android: string;
  size?: number;
  color?: ColorValue;
  testID?: string;
  weight?: SymbolViewProps['weight'];
}) {
  return (
    <SymbolView
      name={{ ios, android: android as never, web: android as never }}
      size={size}
      tintColor={color}
      weight={weight}
      type="hierarchical"
      style={{ width: size, height: size }}
      testID={testID}
    />
  );
}

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
      <GlassSurface style={styles.group} testID="native-section-surface">
        {children}
      </GlassSurface>
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
    <NativeIcon
      ios={direction === 'down' ? 'chevron.down' : 'chevron.right'}
      android={direction === 'down' ? 'keyboard_arrow_down' : 'chevron_right'}
      size={size + 4}
      color={color}
      weight="semibold"
      testID={`chevron-${direction}`}
    />
  );
}
export function CameraIcon({
  size = 27,
  color = '#FFFFFF',
}: {
  size?: number;
  color?: ColorValue;
}) {
  return (
    <NativeIcon
      ios="camera.fill"
      android="photo_camera"
      size={size}
      color={color}
      weight="semibold"
      testID="scan-button-icon"
    />
  );
}
export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={styles.fieldRow}>
      {label ? (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
          style={styles.fieldLabel}
        >
          {label}
        </Text>
      ) : null}
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
  return (
    <NativeActionButton
      title={title}
      onPress={onPress}
      disabled={disabled}
      destructive={destructive}
      loading={loading}
    />
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
      {trailing ??
        (selected ? (
          <NativeIcon ios="checkmark" android="check" size={20} color={colors.tint} />
        ) : null)}
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
  fieldLabel: { color: colors.label, fontSize: 17, width: 112 },
  input: { flex: 1, color: colors.label, fontSize: 17, paddingVertical: 11, textAlign: 'right' },
  placeholderInput: { textAlign: 'left' },
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
