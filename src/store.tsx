/**
 * App state + the sync engine.
 *
 * Turso Sync (docs.turso.tech/sync) gives us:
 *   - every read/write against a local database file (works offline, survives restarts)
 *   - push(): send local changes;  pull(): fetch remote changes and apply them locally.
 *     During pull, unpushed local changes are rolled back, remote changes applied, and the
 *     local changes replayed on top, atomically.
 *   - conflicts: "last push wins".
 *
 * What THIS app adds on top (not Turso):
 *   - a `rev` column + a pre-push version check, so an offline edit can't silently
 *     overwrite a teammate's newer change (last push wins would otherwise drop it)
 *   - a foreground "live pull" every few seconds so other devices' edits show up quickly
 *
 * Measure records each step: custom events, a trace per sync (turso.sync with child spans
 * turso.conflict_check / turso.push / turso.pull), handled errors with network context,
 * auto-captured HTTP calls to Turso, and user bug reports linked to the session.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { DEMO_NOTE, SYNC_ENABLED } from './config';
import * as db from './db';
import type { Note, Pending } from './db';
import { fetchRemoteNotes, RemoteHttpError } from './remote';
import {
  breadcrumb,
  enableShakeToReport,
  LogSeverity,
  reportError,
  reportProblem as launchBugReport,
  startSpan,
  track,
  type SpanHandle,
} from './telemetry';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'failed' | 'local-only';

const LIVE_PULL_INTERVAL_MS = 5000;
const OFFLINE_SINCE_KEY = 'offline_since';
const SLOW_OP_BUDGET_MS = 8000;

export interface Conflict {
  noteId: string;
  baseRev: number;
  local: Note;
  remote: Note;
}

export class SyncConflictError extends Error {
  constructor(public conflicts: Conflict[]) {
    super(
      `Push blocked: ${conflicts.length} note(s) changed on another device after this device's offline edit ` +
        conflicts.map((c) => `[${c.noteId}: base_rev=${c.baseRev} remote_rev=${c.remote.rev}]`).join(' '),
    );
    this.name = 'SyncConflictError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Sync attempted while device has no network connectivity');
    this.name = 'OfflineError';
  }
}

/** Reported when a sync phase blows its time budget (the operation keeps running). */
export class SlowSyncError extends Error {
  constructor(public phase: string, budgetMs: number) {
    super(`Sync ${phase} exceeded the app's ${budgetMs} ms budget and is still running`);
    this.name = 'SlowSyncError';
  }
}

interface RemoteBadge {
  by: string;
  at: number;
}

interface Ctx {
  ready: boolean;
  bootError: string | null;
  notes: Note[];
  pendingIds: Set<string>;
  online: boolean;
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  conflicts: Conflict[];
  recentRemote: Record<string, RemoteBadge>;
  syncNow: (trigger: string) => Promise<void>;
  saveNote: (id: string | null, title: string, content: string) => Promise<Note>;
  removeNote: (id: string) => Promise<void>;
  resolveConflict: (noteId: string, strategy: 'keep_local' | 'keep_remote') => Promise<void>;
  resetDemo: () => Promise<void>;
  reportProblem: (screen: string) => void;
}

const SyncNoteContext = createContext<Ctx | null>(null);

export const useSyncNote = () => {
  const ctx = useContext(SyncNoteContext);
  if (!ctx) throw new Error('useSyncNote outside provider');
  return ctx;
};

// `isInternetReachable` briefly reports false on cold start, so we key off `isConnected`
// (which is exactly what airplane mode / disabling Wi-Fi + data toggles).
const isOnlineState = (s: NetInfoState) => s.isConnected !== false;

function classify(e: unknown): string {
  if (e instanceof SyncConflictError) return 'conflict';
  if (e instanceof OfflineError) return 'offline';
  if (e instanceof RemoteHttpError) return e.status === 401 || e.status === 403 ? 'auth' : 'remote_http';
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) return 'network';
  return 'unknown';
}

/** Turso doesn't document the unit of lastPullUnixTime; accept seconds or ms. */
function msSince(unixTime: number | undefined): number {
  if (!unixTime) return -1;
  const ms = unixTime < 1e11 ? unixTime * 1000 : unixTime;
  return Math.max(0, Date.now() - ms);
}

const noteKey = (n: Note) => `${n.rev}:${n.updated_at}`;

export function SyncNoteProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [recentRemote, setRecentRemote] = useState<Record<string, RemoteBadge>>({});

  const onlineRef = useRef(true);
  const connTypeRef = useRef('unknown');
  const appActiveRef = useRef(true);
  const syncingRef = useRef(false);
  const pullingRef = useRef(false);
  const rerunRef = useRef<string | null>(null);
  const lastFailAtRef = useRef(0);
  const conflictsRef = useRef<Conflict[]>([]);
  const notesRef = useRef<Note[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const statusRef = useRef<SyncStatus>('synced');
  const offlineSinceRef = useRef<number | null>(null);
  const offlineEditsRef = useRef(0);
  const lastLivePullErrorRef = useRef(0);
  // Turso push/pull are serialized through one queue so they never overlap.
  const opChain = useRef<Promise<unknown>>(Promise.resolve());

  const exclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = opChain.current.then(fn, fn);
    opChain.current = run.catch(() => {});
    return run;
  }, []);

  /** Report (once) when a Turso operation exceeds its budget; never aborts it. */
  const watchSlow = useCallback(<T,>(phase: string, op: Promise<T>, span?: SpanHandle): Promise<T> => {
    const started = Date.now();
    const timer = setTimeout(() => {
      const attrs = {
        phase,
        budget_ms: SLOW_OP_BUDGET_MS,
        connection_type: connTypeRef.current,
        is_online: onlineRef.current,
      };
      span?.checkpoint(`${phase}_slow`);
      reportError(new SlowSyncError(phase, SLOW_OP_BUDGET_MS), attrs);
      breadcrumb(`Sync ${phase} is slow`, attrs, LogSeverity.Warning);
    }, SLOW_OP_BUDGET_MS);
    return op.finally(() => {
      clearTimeout(timer);
      span?.attrs({ [`${phase}_ms`]: Date.now() - started });
    });
  }, []);

  const refresh = useCallback(async () => {
    const [n, p] = await Promise.all([db.listNotes(), db.getPending()]);
    notesRef.current = n;
    pendingRef.current = p;
    setNotes(n);
    setPending(p);
    return { notes: n, pending: p };
  }, []);

  /** Turso's own view of the replica: pending CDC ops and how stale the local copy is. */
  const tursoStats = useCallback(async () => {
    const s = await db.getNotesDb().stats().catch(() => null);
    return {
      raw: s,
      attrs: {
        turso_cdc_operations: s?.cdcOperations ?? -1,
        replica_last_pull_age_ms: msSince(s?.lastPullUnixTime),
      },
    };
  }, []);

  // ---------------- sync engine (user-visible sync) ----------------

  const syncNow = useCallback(
    async (trigger: string) => {
      if (!SYNC_ENABLED) return;
      if (syncingRef.current) {
        // A save landed while a sync was in flight: run once more afterwards.
        rerunRef.current = trigger;
        return;
      }
      syncingRef.current = true;
      setSyncing(true);
      try {
        let next: string | null = trigger;
        while (next) {
          rerunRef.current = null;
          await exclusive(() => runSync(next!));
          next = rerunRef.current;
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exclusive],
  );

  async function runSync(trigger: string) {
    const started = Date.now();
    const queue = await db.getPending();
    const updates = queue.filter((p) => p.op === 'update');
    const before = await tursoStats();
    const base = {
      trigger,
      pending_count: queue.length,
      pending_updates: updates.length,
      is_online: onlineRef.current,
      connection_type: connTypeRef.current,
      offline_edits: offlineEditsRef.current,
      ...before.attrs,
    };
    track('sync_started', base);
    const root = startSpan('sync');
    root.attrs(base);
    let phase = 'start';
    let child: SpanHandle | null = null;

    try {
      if (!onlineRef.current) throw new OfflineError();

      // 1) App-level guard: is the server still at the revision our edit was based on?
      if (updates.length > 0) {
        phase = 'conflict_check';
        child = startSpan('sync.revision_check', root);
        const remote = await watchSlow(phase, fetchRemoteNotes(updates.map((u) => u.note_id)), root);
        const found: Conflict[] = [];
        for (const u of updates) {
          const r = remote.get(u.note_id);
          if (r && r.rev > u.base_rev) {
            const local = await db.getNote(u.note_id);
            if (local) found.push({ noteId: u.note_id, baseRev: u.base_rev, local, remote: r });
          }
        }
        child.attrs({ notes_checked: updates.length, conflicts: found.length });
        child.end(found.length === 0);
        child = null;
        if (found.length > 0) {
          for (const c of found) {
            track('sync_conflict_detected', {
              note_id: c.noteId,
              is_demo_note: c.noteId === DEMO_NOTE.id,
              base_rev: c.baseRev,
              local_rev: c.local.rev,
              remote_rev: c.remote.rev,
              remote_updated_by: c.remote.updated_by,
              local_updated_by: c.local.updated_by,
              remote_edit_at: c.remote.updated_at,
              local_edit_at: c.local.updated_at,
              remote_edited_after_local: c.remote.updated_at > c.local.updated_at,
              local_content_length: c.local.content.length,
              remote_content_length: c.remote.content.length,
            });
          }
          setConflicts(found);
          throw new SyncConflictError(found);
        }
      }

      // 2) Turso Sync: push local changes, then pull everyone else's.
      phase = 'push';
      child = startSpan('sync.push', root);
      child.attrs({ pending_count: queue.length, turso_cdc_operations: before.attrs.turso_cdc_operations });
      await watchSlow(phase, db.getNotesDb().push(), root);
      child.end(true);

      phase = 'pull';
      child = startSpan('sync.pull', root);
      const pulled = await watchSlow(phase, db.getNotesDb().pull(), root);
      child.attrs({ changed: pulled });
      child.end(true);
      child = null;

      const after = await tursoStats();
      await db.clearPending(queue.map((q) => q.note_id));
      setConflicts([]);
      setLastError(null);
      setLastSyncedAt(Date.now());
      offlineEditsRef.current = 0;
      await refresh();

      const sent = (after.raw?.networkSentBytes ?? 0) - (before.raw?.networkSentBytes ?? 0);
      const received = (after.raw?.networkReceivedBytes ?? 0) - (before.raw?.networkReceivedBytes ?? 0);
      const done = {
        trigger,
        pushed_notes: queue.length,
        pulled_changes: pulled,
        duration_ms: Date.now() - started,
        bytes_sent: sent >= 0 ? sent : -1,
        bytes_received: received >= 0 ? received : -1,
        connection_type: connTypeRef.current,
      };
      track('sync_completed', done);
      root.attrs(done);
      root.end(true);
    } catch (e) {
      child?.end(false);
      lastFailAtRef.current = Date.now();
      const reason = classify(e);
      const message = (e as Error)?.message ?? String(e);
      const attrs = {
        trigger,
        reason,
        phase,
        error_name: (e as Error)?.name ?? 'Error',
        error_message: message,
        pending_count: queue.length,
        is_online: onlineRef.current,
        connection_type: connTypeRef.current,
        duration_ms: Date.now() - started,
      };
      track('sync_failed', attrs);
      if (reason !== 'offline') reportError(e, attrs);
      breadcrumb(`Sync failed: ${reason} (${phase})`, attrs, LogSeverity.Error);
      root.attrs(attrs);
      root.end(false);
      setLastError(reason === 'conflict' ? 'Conflict with another device' : message);
    }
  }

  // ---------------- live pull (other devices' edits show up quickly) ----------------

  const livePull = useCallback(async () => {
    if (!SYNC_ENABLED || !onlineRef.current || !appActiveRef.current) return;
    if (syncingRef.current || pullingRef.current) return;
    pullingRef.current = true;
    let span: SpanHandle | null = null;
    try {
      await exclusive(async () => {
        const before = new Map(notesRef.current.map((n) => [n.id, noteKey(n)]));
        const s0 = await tursoStats();
        span = startSpan('sync.live_pull');
        span.attrs({ trigger: 'live', connection_type: connTypeRef.current });
        const t0 = Date.now();
        // pull() returns true if anything changed (docs: can also be our own push echoing back)
        const changed = await watchSlow('live_pull', db.getNotesDb().pull(), span);
        const pullMs = Date.now() - t0;
        span.attrs({ changed });
        span.end(true);
        span = null;
        if (!changed) return;

        const { notes: fresh } = await refresh();
        const me = db.getDeviceId();
        const changedNotes = fresh.filter((n) => before.get(n.id) !== noteKey(n) && n.updated_by !== me);
        const freshIds = new Set(fresh.map((n) => n.id));
        const removed = [...before.keys()].filter((id) => !freshIds.has(id)).length;
        if (changedNotes.length === 0 && removed === 0) return;

        const s1 = await tursoStats();
        const received = (s1.raw?.networkReceivedBytes ?? 0) - (s0.raw?.networkReceivedBytes ?? 0);
        track('remote_changes_received', {
          notes_changed: changedNotes.length,
          notes_removed: removed,
          changed_by: changedNotes[0]?.updated_by ?? 'unknown',
          pull_ms: pullMs,
          bytes_received: received >= 0 ? received : -1,
          connection_type: connTypeRef.current,
        });
        setLastSyncedAt(Date.now());
        const at = Date.now();
        setRecentRemote((prev) => {
          const next = { ...prev };
          for (const n of changedNotes) next[n.id] = { by: n.updated_by, at };
          return next;
        });
        setTimeout(
          () =>
            setRecentRemote((prev) => {
              const next = { ...prev };
              for (const n of changedNotes) if (next[n.id]?.at === at) delete next[n.id];
              return next;
            }),
          10000,
        );
      });
    } catch (e) {
      (span as SpanHandle | null)?.end(false);
      // Don't flood Measure: one tracked error per 30s for the background loop.
      if (onlineRef.current && Date.now() - lastLivePullErrorRef.current > 30000) {
        lastLivePullErrorRef.current = Date.now();
        reportError(e, {
          phase: 'live_pull',
          reason: classify(e),
          connection_type: connTypeRef.current,
          is_online: onlineRef.current,
        });
      }
    } finally {
      pullingRef.current = false;
    }
  }, [exclusive, refresh, tursoStats, watchSlow]);

  // ---------------- boot ----------------

  useEffect(() => {
    let unsubNet: (() => void) | undefined;
    (async () => {
      try {
        const net = await NetInfo.fetch();
        onlineRef.current = isOnlineState(net);
        connTypeRef.current = net.type;
        setOnline(onlineRef.current);
        await db.openDatabases();

        // When the device went offline, persisted so it survives an app restart.
        const savedSince = Number(await db.getKv(OFFLINE_SINCE_KEY)) || 0;
        if (onlineRef.current) {
          offlineSinceRef.current = null;
          if (savedSince) await db.setKv(OFFLINE_SINCE_KEY, '');
        } else {
          offlineSinceRef.current = savedSince || Date.now();
          if (!savedSince) await db.setKv(OFFLINE_SINCE_KEY, String(offlineSinceRef.current));
        }
        const seeded = await db.ensureDemoNote();
        const { pending: p } = await refresh();
        setReady(true);

        track('app_opened', {
          device_id: db.getDeviceId(),
          sync_enabled: SYNC_ENABLED,
          is_online: onlineRef.current,
          connection_type: connTypeRef.current,
          pending_count: p.length,
          demo_note_seeded: seeded,
        });

        enableShakeToReport(() => ({
          pending_count: pendingRef.current.length,
          is_online: onlineRef.current,
          sync_status: statusRef.current,
        }));

        if (SYNC_ENABLED && onlineRef.current) void syncNow('app_open');
      } catch (e) {
        reportError(e, { stage: 'boot' });
        setBootError((e as Error)?.message ?? String(e));
      }

      unsubNet = NetInfo.addEventListener((s) => {
        connTypeRef.current = s.type;
        const next = isOnlineState(s);
        if (next === onlineRef.current) return;
        onlineRef.current = next;
        setOnline(next);
        const offlineMs = next && offlineSinceRef.current ? Date.now() - offlineSinceRef.current : 0;
        offlineSinceRef.current = next ? null : Date.now();
        void db.setKv(OFFLINE_SINCE_KEY, next ? '' : String(offlineSinceRef.current));
        void db.getPending().then((p) => {
          track('connectivity_changed', {
            is_online: next,
            connection_type: s.type,
            offline_duration_ms: offlineMs,
            pending_count: p.length,
          });
          // Local-first: reconnecting flushes queued edits and pulls others'.
          if (next) setTimeout(() => void syncNow('reconnect'), 800);
        });
      });
    })();
    return () => unsubNet?.();
  }, [refresh, syncNow]);

  // Live pull loop: only while online and in the foreground.
  useEffect(() => {
    if (!ready || !SYNC_ENABLED) return;
    const timer = setInterval(() => {
      // Unsynced local edits (e.g. a previous sync failed on a bad network): retry the
      // full sync. A pending conflict waits for the user instead.
      if (
        pendingRef.current.length > 0 &&
        conflictsRef.current.length === 0 &&
        onlineRef.current &&
        Date.now() - lastFailAtRef.current > 15000
      ) {
        void syncNow('retry');
      } else {
        void livePull();
      }
    }, LIVE_PULL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      appActiveRef.current = s === 'active';
      if (s === 'active') void livePull();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ready, livePull, syncNow]);

  useEffect(() => {
    conflictsRef.current = conflicts;
  }, [conflicts]);

  // ---------------- mutations ----------------

  const saveNote = useCallback(
    async (id: string | null, title: string, content: string) => {
      const isOnline = onlineRef.current;
      const t0 = performance.now();
      let note: Note;
      if (id) {
        note = await db.updateNote(id, title, content);
      } else {
        note = await db.createNote(title, content);
      }
      const localWriteMs = Math.round((performance.now() - t0) * 10) / 10;
      if (!id) track('note_created', { note_id: note.id, is_online: isOnline, content_length: content.length });
      if (!isOnline) offlineEditsRef.current += 1;
      const { pending: p } = await refresh();
      track('note_saved_locally', {
        note_id: note.id,
        is_demo_note: note.id === DEMO_NOTE.id,
        is_online: isOnline,
        local_write_ms: localWriteMs,
        local_rev: note.rev,
        base_rev: p.find((x) => x.note_id === note.id)?.base_rev ?? -1,
        pending_count: p.length,
        content_length: content.length,
      });
      // Online: sync right away. Offline: the edit waits in the local DB.
      if (isOnline) void syncNow('save');
      return note;
    },
    [refresh, syncNow],
  );

  const removeNote = useCallback(
    async (id: string) => {
      await db.deleteNote(id);
      track('note_deleted', { note_id: id, is_online: onlineRef.current });
      await refresh();
      if (onlineRef.current) void syncNow('delete');
    },
    [refresh, syncNow],
  );

  const resolveConflict = useCallback(
    async (noteId: string, strategy: 'keep_local' | 'keep_remote') => {
      const c = conflicts.find((x) => x.noteId === noteId);
      if (!c) return;
      if (strategy === 'keep_local') {
        // Rebase our version on top of the server's revision, then push it.
        await db.writeNote({ ...c.local, rev: c.remote.rev + 1, updated_at: Date.now(), updated_by: db.getDeviceId() });
      } else {
        // Accept the server's version; our edit is discarded.
        await db.writeNote(c.remote);
      }
      await db.setPendingBase(noteId, c.remote.rev);
      track('conflict_resolved', {
        note_id: noteId,
        strategy,
        base_rev: c.baseRev,
        remote_rev: c.remote.rev,
        resolved_rev: strategy === 'keep_local' ? c.remote.rev + 1 : c.remote.rev,
      });
      setConflicts((prev) => prev.filter((x) => x.noteId !== noteId));
      await refresh();
      await syncNow('conflict_resolved');
    },
    [conflicts, refresh, syncNow],
  );

  const resetDemo = useCallback(async () => {
    if (SYNC_ENABLED && !onlineRef.current) throw new Error('Go online to reset the demo note.');
    await exclusive(async () => {
      let rev = (await db.getNote(DEMO_NOTE.id))?.rev ?? 0;
      if (SYNC_ENABLED) {
        const remote = await fetchRemoteNotes([DEMO_NOTE.id]);
        rev = Math.max(rev, remote.get(DEMO_NOTE.id)?.rev ?? 0);
      }
      await db.writeNote({ ...DEMO_NOTE, rev: rev + 1, updated_at: Date.now(), updated_by: db.getDeviceId() });
      await db.clearPending((await db.getPending()).map((p) => p.note_id));
      setConflicts([]);
      setLastError(null);
      offlineEditsRef.current = 0;
      breadcrumb('Demo scenario reset', { note_id: DEMO_NOTE.id, rev: rev + 1 });
      if (SYNC_ENABLED) {
        await db.getNotesDb().push();
        await db.getNotesDb().pull();
        setLastSyncedAt(Date.now());
      }
      await refresh();
    });
  }, [exclusive, refresh]);

  const reportProblem = useCallback((screen: string) => {
    launchBugReport({
      screen,
      trigger: 'menu',
      pending_count: pendingRef.current.length,
      is_online: onlineRef.current,
      sync_status: statusRef.current,
    });
  }, []);

  const pendingIds = useMemo(() => new Set(pending.map((p) => p.note_id)), [pending]);

  const status: SyncStatus = !SYNC_ENABLED
    ? 'local-only'
    : syncing
      ? 'syncing'
      : lastError || conflicts.length
        ? 'failed'
        : pending.length
          ? 'pending'
          : 'synced';
  statusRef.current = status;

  const value: Ctx = {
    ready,
    bootError,
    notes,
    pendingIds,
    online,
    status,
    lastError,
    lastSyncedAt,
    conflicts,
    recentRemote,
    syncNow,
    saveNote,
    removeNote,
    resolveConflict,
    resetDemo,
    reportProblem,
  };
  return <SyncNoteContext.Provider value={value}>{children}</SyncNoteContext.Provider>;
}
