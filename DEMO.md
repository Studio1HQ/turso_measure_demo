# SyncNote demo: four everyday problems, about 5 minutes

Each scene is a problem mobile developers recognize. In each one, **Turso** does something real on the device and **Measure** shows it from production. Screenshots from a real run are in [docs/media](docs/media), and the write-up is in [docs/BLOG.md](docs/BLOG.md).

## Before you start
1. Emulator running, app installed, Metro running (`npm start`). See [README.md](README.md).
2. App open and **online**. Open **••• More → Reset demo note** so "Product Launch Plan" reads *"Launch is planned for Friday. Final QA is pending."*
3. A terminal in the project folder. That terminal is "the laptop", the other device.

## Scene 1: "Does it work on a plane?"
| Do | You'll see |
|---|---|
| `adb shell cmd connectivity airplane-mode enable` | Pill: **Offline** |
| Open the note, append text, tap **Save** | "✓ Saved on this device · will sync when online", status **Pending** |
| `adb shell am force-stop sh.demo.syncnote`, then reopen the app | The edit is still there, still **Pending**. It's in the local Turso DB. |
| `adb shell cmd connectivity airplane-mode disable` | Syncs automatically → **Synced** |

- **Turso:** local writes, durable through an app kill.
- **Measure:** `note_saved_locally {is_online:false, local_write_ms}`, then `app_opened {is_online:false, pending_count:1}`, then `connectivity_changed`, then `sync_completed`.

## Scene 2: "My laptop edit should show up on my phone"
| Do | You'll see |
|---|---|
| While online: `npm run remote:edit` | Within about 5 s the list shows **"Updated from laptop-web-client"** with the new text |

- **Turso:** an incremental `pull()` (the app pulls every 5 s while in the foreground).
- **Measure:** `remote_changes_received {changed_by, pull_ms, bytes_received}` plus a `turso.pull` span (p50/p95 via `get_span_metrics_over_time`).

Afterwards: **More → Reset demo note**.

## Scene 3: "Sync is slow for me"
```sh
adb shell svc wifi disable          # throttling only affects the emulated cellular link
adb emu network speed gsm
adb emu network delay gprs
```
| Do | You'll see |
|---|---|
| Edit the note and **Save** | "✓ Saved" right away, while the pill says **Syncing…** for a long time |

- **Turso:** the UI never waits on the network.
- **Measure:** `SlowSyncError` (after 8 s, grouped by push/pull/conflict_check), and possibly a real network error (`sync_failed {reason:network, phase}`). `sync_completed.duration_ms` shows the real cost.

Restore:
```sh
adb emu network speed full && adb emu network delay none && adb shell svc wifi enable
```
Pending edits retry automatically.

## Scene 4: "My teammate's edit vanished"
| Do | You'll see |
|---|---|
| Airplane mode on → edit the note → Save | Pending |
| `npm run remote:edit` | The laptop writes a newer revision on the server |
| Airplane mode off | Sync starts → **Failed** + "Sync conflict" banner |
| **••• More → Report a problem**, type what you see, **Send** (or shake the phone) | A Measure bug report with a screenshot, linked to the session |
| Tap the banner → **Keep mine** or **Use theirs** | Syncing… → **Synced** |
| `npm run remote:show` | The server holds the chosen version |

- **Turso:** sync is last-push-wins, so without the app's version check the laptop's change would be silently overwritten.
- **Measure:** `sync_conflict_detected {base_rev, remote_rev, remote_updated_by}`, `SyncConflictError`, the bug report, and `conflict_resolved` → `sync_completed`.

## Investigate with Claude Code + Measure MCP
Background the app for a few seconds so Measure flushes, then ask Claude Code (with the Measure MCP connected):

> A user filed a bug report about a sync conflict in SyncNote. Find it, analyze the session timeline, connectivity changes, sync attempts and conflict events, identify the root cause and suggest a fix.

These are the tools it uses (all real Measure MCP tools):
- `list_apps` → find the SyncNote app
- `get_bug_reports` → the report and its session
- `get_session` → the full timeline: custom events, Turso HTTP calls, errors, the bug report
- `get_errors` → error groups (`SyncConflictError`, `SlowSyncError`, network errors)
- `get_span_metrics_over_time` → `turso.pull` / `turso.sync` latency
- `get_funnel_conversion` → the funnel below

**Funnel** (already created in the SyncNote Measure app as "Offline edit → recovered sync"): `note_saved_locally → connectivity_changed → sync_started → sync_failed → conflict_resolved → sync_completed`, with a 30-minute window.
