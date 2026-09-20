import { Redirect, type Href } from 'expo-router';

export default function RootIndex() {
  return <Redirect href={'/(tabs)' as Href} />;
}
