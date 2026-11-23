import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { DemoSheet } from '../components/DemoSheet';
import { ConnectivityPill, SyncPill } from '../components/StatusBar';
import { SYNC_ENABLED } from '../config';
import type { Note } from '../db';
import { useSyncNote } from '../store';
import { screenView } from '../telemetry';
import { colors, timeAgo } from '../theme';

export function NotesList({ onOpen }: { onOpen: (id: string | null) => void }) {
  const {
    notes,
    pendingIds,
    conflicts,
    recentRemote,
    lastError,
    lastSyncedAt,
    status,
    online,
    syncNow,
    resetDemo,
    reportProblem,
  } = useSyncNote();
  const [, tick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    screenView('NotesList');
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const onReset = () =>
    Alert.alert('Reset demo scenario?', 'Restores "Product Launch Plan" to its original text and syncs it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: () => resetDemo().catch((e) => Alert.alert('Could not reset', String(e?.message ?? e))),
      },
    ]);

  const subtitle = !SYNC_ENABLED
    ? 'Turso Sync not configured: notes stay on this device'
    : status === 'failed'
      ? lastError ?? 'Last sync failed'
      : lastSyncedAt
        ? `Last synced ${timeAgo(lastSyncedAt)}`
        : online
          ? 'Ready to sync'
          : 'Edits are saved on this device';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.h1}>Notes</Text>
        <View style={styles.pills}>
          <ConnectivityPill />
          <SyncPill onPress={SYNC_ENABLED ? () => syncNow('manual') : undefined} />
        </View>
      </View>
      <Text style={[styles.subtitle, status === 'failed' && { color: colors.red }]} numberOfLines={1}>
        {subtitle}
      </Text>

      {conflicts.length > 0 && (
        <Pressable style={styles.conflictBanner} onPress={() => onOpen(conflicts[0].noteId)}>
          <Text style={styles.conflictTitle}>Sync conflict</Text>
          <Text style={styles.conflictBody}>
            “{conflicts[0].local.title}” was changed on another device while you were offline. Tap to resolve.
          </Text>
        </Pressable>
      )}

      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingBottom: 140, paddingTop: 4 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            pending={pendingIds.has(item.id)}
            conflict={conflicts.some((c) => c.noteId === item.id)}
            remoteBy={recentRemote[item.id]?.by}
            onPress={() => onOpen(item.id)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No notes yet.</Text>}
      />

      <View style={styles.footer}>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.ghostBtn} hitSlop={6}>
          <Text style={styles.ghostText}>•••  More</Text>
        </Pressable>
        <Pressable onPress={() => onOpen(null)} style={styles.fab}>
          <Text style={styles.fabText}>＋  New note</Text>
        </Pressable>
      </View>

      <DemoSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: 'Report a problem',
            hint: 'Sends a bug report with a screenshot, linked to this session (Measure). Or shake the phone.',
            onPress: () => reportProblem('NotesList'),
          },
          {
            label: 'Reset demo note',
            hint: 'Restores "Product Launch Plan" and syncs it',
            onPress: onReset,
          },
        ]}
      />
    </View>
  );
}

function NoteRow({
  note,
  pending,
  conflict,
  remoteBy,
  onPress,
}: {
  note: Note;
  pending: boolean;
  conflict: boolean;
  remoteBy?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {note.title || 'Untitled'}
        </Text>
        {conflict ? (
          <Text style={[styles.badge, { color: colors.red, backgroundColor: colors.redBg }]}>Conflict</Text>
        ) : pending ? (
          <Text style={[styles.badge, { color: colors.amber, backgroundColor: colors.amberBg }]}>Pending</Text>
        ) : remoteBy ? (
          <Text style={[styles.badge, { color: colors.accent, backgroundColor: '#E8EEFD' }]}>
            Updated from {remoteBy}
          </Text>
        ) : null}
      </View>
      <Text style={styles.cardBody} numberOfLines={2}>
        {note.content || 'No content'}
      </Text>
      <Text style={styles.cardMeta}>
        {timeAgo(note.updated_at)} · rev {note.rev}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  h1: { fontSize: 32, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  pills: { flexDirection: 'row', gap: 8 },
  subtitle: { color: colors.muted, fontSize: 13.5, marginTop: 4, marginBottom: 14 },
  conflictBanner: {
    backgroundColor: colors.redBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F5C9C9',
  },
  conflictTitle: { color: colors.red, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  conflictBody: { color: colors.ink, fontSize: 13.5, lineHeight: 19 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16.5, fontWeight: '600', color: colors.ink },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardBody: { color: '#4A4740', fontSize: 14.5, lineHeight: 20, marginTop: 6 },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 10 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ghostBtn: { paddingVertical: 12, paddingHorizontal: 4 },
  ghostText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  fab: {
    backgroundColor: colors.ink,
    paddingHorizontal: 22,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
