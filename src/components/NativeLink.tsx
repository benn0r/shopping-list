import { Linking, Pressable, StyleSheet, Text } from 'react-native';

export function NativeLink({ label, destination }: { label: string; destination: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(destination)}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ link: { color: '#237F78', fontSize: 15 } });
