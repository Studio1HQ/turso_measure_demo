/**
 * Centralized Measure instrumentation for SyncNote.
 *
 * Every event the demo emits goes through this file so the vocabulary stays
 * consistent (and so it is easy to audit that NO note content is ever sent).
 * Only ids, revision numbers, lengths, counts, timings and error codes leave the device.
 *
 * Uses only public @measuresh/react-native APIs:
 *   Measure.init, trackEvent, trackError, log, startSpan, getSessionId
 */
import {
  LogSeverity,
  Measure,
  MeasureConfig,
  SpanStatus,
  type Span,
  type ValidAttributeValue,
} from '@measuresh/react-native';

export type Attrs = Record<string, ValidAttributeValue>;

/** The only custom event names the app emits. Used for the Measure funnel. */
export type EventName =
  | 'app_opened'
  | 'note_created'
  | 'note_edited'
  | 'note_saved_locally'
  | 'note_deleted'
  | 'remote_changes_received'
  | 'connectivity_changed'
  | 'sync_started'
  | 'sync_failed'
  | 'sync_conflict_detected'
  | 'sync_completed'
  | 'conflict_resolved';

let initialized = false;

export async function initTelemetry(): Promise<void> {
  try {
    await Measure.init({ config: new MeasureConfig({ enableLogging: __DEV__ }) });
    initialized = true;
  } catch (e) {
    console.warn('[telemetry] Measure init failed', e);
  }
}

/** Hide hostnames in URLs (e.g. the Turso database host) but keep the path, which is useful. */
function redactUrls(s: string): string {
  return s.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s"']+/gi, '$1<host>');
}

function clean(attrs: Attrs = {}): Attrs {
  // Measure: values are string | number | boolean; string values max 256 chars.
  const out: Attrs = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const r = redactUrls(v);
      out[k] = r.length > 256 ? r.slice(0, 253) + '...' : r;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Copy of an Error with hostnames removed from its message and stack. */
function redactError(error: unknown): unknown {
  if (!(error instanceof Error) || !/:\/\//.test(error.message)) return error;
  const copy = new Error(redactUrls(error.message));
  copy.name = error.name;
  if (error.stack) copy.stack = redactUrls(error.stack);
  return copy;
}

/** Custom event (shows in session timeline, usable in funnels & filters). */
export function track(name: EventName, attrs?: Attrs): void {
  const attributes = clean(attrs);
  if (__DEV__) console.log(`[measure] ${name}`, attributes);
  if (!initialized) return;
  Measure.trackEvent({ name, attributes }).catch((e) =>
    console.warn('[telemetry] trackEvent failed', name, e),
  );
}

/** Breadcrumb: a log line in the session timeline. */
export function breadcrumb(body: string, attrs?: Attrs, severity = LogSeverity.Info): void {
  const attributes = clean(attrs);
  if (__DEV__) console.log(`[breadcrumb:${severity}] ${body}`, attributes);
  if (!initialized) return;
  Measure.log({ body, severity, attributes });
}

/** Handled error with a stack trace + attributes (shows under Errors). */
export function reportError(error: unknown, attrs?: Attrs): void {
  const attributes = clean(attrs);
  if (__DEV__) console.log('[measure:error]', error, attributes);
  if (!initialized) return;
  Measure.trackError({ error: redactError(error), attributes }).catch((e) =>
    console.warn('[telemetry] trackError failed', e),
  );
}

/** Manual screen view (the app uses simple state navigation, not a nav library). */
export function screenView(screenName: string, attrs?: Attrs): void {
  if (!initialized) return;
  Measure.trackScreenView({ screenName, attributes: clean(attrs) }).catch(() => {});
}

/**
 * Performance trace span (Measure.startSpan). Pass a parent to build a trace tree,
 * e.g. turso.sync -> turso.push / turso.pull. Returns a no-op-safe wrapper.
 */
export function startSpan(name: string, parent?: SpanHandle): SpanHandle {
  let span: Span | null = null;
  if (initialized) {
    try {
      span = Measure.startSpan({ name });
      if (parent?.raw) span.setParent(parent.raw);
    } catch {
      span = null;
    }
  }
  return {
    raw: span,
    checkpoint(n) {
      span?.setCheckpoint(n);
    },
    attrs(a) {
      span?.setAttributes(clean(a));
    },
    end(ok) {
      span?.setStatus(ok ? SpanStatus.Ok : SpanStatus.Error).end();
    },
  };
}

export interface SpanHandle {
  raw: Span | null;
  checkpoint(name: string): void;
  attrs(a: Attrs): void;
  end(ok: boolean): void;
}

/**
 * Measure's built-in bug report flow: native UI, auto screenshot, and the report is
 * linked to this session (the dashboard shows the session replay leading up to it).
 */
export function reportProblem(attrs?: Attrs): void {
  if (!initialized) return;
  Measure.launchBugReport({ takeScreenshot: true, attributes: clean(attrs) }).catch((e) =>
    console.warn('[telemetry] launchBugReport failed', e),
  );
}

/** Shake the phone to report a problem (Measure.onShake). */
export function enableShakeToReport(getAttrs: () => Attrs): void {
  if (!initialized) return;
  Measure.onShake({ handler: () => reportProblem({ ...getAttrs(), trigger: 'shake' }) });
}

export async function getSessionId(): Promise<string | null> {
  if (!initialized) return null;
  try {
    return await Measure.getSessionId();
  } catch {
    return null;
  }
}

export { LogSeverity };
