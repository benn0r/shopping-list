import { useEffect } from 'react';
import {
  BottomSheet,
  Button,
  Form,
  HStack,
  Host,
  Link,
  Picker,
  SecureField,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  useNativeState,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  disabled,
  foregroundStyle,
  listStyle,
  presentationDetents,
  presentationDragIndicator,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type {
  AppLanguage,
  CustomBarcode,
  LabelStyle,
  ListViewMode,
  LookupPreferences,
  ProductLanguage,
  ProviderList,
  ShoppingListDefinition,
  StoreDefinition,
  SyncProviderId,
} from '../types';
import { useI18n } from '../i18n';

type Translate = ReturnType<typeof useI18n>['t'];

export type NativeSettingsViewProps = {
  t: Translate;
  appLanguage: AppLanguage;
  bringSyncEnabled: boolean;
  bringEmail: string;
  bringPassword: string;
  bringConnected: boolean;
  bringBusy: boolean;
  mealieEnabled: boolean;
  mealieBaseUrl: string;
  mealieToken: string;
  mealieConfigured: boolean;
  listViewMode: ListViewMode;
  shoppingLists: ShoppingListDefinition[];
  stores: StoreDefinition[];
  preferences: LookupPreferences;
  custom: CustomBarcode[];
  error: string;
  listEditorId: string | 'new' | null;
  listEditorName: string;
  listEditorProvider: SyncProviderId | null;
  listEditorRemoteId: string | null;
  storeEditorId: string | 'new' | null;
  storeEditorName: string;
  customBarcodesVisible: boolean;
  barcode: string;
  barcodeLabel: string;
  bringLists: ProviderList[];
  mealieLists: ProviderList[];
  appLanguages: { value: AppLanguage; name: string }[];
  productLanguages: { value: ProductLanguage; name: string }[];
  labelStyles: { value: LabelStyle; name: string; detail: string }[];
  databases: readonly { name: string; url: string }[];
  onBringEnabledChange: (value: boolean) => void;
  onBringEmailChange: (value: string) => void;
  onBringPasswordChange: (value: string) => void;
  onConnectBring: () => void;
  onDisconnectBring: () => void;
  onMealieEnabledChange: (value: boolean) => void;
  onMealieBaseUrlChange: (value: string) => void;
  onMealieTokenChange: (value: string) => void;
  onConnectMealie: () => void;
  onDisconnectMealie: () => void;
  onListViewModeChange: (value: ListViewMode) => void;
  onAppLanguageChange: (value: AppLanguage) => void;
  onProductLanguageChange: (value: ProductLanguage) => void;
  onLabelStyleChange: (value: LabelStyle) => void;
  onOpenList: (list: ShoppingListDefinition | null) => void;
  onListEditorNameChange: (value: string) => void;
  onListEditorSyncChange: (provider: SyncProviderId | null, remoteId: string | null) => void;
  onSaveList: () => void;
  onDeleteList: () => void;
  onCloseList: () => void;
  onOpenStore: (store: StoreDefinition | null) => void;
  onStoreEditorNameChange: (value: string) => void;
  onSaveStore: () => void;
  onDeleteStore: () => void;
  onCloseStore: () => void;
  onOpenCustomBarcodes: () => void;
  onCloseCustomBarcodes: () => void;
  onBarcodeChange: (value: string) => void;
  onBarcodeLabelChange: (value: string) => void;
  onAddCustomBarcode: () => void;
  onDeleteCustomBarcode: (value: string) => void;
};

const actionModifiers = (color: string, isDisabled = false) => [
  buttonStyle('plain' as const),
  foregroundStyle(color),
  tint(color),
  disabled(isDisabled),
];

function useSyncNativeText(state: ReturnType<typeof useNativeState<string>>, value: string) {
  useEffect(() => state.set(value), [state, value]);
}

export function NativeSettingsView(props: NativeSettingsViewProps) {
  const email = useNativeState(props.bringEmail);
  const password = useNativeState(props.bringPassword);
  const serverUrl = useNativeState(props.mealieBaseUrl);
  const token = useNativeState(props.mealieToken);
  const listName = useNativeState(props.listEditorName);
  const storeName = useNativeState(props.storeEditorName);
  const barcode = useNativeState(props.barcode);
  const barcodeLabel = useNativeState(props.barcodeLabel);
  useSyncNativeText(email, props.bringEmail);
  useSyncNativeText(password, props.bringPassword);
  useSyncNativeText(serverUrl, props.mealieBaseUrl);
  useSyncNativeText(token, props.mealieToken);
  useSyncNativeText(listName, props.listEditorName);
  useSyncNativeText(storeName, props.storeEditorName);
  useSyncNativeText(barcode, props.barcode);
  useSyncNativeText(barcodeLabel, props.barcodeLabel);

  const syncSelection = props.listEditorProvider
    ? `${props.listEditorProvider}:${props.listEditorRemoteId || ''}`
    : 'none';

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <Form modifiers={[listStyle('insetGrouped')]}>
        {props.error ? (
          <Section>
            <Text modifiers={[foregroundStyle('#FF3B30')]}>{props.error}</Text>
          </Section>
        ) : null}
        <Section footer={<Text>{props.t('bringSyncFooter')}</Text>}>
          <Toggle
            label={props.t('enableBringSync')}
            isOn={props.bringSyncEnabled}
            onIsOnChange={props.onBringEnabledChange}
          />
          {props.bringSyncEnabled ? (
            <>
              <TextField
                text={email}
                placeholder={props.t('email')}
                onTextChange={props.onBringEmailChange}
              />
              <SecureField
                text={password}
                placeholder={props.t('password')}
                onTextChange={props.onBringPasswordChange}
              />
              <Button
                label={props.t('connectBring')}
                onPress={props.onConnectBring}
                modifiers={actionModifiers('#248A3D', props.bringBusy)}
              />
              {props.bringConnected ? (
                <Button
                  label={props.t('disconnectBring')}
                  role="destructive"
                  onPress={props.onDisconnectBring}
                  modifiers={actionModifiers('#FF3B30', props.bringBusy)}
                />
              ) : null}
            </>
          ) : null}
        </Section>
        <Section footer={<Text>{props.t('mealieSyncFooter')}</Text>}>
          <Toggle
            label={props.t('enableMealieSync')}
            isOn={props.mealieEnabled}
            onIsOnChange={props.onMealieEnabledChange}
          />
          {props.mealieEnabled ? (
            <>
              <TextField
                text={serverUrl}
                placeholder={props.t('mealieServerUrl')}
                onTextChange={props.onMealieBaseUrlChange}
              />
              <SecureField
                text={token}
                placeholder={props.t('mealieApiToken')}
                onTextChange={props.onMealieTokenChange}
              />
              <Button
                label={props.t('connectMealie')}
                onPress={props.onConnectMealie}
                modifiers={actionModifiers('#248A3D')}
              />
              {props.mealieConfigured ? (
                <Button
                  label={props.t('disconnectMealie')}
                  role="destructive"
                  onPress={props.onDisconnectMealie}
                  modifiers={actionModifiers('#FF3B30')}
                />
              ) : null}
            </>
          ) : null}
        </Section>
        <Section title={props.t('listView')}>
          <Picker
            label={props.t('listView')}
            selection={props.listViewMode}
            onSelectionChange={(value) => props.onListViewModeChange(value as ListViewMode)}
          >
            <Text modifiers={[tag('list')]}>{props.t('list')}</Text>
            <Text modifiers={[tag('tiles')]}>{props.t('tiles')}</Text>
          </Picker>
        </Section>
        <Section title={props.t('appLanguage')}>
          <Picker
            label={props.t('appLanguage')}
            selection={props.appLanguage}
            onSelectionChange={(value) => props.onAppLanguageChange(value as AppLanguage)}
          >
            {props.appLanguages.map((option) => (
              <Text key={option.value} modifiers={[tag(option.value)]}>
                {option.name}
              </Text>
            ))}
          </Picker>
        </Section>
        <Section
          title={props.t('shoppingLists')}
          footer={<Text>{props.t('manageListsFooter')}</Text>}
        >
          {props.shoppingLists.map((list) => (
            <HStack key={list.id} alignment="center">
              <VStack alignment="leading">
                <Text>{list.name}</Text>
                <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                  {list.syncTarget
                    ? `${props.t(list.syncTarget.provider === 'bring' ? 'bringProvider' : 'mealieProvider')} · ${list.syncTarget.remoteListName}`
                    : props.t('notSynced')}
                </Text>
              </VStack>
              <Spacer />
              <Button
                label={props.t('edit')}
                onPress={() => props.onOpenList(list)}
                modifiers={actionModifiers('#237F78')}
              />
            </HStack>
          ))}
          <Button
            label={props.t('addList')}
            onPress={() => props.onOpenList(null)}
            modifiers={actionModifiers('#237F78')}
          />
        </Section>
        <Section
          title={props.t('storesSettings')}
          footer={<Text>{props.t('manageStoresFooter')}</Text>}
        >
          {props.stores.map((store) => (
            <HStack key={store.id} alignment="center">
              <Text>{store.name}</Text>
              <Spacer />
              <Button
                label={props.t('edit')}
                onPress={() => props.onOpenStore(store)}
                modifiers={actionModifiers('#237F78')}
              />
            </HStack>
          ))}
          <Button
            label={props.t('addStore')}
            onPress={() => props.onOpenStore(null)}
            modifiers={actionModifiers('#237F78')}
          />
        </Section>
        <Section
          title={props.t('productLanguage')}
          footer={<Text>{props.t('productLanguageFooter')}</Text>}
        >
          <Picker
            label={props.t('productLanguage')}
            selection={props.preferences.language}
            onSelectionChange={(value) => props.onProductLanguageChange(value as ProductLanguage)}
          >
            {props.productLanguages.map((option) => (
              <Text key={option.value} modifiers={[tag(option.value)]}>
                {option.name}
              </Text>
            ))}
          </Picker>
        </Section>
        <Section title={props.t('bringItemLabel')} footer={<Text>{props.t('labelFooter')}</Text>}>
          <Picker
            label={props.t('bringItemLabel')}
            selection={props.preferences.labelStyle}
            onSelectionChange={(value) => props.onLabelStyleChange(value as LabelStyle)}
          >
            {props.labelStyles.map((option) => (
              <Text key={option.value} modifiers={[tag(option.value)]}>
                {option.name}
              </Text>
            ))}
          </Picker>
        </Section>
        <Section>
          <Button
            label={props.t('customBarcodes')}
            onPress={props.onOpenCustomBarcodes}
            modifiers={actionModifiers('#237F78')}
          />
        </Section>
        <Section
          title={props.t('productDatabases')}
          footer={<Text>{props.t('databaseFooter')}</Text>}
        >
          {props.databases.map((database) => (
            <Link key={database.url} label={database.name} destination={database.url} />
          ))}
        </Section>
        <Section>
          <Text>{props.t('disclaimer')}</Text>
          <Link label={props.t('iconCredit')} destination="https://foodiconpack.com/license" />
        </Section>
      </Form>

      <BottomSheet
        isPresented={Boolean(props.listEditorId)}
        onIsPresentedChange={(shown) => !shown && props.onCloseList()}
        modifiers={[presentationDetents(['large']), presentationDragIndicator('visible')]}
      >
        <Form modifiers={[listStyle('insetGrouped')]}>
          <Section title={props.t(props.listEditorId === 'new' ? 'addList' : 'editList')}>
            <TextField
              text={listName}
              placeholder={props.t('listName')}
              onTextChange={props.onListEditorNameChange}
            />
          </Section>
          <Section title={props.t('syncWith')}>
            <Picker
              label={props.t('syncWith')}
              selection={syncSelection}
              onSelectionChange={(value) => {
                const selected = String(value);
                if (selected === 'none') props.onListEditorSyncChange(null, null);
                else {
                  const [provider, ...id] = selected.split(':');
                  props.onListEditorSyncChange(provider as SyncProviderId, id.join(':'));
                }
              }}
            >
              <Text modifiers={[tag('none')]}>{props.t('notSynced')}</Text>
              {props.bringLists.map((list) => (
                <Text
                  key={`bring:${list.id}`}
                  modifiers={[tag(`bring:${list.id}`)]}
                >{`Bring · ${list.name}`}</Text>
              ))}
              {props.mealieLists.map((list) => (
                <Text
                  key={`mealie:${list.id}`}
                  modifiers={[tag(`mealie:${list.id}`)]}
                >{`Mealie · ${list.name}`}</Text>
              ))}
            </Picker>
          </Section>
          <Section>
            <Button
              label={props.t(props.listEditorId === 'new' ? 'createList' : 'save')}
              onPress={props.onSaveList}
              modifiers={actionModifiers('#248A3D', !props.listEditorName.trim())}
            />
            {props.listEditorId !== 'new' ? (
              <Button
                label={props.t('deleteList')}
                role="destructive"
                onPress={props.onDeleteList}
                modifiers={actionModifiers('#FF3B30')}
              />
            ) : null}
            <Button
              label={props.t('cancel')}
              role="cancel"
              onPress={props.onCloseList}
              modifiers={actionModifiers('#237F78')}
            />
          </Section>
        </Form>
      </BottomSheet>

      <BottomSheet
        isPresented={Boolean(props.storeEditorId)}
        onIsPresentedChange={(shown) => !shown && props.onCloseStore()}
        modifiers={[presentationDetents(['medium']), presentationDragIndicator('visible')]}
      >
        <Form modifiers={[listStyle('insetGrouped')]}>
          <Section title={props.t(props.storeEditorId === 'new' ? 'addStore' : 'editStore')}>
            <TextField
              text={storeName}
              placeholder={props.t('storeName')}
              onTextChange={props.onStoreEditorNameChange}
            />
          </Section>
          <Section>
            <Button
              label={props.t(props.storeEditorId === 'new' ? 'createStore' : 'save')}
              onPress={props.onSaveStore}
              modifiers={actionModifiers('#248A3D', !props.storeEditorName.trim())}
            />
            {props.storeEditorId !== 'new' ? (
              <Button
                label={props.t('deleteStore')}
                role="destructive"
                onPress={props.onDeleteStore}
                modifiers={actionModifiers('#FF3B30')}
              />
            ) : null}
            <Button
              label={props.t('cancel')}
              role="cancel"
              onPress={props.onCloseStore}
              modifiers={actionModifiers('#237F78')}
            />
          </Section>
        </Form>
      </BottomSheet>

      <BottomSheet
        isPresented={props.customBarcodesVisible}
        onIsPresentedChange={(shown) => !shown && props.onCloseCustomBarcodes()}
        modifiers={[presentationDetents(['large']), presentationDragIndicator('visible')]}
      >
        <Form modifiers={[listStyle('insetGrouped')]}>
          <Section
            title={props.t('addCustomBarcode')}
            footer={<Text>{props.t('customFooter')}</Text>}
          >
            <TextField
              text={barcode}
              placeholder={props.t('barcode')}
              onTextChange={props.onBarcodeChange}
            />
            <TextField
              text={barcodeLabel}
              placeholder={props.t('itemLabel')}
              onTextChange={props.onBarcodeLabelChange}
            />
            <Button
              label={props.t('saveCustom')}
              onPress={props.onAddCustomBarcode}
              modifiers={actionModifiers('#248A3D')}
            />
          </Section>
          {props.custom.length ? (
            <Section title={props.t('savedBarcodes')}>
              {props.custom.map((item) => (
                <HStack key={item.barcode} alignment="center">
                  <VStack alignment="leading">
                    <Text>{item.label}</Text>
                    <Text>{item.barcode}</Text>
                  </VStack>
                  <Spacer />
                  <Button
                    label={props.t('delete')}
                    role="destructive"
                    onPress={() => props.onDeleteCustomBarcode(item.barcode)}
                    modifiers={actionModifiers('#FF3B30')}
                  />
                </HStack>
              ))}
            </Section>
          ) : null}
          <Section>
            <Button
              label={props.t('done')}
              role="cancel"
              onPress={props.onCloseCustomBarcodes}
              modifiers={actionModifiers('#237F78')}
            />
          </Section>
        </Form>
      </BottomSheet>
    </Host>
  );
}
