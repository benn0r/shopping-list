import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

export type NativeActionButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
};

export function NativeActionButton({
  title,
  onPress,
  disabled,
  destructive,
  loading,
}: NativeActionButtonProps) {
  const color = destructive ? '#FF3B30' : '#237F78';
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
        <Text style={[styles.text, { color }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  text: { fontSize: 17, fontWeight: '400' },
  dim: { opacity: 0.42 },
});
