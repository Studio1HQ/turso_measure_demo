/**
 * Read-only "pre-flight" check against the Turso Cloud primary over its HTTP
 * (Hrana v2 pipeline) API. Before pushing, the app asks the server which
 * revision each locally-edited note is at. If the server moved past the
 * revision our offline edit was based on, another client changed the note —
 * that is a conflict and we must not blindly overwrite it.
 *
 * Turso Sync's push() itself is last-writer-wins at the row level, so this
 * check is what turns a silent overwrite into a visible, debuggable conflict.
 */
import { TURSO_AUTH_TOKEN, TURSO_URL } from './config';
import type { Note } from './db';

type HranaValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; base64: string };

function httpUrl(): string {
  return TURSO_URL.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '') + '/v2/pipeline';
}

function decode(v: HranaValue): string | number | null {
  switch (v.type) {
    case 'integer':
      return Number(v.value);
    case 'float':
      return v.value;
    case 'text':
      return v.value;
    default:
      return null;
  }
}

export class RemoteHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'RemoteHttpError';
  }
}

export async function fetchRemoteNotes(ids: string[]): Promise<Map<string, Note>> {
  const result = new Map<string, Note>();
  if (ids.length === 0) return result;

  const placeholders = ids.map(() => '?').join(', ');
  const res = await fetch(httpUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TURSO_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql: `SELECT id, title, content, rev, updated_at, updated_by FROM notes WHERE id IN (${placeholders})`,
            args: ids.map((id) => ({ type: 'text', value: id })),
          },
        },
        { type: 'close' },
      ],
    }),
  });
  if (!res.ok) throw new RemoteHttpError(`Turso HTTP ${res.status}`, res.status);

  const body = await res.json();
  const first = body.results?.[0];
  if (first?.type !== 'ok') {
    throw new RemoteHttpError(first?.error?.message ?? 'Unknown Turso error', res.status);
  }
  const { cols, rows } = first.response.result as {
    cols: { name: string }[];
    rows: HranaValue[][];
  };
  for (const row of rows) {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => (obj[c.name] = decode(row[i])));
    result.set(obj.id as string, obj as unknown as Note);
  }
  return result;
}
