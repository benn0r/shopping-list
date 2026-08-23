import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  ActionButton,
  ChevronIcon,
  Field,
  LargeTitle,
  ListRow,
  Notice,
  Section,
  Separator,
} from '../../src/components/ui';

describe('shared interface components', () => {
  it('renders titles, grouped content, footers, and separators', async () => {
    const screen = await render(
      <>
        <LargeTitle>Moon Pantry</LargeTitle>
        <Section title="Products" footer="Choose one">
          <Text>Moon Milk</Text>
          <Separator />
        </Section>
        <Section>
          <Text>No optional heading</Text>
        </Section>
        <ChevronIcon />
        <ChevronIcon direction="down" size={12} color="#123456" />
      </>,
    );

    expect(screen.getByRole('header', { name: 'Moon Pantry' })).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Choose one')).toBeTruthy();
    expect(screen.getByText('No optional heading')).toBeTruthy();
    expect(screen.getByTestId('chevron-right')).toBeTruthy();
    expect(screen.getByTestId('chevron-down')).toBeTruthy();
  });

  it('edits a labeled field and retains secure input properties', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Field
        label="Password"
        value="secret"
        secureTextEntry
        onChangeText={onChangeText}
        placeholder="Required"
      />,
    );

    const input = screen.getByDisplayValue('secret');
    expect(input.props.secureTextEntry).toBe(true);
    fireEvent.changeText(input, 'next-secret');
    expect(onChangeText).toHaveBeenCalledWith('next-secret');
  });

  it('uses placeholders as labels for compact unlabeled fields', async () => {
    const screen = await render(
      <>
        <Field placeholder="Server URL" />
        <Field accessibilityLabel="Token" placeholder="API token" style={{ opacity: 0.9 }} />
        <Field testID="anonymous-field" />
      </>,
    );

    expect(screen.getByLabelText('Server URL')).toBeTruthy();
    expect(screen.getByLabelText('Token')).toBeTruthy();
    expect(screen.getByTestId('anonymous-field')).toBeTruthy();
    expect(screen.queryByText('Server URL')).toBeNull();
  });

  it('runs enabled actions and blocks disabled or loading actions', async () => {
    const enabled = jest.fn();
    const disabled = jest.fn();
    const loading = jest.fn();
    const screen = await render(
      <>
        <ActionButton title="Save" onPress={enabled} />
        <ActionButton title="Disabled" onPress={disabled} disabled />
        <ActionButton title="Loading" onPress={loading} loading />
      </>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    fireEvent.press(screen.getByRole('button', { name: 'Disabled' }));
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[2]);

    expect(enabled).toHaveBeenCalledTimes(1);
    expect(disabled).not.toHaveBeenCalled();
    expect(loading).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading')).toBeNull();
  });

  it('renders destructive, successful, and error states', async () => {
    const screen = await render(
      <>
        <ActionButton title="Delete" onPress={jest.fn()} destructive />
        <Notice>Something failed</Notice>
        <Notice kind="success">Saved</Notice>
      </>,
    );

    expect(screen.getByText('Delete')).toBeTruthy();
    expect(screen.getByText('Something failed')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('supports static, selected, interactive, detailed, and custom-trailing rows', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <>
        <ListRow title="Static" />
        <ListRow title="Selected" selected />
        <ListRow title="Interactive" detail="Details" onPress={onPress} />
        <ListRow title="Custom" trailing={<Text>Manage</Text>} />
      </>,
    );

    expect(screen.getByText('Selected').parent?.parent?.props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByText('Manage')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /Interactive/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
