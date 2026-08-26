import type { PropsWithChildren } from 'react';
import { Modal, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassSurface, sheetModal } from './ui';

export type NativeSheetProps = PropsWithChildren<{
  visible: boolean;
  onDismiss: () => void;
  fraction?: number;
  testID?: string;
  contentTestID?: string;
  style?: StyleProp<ViewStyle>;
}>;

export function NativeSheet({
  visible,
  onDismiss,
  testID,
  contentTestID,
  style,
  children,
}: NativeSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onDismiss}
      testID={testID}
    >
      <View style={sheetModal.backdrop}>
        <GlassSurface style={[sheetModal.sheet, styles.surface, style]} testID={contentTestID}>
          {children}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({ surface: { overflow: 'hidden' } });
