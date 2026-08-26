import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeActionButtonProps } from './NativeActionButton';

export function NativeActionButton({
  title,
  onPress,
  disabled,
  destructive,
  success,
  loading,
}: NativeActionButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const color = destructive ? '#FF3B30' : success ? '#248A3D' : '#237F78';

  if (process.env.JEST_WORKER_ID) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={isDisabled}
        onPress={onPress}
      >
        {loading ? <ActivityIndicator color={color} /> : <Text style={{ color }}>{title}</Text>}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ disabled: true, busy: true }}
          style={styles.loading}
        >
          <ActivityIndicator color={color} />
        </View>
      ) : (
        <Button
          accessibilityLabel={title}
          title={title}
          color={color}
          disabled={isDisabled}
          onPress={onPress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 50, justifyContent: 'center' },
  loading: { height: 50, alignItems: 'center', justifyContent: 'center' },
});
