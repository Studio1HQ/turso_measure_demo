import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncNote, type SyncStatus } from '../store';
import { colors } from '../theme';

const SYNC_STYLE: Record<SyncStatus, { label: string; fg: string; bg: string }> = {
  synced: { label: 'Synced', fg: colors.green, bg: colors.greenBg },
  pending: { label: 'Pending', fg: colors.amber, bg: colors.amberBg },
  syncing: { label: 'Syncing…', fg: colors.accent, bg: '#E8EEFD' },
  failed: { label: 'Failed', fg: colors.red, bg: colors.redBg },
  'local-only': { label: 'Local only', fg: colors.muted, bg: colors.grayBg },
};

export function ConnectivityPill() {
  const { online } = useSyncNote();
  return (
    <View style={[styles.pill, { backgroundColor: online ? colors.greenBg : colors.grayBg }]}>
      <View style={[styles.dot, { backgroundColor: online ? colors.green : colors.muted }]} />
      <Text style={[styles.pillText, { color: online ? colors.green : colors.ink }]}>
        {online ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}

export function SyncPill({ onPress }: { onPress?: () => void }) {
  const { status } = useSyncNote();
  const s = SYNC_STYLE[status];
  return (
    <Pressable onPress={onPress} disabled={!onPress || status === 'syncing'} hitSlop={8}>
      <View style={[styles.pill, { backgroundColor: s.bg }]}>
        {status === 'syncing' ? (
          <ActivityIndicator size="small" color={s.fg} style={{ transform: [{ scale: 0.6 }], marginRight: 2 }} />
        ) : (
          <View style={[styles.dot, { backgroundColor: s.fg }]} />
        )}
        <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.2 },
});
