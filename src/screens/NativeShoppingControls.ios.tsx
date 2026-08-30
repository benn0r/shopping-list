import {
  Button,
  Host,
  HStack,
  Image,
  List,
  Picker,
  Section,
  Spacer,
  SwipeActions,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  environment,
  listStyle,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import type { ShoppingListDefinition, ShoppingSession, StoreDefinition } from '../types';

export type NativeShoppingControlsProps = {
  active: ShoppingSession | null;
  stores: StoreDefinition[];
  lists: ShoppingListDefinition[];
  selectedStoreId: string | null;
  selectedListIds: string[];
  storesAvailable: boolean;
  canStart: boolean;
  completedSessions: ShoppingSession[];
  labels: {
    store: string;
    shoppingLists: string;
    chooseStore: string;
    chooseList: string;
    startShopping: string;
    finishShopping: string;
    shoppingHistory: string;
    delete: string;
    createStoreFirst: string;
    itemCount: (count: number) => string;
  };
  formatDate: (value: number) => string;
  onSelectStore: (id: string) => void;
  onSelectLists: (ids: string[]) => void;
  onStart: () => void;
  onFinish: () => void;
  onOpenSession: (session: ShoppingSession) => void;
  onDeleteSession: (session: ShoppingSession) => void;
  fallback: React.ReactNode;
};

export function NativeShoppingControls(props: NativeShoppingControlsProps) {
  if (process.env.NODE_ENV === 'test') return props.fallback;
  return (
    <Host style={{ minHeight: props.active ? 250 : 360 }} useViewportSizeMeasurement>
      <List
        selection={props.active ? undefined : props.selectedListIds}
        onSelectionChange={(selection) => props.onSelectLists(selection.map(String))}
        modifiers={[
          listStyle('insetGrouped'),
          ...(props.active ? [] : [environment({ key: 'editMode', value: 'active' })]),
        ]}
      >
        {props.active ? (
          <Section>
            <Button
              label={props.labels.finishShopping}
              onPress={props.onFinish}
              modifiers={[buttonStyle('borderedProminent')]}
            />
          </Section>
        ) : (
          <Section
            footer={
              !props.storesAvailable ? <Text>{props.labels.createStoreFirst}</Text> : undefined
            }
          >
            <Picker
              label={props.labels.store}
              selection={props.selectedStoreId || ''}
              onSelectionChange={(id) => props.onSelectStore(id)}
              modifiers={[pickerStyle('menu'), accessibilityIdentifier('shopping-store-select')]}
            >
              <Text modifiers={[tag('')]}>{props.labels.chooseStore}</Text>
              {props.stores.map((store) => (
                <Text key={store.id} modifiers={[tag(store.id)]}>
                  {store.name}
                </Text>
              ))}
            </Picker>
            <Text modifiers={[font({ textStyle: 'headline' })]}>{props.labels.shoppingLists}</Text>
            {props.lists.map((list) => (
              <HStack
                key={list.id}
                modifiers={[tag(list.id), accessibilityIdentifier(`shopping-list-${list.id}`)]}
              >
                <Text>{list.name}</Text>
                <Spacer />
              </HStack>
            ))}
            <Button
              label={props.labels.startShopping}
              onPress={props.onStart}
              modifiers={[buttonStyle('borderedProminent'), disabled(!props.canStart)]}
            />
          </Section>
        )}
        <Section title={props.labels.shoppingHistory}>
          {props.completedSessions.map((session) => (
            <SwipeActions key={session.id}>
              <Button
                onPress={() => props.onOpenSession(session)}
                modifiers={[
                  buttonStyle('plain'),
                  accessibilityIdentifier(`shopping-history-${session.id}`),
                ]}
              >
                <HStack>
                  <VStack alignment="leading" spacing={2}>
                    <Text>{session.storeName}</Text>
                    <Text
                      modifiers={[
                        font({ textStyle: 'caption' }),
                        foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                      ]}
                    >
                      {props.formatDate(session.completedAt || session.startedAt)} ·{' '}
                      {props.labels.itemCount(session.purchasedItems.length)}
                    </Text>
                  </VStack>
                  <Spacer />
                  <Image systemName="chevron.right" size={12} color="#8E8E93" />
                </HStack>
              </Button>
              <SwipeActions.Actions>
                <Button
                  label={props.labels.delete}
                  role="destructive"
                  systemImage="trash"
                  onPress={() => props.onDeleteSession(session)}
                  modifiers={[accessibilityIdentifier(`delete-shopping-${session.id}`)]}
                />
              </SwipeActions.Actions>
            </SwipeActions>
          ))}
        </Section>
      </List>
    </Host>
  );
}
