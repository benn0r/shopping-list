import { BottomSheet } from '@expo/ui';
import { RNHostView } from '@expo/ui/swift-ui';
import { Modal, View } from 'react-native';
import type { NativeSheetProps } from './NativeSheet';

export function NativeSheet({
  visible,
  onDismiss,
  fraction = 0.92,
  testID,
  contentTestID,
  style,
  children,
}: NativeSheetProps) {
  if (process.env.JEST_WORKER_ID) {
    return (
      <Modal visible={visible} onRequestClose={onDismiss} testID={testID}>
        <View
          style={[{ flex: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 }, style]}
          testID={contentTestID}
        >
          {children}
        </View>
      </Modal>
    );
  }
  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onDismiss}
      snapPoints={[{ fraction }]}
      showDragIndicator
      contentPadding={0}
      testID={testID}
    >
      <RNHostView>
        <View style={[{ flex: 1 }, style]} testID={contentTestID}>
          {children}
        </View>
      </RNHostView>
    </BottomSheet>
  );
}
