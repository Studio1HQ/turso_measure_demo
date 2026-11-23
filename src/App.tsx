import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// Android is edge-to-edge: pad for the status bar and gesture/nav bar ourselves.
const TOP_INSET = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 54;
const BOTTOM_INSET = Platform.OS === 'android' ? 48 : 30; // 3-button nav bar height
import { NoteEditor } from './screens/NoteEditor';
import { NotesList } from './screens/NotesList';
import { SyncNoteProvider, useSyncNote } from './store';
import { initTelemetry } from './telemetry';
import { colors } from './theme';

// Start Measure before anything else so app_opened lands in the session.
const telemetryReady = initTelemetry();

type Route = { name: 'list' } | { name: 'editor'; noteId: string | null };

function Shell() {
  const { ready, bootError } = useSyncNote();
  const [route, setRoute] = useState<Route>({ name: 'list' });

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'editor') {
        setRoute({ name: 'list' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [route]);

  if (bootError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errTitle}>Could not open the database</Text>
        <Text style={styles.errBody}>{bootError}</Text>
        <Text style={styles.errHint}>First launch needs a connection to bootstrap from Turso.</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  return route.name === 'list' ? (
    <NotesList onOpen={(noteId) => setRoute({ name: 'editor', noteId })} />
  ) : (
    <NoteEditor key={route.noteId ?? 'new'} noteId={route.noteId} onClose={() => setRoute({ name: 'list' })} />
  );
}

export default function App() {
  const [telemetry, setTelemetry] = useState(false);
  useEffect(() => {
    telemetryReady.finally(() => setTelemetry(true));
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {telemetry ? (
        <SyncNoteProvider>
          <Shell />
        </SyncNoteProvider>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: TOP_INSET, paddingBottom: BOTTOM_INSET },  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  errBody: { color: colors.red, textAlign: 'center', marginBottom: 8 },
  errHint: { color: colors.muted, textAlign: 'center' },
});
