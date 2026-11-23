import type { ExpoConfig } from 'expo/config';

// Values come from .env (loaded automatically by the Expo CLI). See README.md.
const measureApiKey = process.env.MEASURE_API_KEY;
const measureApiUrl = process.env.MEASURE_API_URL ?? 'https://api.measure.sh';

const config: ExpoConfig = {
  name: 'SyncNote',
  slug: 'syncnote',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'sh.demo.syncnote',
  },
  android: {
    package: 'sh.demo.syncnote',
    adaptiveIcon: {
      backgroundColor: '#F4F1EA',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-dev-client',
    './plugins/withTursoPrebuiltLibs',
    [
      '@measuresh/react-native',
      {
        androidApiKey: measureApiKey,
        androidApiUrl: measureApiKey ? measureApiUrl : undefined,
        iosApiKey: process.env.MEASURE_IOS_API_KEY ?? measureApiKey,
        iosApiUrl: measureApiKey ? measureApiUrl : undefined,
        // Demo: send every event so the session timeline is complete.
        enableFullCollectionMode: true,
      },
    ],
  ],
};

export default config;
