import { Button, Host, HStack, Image, Spacer, Text } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  buttonStyle,
  font,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';

export type NativePageHeaderProps = {
  title: string;
  accessibilityText?: string;
  testID?: string;
  onPress?: () => void;
  fallback: React.ReactNode;
};

export function NativePageHeader(props: NativePageHeaderProps) {
  if (process.env.NODE_ENV === 'test') return props.fallback;
  const content = (
    <HStack modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
      <Text modifiers={[font({ textStyle: 'largeTitle', weight: 'bold' })]}>{props.title}</Text>
      {props.onPress ? (
        <>
          <Spacer />
          <Image systemName="chevron.down.circle.fill" size={22} color="#248A82" />
        </>
      ) : null}
    </HStack>
  );
  return (
    <Host style={{ height: 64 }} matchContents>
      {props.onPress ? (
        <Button
          onPress={props.onPress}
          modifiers={[
            buttonStyle('plain'),
            padding({ horizontal: 20, vertical: 8 }),
            accessibilityLabel(props.accessibilityText || props.title),
            ...(props.testID ? [accessibilityIdentifier(props.testID)] : []),
          ]}
        >
          {content}
        </Button>
      ) : (
        <HStack modifiers={[padding({ horizontal: 20, vertical: 8 })]}>{content}</HStack>
      )}
    </Host>
  );
}
