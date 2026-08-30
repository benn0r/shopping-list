import { Image as ReactNativeImage } from 'react-native';
import {
  Button,
  Grid,
  Host,
  HStack,
  Image,
  List,
  ScrollView,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  accessibilityLabel,
  aspectRatio,
  backgroundOverlay,
  buttonStyle,
  clipShape,
  containerRelativeFrame,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  listStyle,
  multilineTextAlignment,
  padding,
  refreshable,
} from '@expo/ui/swift-ui/modifiers';
import { groceryIconForLabel } from '../services/groceryIcons';
import type { ListViewMode, ShoppingListItem } from '../types';

export type NativeCollectionItem = ShoppingListItem & { nativeKey?: string };

export type NativeItemCollectionProps = {
  items: NativeCollectionItem[];
  viewMode: ListViewMode;
  onPress: (item: NativeCollectionItem) => void;
  accessibilityLabelForItem: (item: NativeCollectionItem) => string;
  testIDPrefix?: string;
  onRefresh?: () => Promise<void>;
  emptyLabel?: string;
  fallback: React.ReactNode;
};

function amountLabel(item: ShoppingListItem) {
  if (item.quantity === undefined) return '';
  return item.unit ? `${item.quantity} ${item.unit} ` : `${item.quantity}× `;
}

function imageUri(item: ShoppingListItem) {
  if (item.imageUrl) return item.imageUrl;
  const source = groceryIconForLabel(item.label);
  return source ? ReactNativeImage.resolveAssetSource(source)?.uri : undefined;
}

function NativeProductImage({ item, size }: { item: ShoppingListItem; size: number }) {
  const uri = imageUri(item);
  return uri ? (
    <Image
      uiImage={uri}
      modifiers={[
        frame({ width: size, height: size }),
        aspectRatio({ ratio: 1, contentMode: 'fit' }),
        clipShape('roundedRectangle', 9),
      ]}
    />
  ) : (
    <Image
      systemName="basket.fill"
      color="#7A8583"
      modifiers={[frame({ width: size, height: size })]}
    />
  );
}

function NativeListRow({
  item,
  onPress,
  accessibilityText,
  testID,
}: {
  item: NativeCollectionItem;
  onPress: () => void;
  accessibilityText: string;
  testID: string;
}) {
  const detail = item.barcode.startsWith('manual:') ? '' : item.brand || item.barcode;
  return (
    <Button
      onPress={onPress}
      modifiers={[
        buttonStyle('plain'),
        accessibilityLabel(accessibilityText),
        accessibilityIdentifier(testID),
      ]}
    >
      <HStack spacing={12}>
        <NativeProductImage item={item} size={44} />
        <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: Infinity })]}>
          <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), lineLimit(2)]}>
            {amountLabel(item)}
            {item.label}
          </Text>
          {detail ? (
            <Text
              modifiers={[
                font({ textStyle: 'caption' }),
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                lineLimit(1),
              ]}
            >
              {detail}
            </Text>
          ) : null}
        </VStack>
        <Spacer />
        <Image systemName="chevron.right" size={12} color="#8E8E93" />
      </HStack>
    </Button>
  );
}

function NativeTile({
  item,
  onPress,
  accessibilityText,
  testID,
}: {
  item: NativeCollectionItem;
  onPress: () => void;
  accessibilityText: string;
  testID: string;
}) {
  const labelSize = item.label.length > 36 ? 11 : item.label.length > 22 ? 13 : 15;
  return (
    <Button
      onPress={onPress}
      modifiers={[
        buttonStyle('plain'),
        containerRelativeFrame({ axes: 'horizontal', count: 3, span: 1, spacing: 8 }),
        aspectRatio({ ratio: 1, contentMode: 'fit' }),
        backgroundOverlay({ color: '#F2F2F7' }),
        clipShape('roundedRectangle', 14),
        accessibilityLabel(accessibilityText),
        accessibilityIdentifier(testID),
      ]}
    >
      <VStack alignment="center" spacing={7} modifiers={[padding({ all: 8 })]}>
        <NativeProductImage item={item} size={38} />
        <Text
          modifiers={[
            font({ size: labelSize, weight: 'semibold' }),
            multilineTextAlignment('center'),
            lineLimit(3, { reservesSpace: true }),
          ]}
        >
          {amountLabel(item)}
          {item.label}
        </Text>
      </VStack>
    </Button>
  );
}

export function NativeItemCollection(props: NativeItemCollectionProps) {
  if (process.env.NODE_ENV === 'test') return props.fallback;
  const refreshModifiers = props.onRefresh ? [refreshable(props.onRefresh)] : [];
  if (props.viewMode === 'list') {
    return (
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <List modifiers={[listStyle('plain'), ...refreshModifiers]}>
          {props.items.length ? (
            props.items.map((item) => {
              const key = item.nativeKey || item.barcode;
              return (
                <NativeListRow
                  key={key}
                  item={item}
                  onPress={() => props.onPress(item)}
                  accessibilityText={props.accessibilityLabelForItem(item)}
                  testID={`${props.testIDPrefix || 'shopping-item'}-${item.barcode}`}
                />
              );
            })
          ) : props.emptyLabel ? (
            <Text
              modifiers={[
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                multilineTextAlignment('center'),
                padding(),
              ]}
            >
              {props.emptyLabel}
            </Text>
          ) : null}
        </List>
      </Host>
    );
  }

  const rows: NativeCollectionItem[][] = [];
  for (let index = 0; index < props.items.length; index += 3) {
    rows.push(props.items.slice(index, index + 3));
  }
  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <ScrollView modifiers={refreshModifiers}>
        <Grid horizontalSpacing={8} verticalSpacing={8} modifiers={[padding({ all: 12 })]}>
          {rows.map((row, rowIndex) => (
            <Grid.Row key={`row-${rowIndex}`}>
              {row.map((item) => {
                const key = item.nativeKey || item.barcode;
                return (
                  <NativeTile
                    key={key}
                    item={item}
                    onPress={() => props.onPress(item)}
                    accessibilityText={props.accessibilityLabelForItem(item)}
                    testID={`${props.testIDPrefix || 'shopping-item'}-${item.barcode}`}
                  />
                );
              })}
              {Array.from({ length: 3 - row.length }, (_, index) => (
                <Spacer key={`spacer-${index}`} />
              ))}
            </Grid.Row>
          ))}
        </Grid>
      </ScrollView>
    </Host>
  );
}
