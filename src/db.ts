/**
 * Local-first persistence.
 *
 * Two Turso (SQLite-compatible) database files live on the device:
 *  - syncnote.db       : embedded replica synced with Turso Cloud via push()/pull()
 *  - syncnote-meta.db  : local-only bookkeeping (pending queue, device id).
 *                        Kept separate so it is never pushed to other devices.
 *
 * Every note row carries a `rev` counter. That is what lets the app detect that
 * someone else changed a note while this device was offline (optimistic concurrency).
 */
import { Database, getDbPath } from '@tursodatabase/sync-react-native';
import * as Crypto from 'expo-crypto';
import { DEMO_NOTE, SYNC_ENABLED, TURSO_AUTH_TOKEN, TURSO_URL } from './config';

export interface Note {
  id: string;
  title: string;
  content: string;
  rev: number;
  updated_at: number;
  updated_by: string;
}

export interface Pending {
  note_id: string;
  op: 'create' | 'update' | 'delete';
  base_rev: number; // remote revision this local change was based on
  queued_at: number;
}

export const NOTES_SCHEMA = `CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
)`;

const COLS = 'id, title, content, rev, updated_at, updated_by';

let notesDb: Database;
let metaDb: Database;
let deviceId = '';

export const getNotesDb = () => notesDb;
export const getDeviceId = () => deviceId;

export async function openDatabases(): Promise<void> {
  metaDb = new Database({ path: getDbPath('syncnote-meta.db') });
  await metaDb.connect();
  await metaDb.exec(
    'CREATE TABLE IF NOT EXISTS pending (note_id TEXT PRIMARY KEY, op TEXT NOT NULL, base_rev INTEGER NOT NULL, queued_at INTEGER NOT NULL)',
  );
  await metaDb.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  deviceId = (await getKv('device_id')) ?? '';
  if (!deviceId) {
    deviceId = `phone-${Crypto.randomUUID().slice(0, 8)}`;
    await setKv('device_id', deviceId);
  }

  notesDb = new Database(
    SYNC_ENABLED
      ? {
          path: getDbPath('syncnote.db'),
          url: TURSO_URL,
          authToken: TURSO_AUTH_TOKEN,
          clientName: `syncnote-${deviceId}`,
          bootstrapIfEmpty: true,
        }
      : { path: getDbPath('syncnote-local.db') },
  );
  await notesDb.connect();
  await notesDb.exec(NOTES_SCHEMA);
}

/** Make sure the demo note exists (first run in local-only mode, or empty remote). */
export async function ensureDemoNote(): Promise<boolean> {
  const row = await notesDb.get('SELECT id FROM notes WHERE id = ?', [DEMO_NOTE.id]);
  if (row) return false;
  await notesDb.run(
    `INSERT INTO notes (${COLS}) VALUES (?, ?, ?, 1, ?, ?)`,
    [DEMO_NOTE.id, DEMO_NOTE.title, DEMO_NOTE.content, Date.now(), deviceId],
  );
  await queue(DEMO_NOTE.id, 'create', 0);
  return true;
}

// ---------- notes ----------

export async function listNotes(): Promise<Note[]> {
  return (await notesDb.all(`SELECT ${COLS} FROM notes ORDER BY updated_at DESC`)) as unknown as Note[];
}

export async function getNote(id: string): Promise<Note | undefined> {
  return (await notesDb.get(`SELECT ${COLS} FROM notes WHERE id = ?`, [id])) as unknown as
    | Note
    | undefined;
}

export async function createNote(title: string, content: string): Promise<Note> {
  const note: Note = {
    id: Crypto.randomUUID(),
    title,
    content,
    rev: 1,
    updated_at: Date.now(),
    updated_by: deviceId,
  };
  await writeNote(note);
  await queue(note.id, 'create', 0);
  return note;
}

/**
 * Save an edit locally. The first unsynced edit of a note records the revision it
 * was based on; later edits keep that base so conflicts are detected correctly.
 */
export async function updateNote(id: string, title: string, content: string): Promise<Note> {
  const current = await getNote(id);
  if (!current) throw new Error(`Note ${id} not found`);
  const pending = await getPendingFor(id);
  const baseRev = pending ? pending.base_rev : current.rev;
  const newRev = pending ? current.rev : current.rev + 1;
  const next: Note = { ...current, title, content, rev: newRev, updated_at: Date.now(), updated_by: deviceId };
  await writeNote(next);
  if (!pending) await queue(id, 'update', baseRev);
  return next;
}

export async function deleteNote(id: string): Promise<void> {
  const pending = await getPendingFor(id);
  const current = await getNote(id);
  await notesDb.run('DELETE FROM notes WHERE id = ?', [id]);
  if (pending?.op === 'create') {
    await metaDb.run('DELETE FROM pending WHERE note_id = ?', [id]);
  } else {
    await queue(id, 'delete', pending?.base_rev ?? current?.rev ?? 0);
  }
}

/** Upsert a note with explicit values (used by conflict resolution / demo reset). */
export async function writeNote(n: Note): Promise<void> {
  await notesDb.run(
    `INSERT INTO notes (${COLS}) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
       rev = excluded.rev, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [n.id, n.title, n.content, n.rev, n.updated_at, n.updated_by],
  );
}

// ---------- pending queue (local only) ----------

async function queue(noteId: string, op: Pending['op'], baseRev: number) {
  await metaDb.run(
    `INSERT INTO pending (note_id, op, base_rev, queued_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(note_id) DO UPDATE SET op = CASE
       WHEN pending.op = 'create' AND excluded.op = 'update' THEN 'create' ELSE excluded.op END`,
    [noteId, op, baseRev, Date.now()],
  );
}

export async function getPending(): Promise<Pending[]> {
  return (await metaDb.all('SELECT note_id, op, base_rev, queued_at FROM pending')) as unknown as Pending[];
}

export async function getPendingFor(id: string): Promise<Pending | undefined> {
  return (await metaDb.get('SELECT note_id, op, base_rev, queued_at FROM pending WHERE note_id = ?', [
    id,
  ])) as unknown as Pending | undefined;
}

export async function setPendingBase(id: string, baseRev: number) {
  await metaDb.run('UPDATE pending SET base_rev = ? WHERE note_id = ?', [baseRev, id]);
}

export async function clearPending(ids: string[]) {
  for (const id of ids) await metaDb.run('DELETE FROM pending WHERE note_id = ?', [id]);
}

// ---------- kv ----------

export async function getKv(key: string): Promise<string | null> {
  const row = await metaDb.get('SELECT value FROM kv WHERE key = ?', [key]);
  return row ? String(row.value) : null;
}

export async function setKv(key: string, value: string) {
  await metaDb.run(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
