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
  loading,
}: NativeActionButtonProps) {
  const isDisabled = Boolean(disabled || loading);
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
    <Host style={{ width: '100%', height: 52 }} seedColor={destructive ? '#FF3B30' : '#237F78'}>
      {loading ? (
        <ProgressView modifiers={[frame({ maxWidth: Infinity, minHeight: 44 })]} />
      ) : (
        <Button
          label={title}
          role={destructive ? 'destructive' : 'default'}
          onPress={onPress}
          modifiers={[
            buttonStyle(destructive ? 'glass' : 'glassProminent'),
            controlSize('large'),
            tint(destructive ? '#FF3B30' : '#237F78'),
            disabledModifier(isDisabled),
            frame({ maxWidth: Infinity, minHeight: 44 }),
          ]}
        />
      )}
    </Host>
  );
}
