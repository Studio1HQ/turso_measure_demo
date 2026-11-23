import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ConnectivityPill, SyncPill } from '../components/StatusBar';
import { DEMO_NOTE } from '../config';
import { useSyncNote, type Conflict } from '../store';
import { screenView, track } from '../telemetry';
import { colors, timeAgo } from '../theme';

export function NoteEditor({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { notes, pendingIds, conflicts, online, saveNote, removeNote, resolveConflict } = useSyncNote();
  const note = noteId ? notes.find((n) => n.id === noteId) : undefined;
  const conflict = conflicts.find((c) => c.noteId === noteId);

  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const editTracked = useRef(false);
  const dirty = title !== (note?.title ?? '') || content !== (note?.content ?? '');

  useEffect(() => {
    screenView('NoteEditor', { note_id: noteId ?? 'new', is_demo_note: noteId === DEMO_NOTE.id });
  }, [noteId]);

  // When a conflict gets resolved the underlying note changes: reflect it.
  useEffect(() => {
    if (note && !dirty) {
      setTitle(note.title);
      setContent(note.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.rev, note?.updated_at]);

  const onChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (!editTracked.current && noteId) {
      editTracked.current = true;
      track('note_edited', {
        note_id: noteId,
        is_demo_note: noteId === DEMO_NOTE.id,
        is_online: online,
        rev_at_edit_start: note?.rev ?? 0,
      });
    }
  };

  const onSave = async () => {
    if (!title.trim() && !content.trim()) return onClose();
    const saved = await saveNote(noteId, title.trim(), content);
    editTracked.current = false;
    setSavedFlash(online ? 'Saved' : 'Saved on this device · will sync when online');
    setTimeout(() => setSavedFlash(null), 2500);
    if (!noteId) onClose();
    return saved;
  };

  const onDelete = () =>
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeNote(noteId!);
          onClose();
        },
      },
    ]);

  const onBack = async () => {
    if (dirty) await onSave();
    onClose();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Notes</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ConnectivityPill />
          <SyncPill />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {conflict && <ConflictCard conflict={conflict} onResolve={(s) => resolveConflict(conflict.noteId, s)} />}

        <TextInput
          value={title}
          onChangeText={onChange(setTitle)}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          style={styles.title}
          editable={!conflict}
        />
        {note && (
          <Text style={styles.meta}>
            Edited {timeAgo(note.updated_at)} · rev {note.rev}
            {pendingIds.has(note.id) ? ' · not yet synced' : ''}
          </Text>
        )}
        <TextInput
          value={content}
          onChangeText={onChange(setContent)}
          placeholder="Start writing…"
          placeholderTextColor={colors.muted}
          style={styles.body}
          multiline
          textAlignVertical="top"
          editable={!conflict}
        />
      </ScrollView>

      <View style={styles.footer}>
        {noteId ? (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {savedFlash ? (
          <Text style={styles.flash}>✓ {savedFlash}</Text>
        ) : (
          <Pressable
            onPress={onSave}
            disabled={!dirty || !!conflict}
            style={[styles.save, (!dirty || !!conflict) && { opacity: 0.35 }]}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function ConflictCard({
  conflict,
  onResolve,
}: {
  conflict: Conflict;
  onResolve: (s: 'keep_local' | 'keep_remote') => void;
}) {
  return (
    <View style={styles.conflict}>
      <Text style={styles.conflictTitle}>This note changed on another device</Text>
      <Text style={styles.conflictSub}>
        Your offline edit was based on rev {conflict.baseRev}, but the server is now at rev {conflict.remote.rev}{' '}
        ({conflict.remote.updated_by}). Choose which version to keep.
      </Text>

      <Version label="Your version (this device)" title={conflict.local.title} body={conflict.local.content} />
      <Version
        label={`Their version · ${timeAgo(conflict.remote.updated_at)}`}
        title={conflict.remote.title}
        body={conflict.remote.content}
      />

      <View style={styles.conflictBtns}>
        <Pressable style={[styles.cBtn, { backgroundColor: colors.ink }]} onPress={() => onResolve('keep_local')}>
          <Text style={[styles.cBtnText, { color: '#fff' }]}>Keep mine</Text>
        </Pressable>
        <Pressable style={[styles.cBtn, styles.cBtnOutline]} onPress={() => onResolve('keep_remote')}>
          <Text style={styles.cBtnText}>Use theirs</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Version({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <View style={styles.version}>
      <Text style={styles.versionLabel}>{label}</Text>
      <Text style={styles.versionTitle}>{title}</Text>
      <Text style={styles.versionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  back: { fontSize: 17, color: colors.accent, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink, paddingVertical: 8, marginTop: 8 },
  meta: { color: colors.muted, fontSize: 12.5, marginBottom: 10 },
  body: { fontSize: 17, lineHeight: 26, color: '#2B2A27', minHeight: 240 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  delete: { color: colors.red, fontWeight: '600', fontSize: 15 },
  flash: { color: colors.green, fontWeight: '600', fontSize: 13.5, flexShrink: 1, textAlign: 'right' },
  save: { backgroundColor: colors.ink, paddingHorizontal: 28, height: 48, borderRadius: 24, justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  conflict: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F0B7B7',
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  conflictTitle: { color: colors.red, fontWeight: '700', fontSize: 15.5 },
  conflictSub: { color: '#4A4740', fontSize: 13.5, lineHeight: 19, marginTop: 4, marginBottom: 10 },
  version: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, marginTop: 8 },
  versionLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  versionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 4 },
  versionBody: { fontSize: 14, color: '#3A3833', lineHeight: 20, marginTop: 2 },
  conflictBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cBtnOutline: { borderWidth: 1.5, borderColor: colors.ink },
  cBtnText: { fontWeight: '700', fontSize: 14.5, color: colors.ink },
});
