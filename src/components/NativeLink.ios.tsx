import { Host, Link } from '@expo/ui/swift-ui';
import { controlSize, tint } from '@expo/ui/swift-ui/modifiers';

export function NativeLink({ label, destination }: { label: string; destination: string }) {
  return (
    <Host matchContents seedColor="#237F78">
      <Link
        label={label}
        destination={destination}
        modifiers={[controlSize('regular'), tint('#237F78')]}
      />
    </Host>
  );
}
