import { Button, Host, ProgressView } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { NativeActionButtonProps } from './NativeActionButton';
import { ActivityIndicator, Pressable, Text } from 'react-native';

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
        {loading ? <ActivityIndicator /> : <Text>{title}</Text>}
      </Pressable>
    );
  }
  return (
    <Host
      matchContents={{ vertical: true, horizontal: false }}
      style={{ width: '100%', minHeight: 50 }}
      seedColor={color}
    >
      {loading ? (
        <ProgressView modifiers={[frame({ maxWidth: Infinity, minHeight: 44 })]} />
      ) : (
        <Button
          label={title}
          role={destructive ? 'destructive' : 'default'}
          onPress={onPress}
          modifiers={[
            buttonStyle('plain'),
            controlSize('large'),
            tint(color),
            disabledModifier(isDisabled),
            frame({ maxWidth: Infinity, minHeight: 44 }),
          ]}
        />
      )}
    </Host>
  );
}
