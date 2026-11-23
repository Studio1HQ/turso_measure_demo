import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Action {
  label: string;
  hint: string;
  onPress: () => void;
}

export function DemoSheet({ visible, onClose, actions }: { visible: boolean; onClose: () => void; actions: Action[] }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        {actions.map((a) => (
          <Pressable
            key={a.label}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.grayBg }]}
            onPress={() => {
              onClose();
              // let the sheet close before native UI (bug report) opens on top
              setTimeout(a.onPress, 250);
            }}
          >
            <Text style={styles.label}>{a.label}</Text>
            <Text style={styles.hint}>{a.hint}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.cancel} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 56,
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 8 },
  row: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  label: { fontSize: 16, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cancel: { marginTop: 6, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
