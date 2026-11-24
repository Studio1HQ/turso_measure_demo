<div align="center">

<img src="https://raw.githubusercontent.com/Studio1HQ/Studio1HQ/main/assets/banners/turso_measure_demo.webp" alt="SyncNote with Turso Sync: An offline-first notes app with Turso Sync and Measure" width="100%" />

<br />
<br />

# SyncNote with Turso Sync

### An offline-first notes app with Turso Sync and Measure

SyncNote is a React Native and Expo notes app that saves offline with Turso Sync, records sync events with Measure, and uses Claude Code through the Measure MCP server to explain sync failures.

<br />

[![Built by Studio1](https://img.shields.io/badge/Built_by_Studio1-f97316?style=for-the-badge&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgMTYwIiBmaWxsPSJub25lIj48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTAgMzVDMCAxNi42ODA3IDE0LjA3NDQgMS42NDg0NCAzMiAwLjEyNjk1M1YxNDFINTEuMDUyM0M1Mi40MzA4IDEzNy4zNDQgNTQuNzQ0NiAxMzMuNjg5IDU3Ljk5MzggMTMwLjAzM0M2MS4xNDQ2IDEyNi41MDggNjQuNjg5MiAxMjMuNDQgNjguNjI3NyAxMjAuODI5QzcyLjU2NjIgMTE4LjM0OSA3Ni4zNTY5IDExNi43ODIgODAgMTE2LjEyOVY4Ni43NTQ0Qzc1LjQ3MDggODcuOTI5MiA3MS4zODQ2IDg5LjY5MTkgNjcuNzQxNSA5Mi4wNDE1QzY0IDk0LjUyMjUgNjAuNzUwOCA5Ny40NiA1Ny45OTM4IDEwMC44NTRDNTYuNTM0NSAxMDIuNzIgNTUuMjU0NSAxMDQuNjU5IDU0LjE1MzkgMTA2LjY3MVYwSDEyNUMxNDQuMzMgMCAxNjAgMTUuNjY5OSAxNjAgMzVWMTI1QzE2MCAxNDQuMzMgMTQ0LjMzIDE2MCAxMjUgMTYwSDEyNFYxOEgxMDQuOTQ4QzEwMy41NjkgMjEuNjgxNiAxMDEuMjU1IDI1LjM2MjggOTguMDA2MiAyOS4wNDQ0Qzk0Ljg1NTQgMzIuNTk0MiA5MS4zMTA4IDM1LjY4NDEgODcuMzcyMyAzOC4zMTRDODMuNDMzOCA0MC44MTIgNzkuNjQzMSA0Mi4zODk2IDc2IDQzLjA0NzRWNzIuNjMwNEM4MC41MjkyIDcxLjQ0NzMgODQuNjE1NCA2OS42NzI0IDg4LjI1ODUgNjcuMzA1N0M5MiA2NC44MDc2IDk1LjI0OTIgNjEuODQ5MSA5OC4wMDYyIDU4LjQzMDdDOTkuNDY1NSA1Ni41NTEzIDEwMC43NDUgNTQuNTk4NiAxMDEuODQ2IDUyLjU3MjNWMTYwSDM1QzE1LjY3IDE2MCAwIDE0NC4zMyAwIDEyNVYzNVoiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4K)](https://studio1hq.com)
[![Built with Turso](https://img.shields.io/badge/Built_with_Turso-141414?style=for-the-badge)](https://turso.tech)

[Turso docs](https://docs.turso.tech) &nbsp;·&nbsp; [Turso](https://turso.tech) &nbsp;·&nbsp; [Measure](https://measure.sh) &nbsp;·&nbsp; [More examples](https://github.com/Studio1HQ) &nbsp;·&nbsp; [studio1hq.com](https://studio1hq.com)

</div>

<br />

## Overview

SyncNote is an offline-first notes app in React Native and Expo, built to try three tools on one real problem: an app whose data has to survive a plane, a basement and a second device editing the same note.

[Turso Sync](https://docs.turso.tech/sync) stores the notes on the phone and syncs them. [Measure](https://measure.sh) records what happened on the device when sync misbehaves. Claude Code, through the [Measure MCP server](https://measure.sh/docs/mcp), reads that record and explains why.

<p align="center"><img src="docs/media/scene1-saved-offline.png" alt="Note saved on the device while offline" width="45%" /> <img src="docs/media/scene4-conflict-card.png" alt="Conflict card with Keep mine and Use theirs" width="45%" /></p>

<details>
<summary>More screenshots and diagrams</summary>

<p align="center"><img src="docs/media/scene2-live-update.png" alt="Note updated from another device" width="45%" /></p>
<p align="center"><img src="docs/media/diagram-architecture.png" alt="How SyncNote is wired" width="100%" /></p>
<p align="center"><img src="docs/media/diagram-reconnect.png" alt="What happens when the phone reconnects" width="100%" /></p>
<p align="center"><img src="docs/media/diagram-mcp.png" alt="From bug report to root cause" width="100%" /></p>

</details>

## Features

- **Notes list and editor**: create, edit and delete notes.
- **Local-first saves**: every save writes to a local database first, so saving works on Wi-Fi, on 2G and in airplane mode.
- **Status pills**: an Online or Offline pill, and a sync pill showing Synced, Pending, Syncing or Failed.
- **Automatic sync**: syncs on save, on reconnect and on app open. While open, it also pulls every 5 seconds, and failed syncs retry at most every 15 seconds.
- **Conflict handling**: if two people edited the same note, a card shows both versions with Keep mine and Use theirs.
- **Bug reports**: the More menu opens Measure's Report a problem screen (also on shake) and Reset demo note.
- **Local only mode**: with no Turso config, notes are saved on the phone and nothing syncs.

## Tech stack

| Layer | Tool |
| --- | --- |
| App | [React Native](https://reactnative.dev) 0.88 with [Expo](https://expo.dev) 58 |
| Local database and sync | [Turso Sync](https://docs.turso.tech/sync) (`@tursodatabase/sync-react-native`) |
| Server scripts | `@libsql/client` |
| Telemetry | [Measure](https://measure.sh) React Native SDK |
| Debugging | [Claude Code](https://claude.com/claude-code) with the Measure MCP server |
| Language | TypeScript |

## Getting started

### Prerequisites

- Node.js 20 or later
- Android SDK with an emulator or device
- JDK 17 with `JAVA_HOME` set
- A [Turso](https://turso.tech) database and the `turso` CLI
- A Measure app at [measure.sh](https://measure.sh) with package name `sh.demo.syncnote`

On Windows, keep the project in a short path such as `E:\turso_measure_demo`. The native build exceeds the 260-character path limit in deep folders. Expo Go cannot load these native modules, so you need a development build.

### Installation

```bash
git clone https://github.com/Studio1HQ/turso_measure_demo.git
cd turso_measure_demo
npm install
```

### Environment variables

Create a Turso database, then copy `.env.example` to `.env` and fill it in.

```bash
turso db create syncnote
turso db show syncnote --url      # libsql://syncnote-<org>.<region>.turso.io
turso db tokens create syncnote
```

| Variable | Description |
| --- | --- |
| `EXPO_PUBLIC_TURSO_URL` | Turso database URL, `libsql://syncnote-<your-org>.turso.io`. |
| `EXPO_PUBLIC_TURSO_AUTH_TOKEN` | Token from `turso db tokens create`. Bundled into the app because this is a demo. In production, hand out short-lived tokens from a backend. The SDK's `authToken` also accepts an async function. |
| `MEASURE_API_KEY` | API key of your Measure app. |
| `MEASURE_API_URL` | Measure ingest URL, `https://ingest.measure.sh`. |

The `MEASURE_*` values are baked into the native build by the `@measuresh/react-native` config plugin. Run `npx expo prebuild --clean` again after changing them.

### Run

```bash
npm run remote:setup                       # creates the notes table and adds the demo note
npx expo prebuild --platform android --clean
npx expo run:android
```

After the first build, `npm start` is enough. Run `prebuild` again only after changing the `MEASURE_*` values or the plugins. The first launch needs a connection to download the database. After that the app works fully offline.

| Command | What it does |
| --- | --- |
| `npm start` | Metro, for the installed development build |
| `npm run android` | Build and run on Android |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run remote:setup` | Create the `notes` table in Turso Cloud and add the demo note |
| `npm run remote:edit` | Act as "another device" and edit the demo note on the server |
| `npm run remote:show` | Print the server's copy of the demo note |
| `npm run remote:reset` | Restore the demo note on the server |

The `remote:*` scripts are `scripts/other-device.mjs`, talking to Turso Cloud over `@libsql/client`.

## How it works

Two database files sit on the phone:

- `syncnote.db`: the Turso database that syncs with Turso Cloud.
- `syncnote-meta.db`: local only. It holds the queue of unsynced edits and the device id, and never leaves the phone.

| The problem | Turso handles | Measure shows |
| --- | --- | --- |
| Saving with no signal | Reads and writes go to a local database file. Changes wait there until `push()`. | `note_saved_locally` with `local_write_ms`, and the app reopening offline with pending edits |
| Another device's edit | `pull()` brings down only what changed | `remote_changes_received`, plus `turso.pull` traces (p50 and p95) |
| A slow or failing network | The UI never waits on the network | `SlowSyncError` per sync phase, network errors tagged with `connection_type`, and Turso's HTTP calls on the timeline |
| Two people, one note | Sync is last-push-wins, so the app adds a revision check | `sync_conflict_detected`, `SyncConflictError`, the user's bug report and `conflict_resolved` in one session |

Everything in the Turso column comes from the SDK. The revision check and the conflict screen are app code in `src/store.tsx`.

### Conflicts

Under Turso's [conflict resolution rules](https://docs.turso.tech/sync/conflict-resolution), a pull rolls back your unpushed changes, applies the remote changes and replays yours on top. On push, if two devices changed the same row, the last push wins. That silently drops an edit when two people edit one note and one is offline.

So before pushing, the app checks. Every note carries a `rev`, and the first offline edit remembers the `base_rev` it started from. A read-only query asks Turso Cloud for the server's revision. If the server moved past `base_rev`, the push is held and the user picks a version.

### What Measure records

Every Measure call lives in `src/telemetry.ts` and uses only the public SDK (`trackEvent`, `trackError`, `startSpan`, `launchBugReport`, `onShake` and others).

- **Events**: `app_opened`, `note_created`, `note_edited`, `note_saved_locally`, `connectivity_changed`, `sync_started`, `remote_changes_received`, `sync_conflict_detected`, `sync_failed`, `conflict_resolved`, `sync_completed`, `note_deleted`. `sync_started` carries Turso's own `stats()`: how many changes were waiting and how stale the local copy was.
- **Traces**: each sync is a `turso.sync` trace with child spans `turso.conflict_check`, `turso.push` and `turso.pull`.
- **Handled errors**: `SyncConflictError`, `SlowSyncError` (a phase past 8 seconds; the sync is not cancelled), plus network and auth failures. Measure samples handled errors at 0% by default, so raise that in production.
- **Bug reports**: with a screenshot (text masked by default), attached to the session they came from.
- **Automatic data**: screen views, taps, launch time and HTTP calls, including Turso's `/pull-updates` and `/v2/pipeline`. The `Authorization` header is never collected.

Note text never leaves the device. Only ids, revision numbers, lengths, counts and timings are sent.

### Debugging with Claude Code

```bash
claude mcp add --transport http measure https://agent.measure.sh/mcp
```

Background the app for a few seconds so Measure uploads, then ask from inside the repo:

> A user filed a bug report about a sync conflict in SyncNote. Find it, analyze the session timeline, connectivity changes, sync attempts and conflict events, identify the root cause and suggest a fix.

Claude Code uses `get_bug_reports` to find the report, `get_session` for the timeline, `get_errors` for the error groups and `get_span_metrics_over_time` for sync timings, then reads `src/store.tsx` to tie it back to the code.

### Project layout

```text
src/
  App.tsx       shell and navigation
  store.tsx     app state and sync engine: push/pull, live pull, retries, conflict check
  db.ts         the two local databases
  remote.ts     read-only Turso Cloud query for the conflict check
  telemetry.ts  every Measure call
  screens/      NotesList, NoteEditor (with the conflict card)
  components/   status pills, the More sheet
scripts/        the "other device": setup, edit, show, reset
plugins/        Expo config plugin that fixes the Turso Android build
docs/           write-up, dev.to version, screenshots and diagrams
```

## Resources

- [Turso Sync](https://docs.turso.tech/sync): sync overview.
- [Turso conflict resolution](https://docs.turso.tech/sync/conflict-resolution): how pull and push resolve changes.
- [Turso documentation](https://docs.turso.tech) and [Turso](https://turso.tech): the database platform.
- [Measure React Native SDK](https://measure.sh/docs/getting-started/react-native): SDK setup.
- [Measure MCP](https://measure.sh/docs/mcp): connect Claude Code to Measure data.
- [Measure on GitHub](https://github.com/measure-sh/measure): the open-source project.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/): why Expo Go is not enough.
- [Claude Code](https://claude.com/claude-code): the coding agent used for debugging.

## License

Released under the [MIT License](LICENSE).

<br />

---

<div align="center">

<a href="https://studio1hq.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Studio1HQ/website/main/brand/studio1-logo-on-dark.svg" />
    <img src="https://raw.githubusercontent.com/Studio1HQ/website/main/brand/studio1-logo-on-light.svg" alt="Studio1" width="160" />
  </picture>
</a>

Built by **[Studio1](https://studio1hq.com)**, the technical content and DevRel partner for devtool teams. Made with [Turso](https://turso.tech).<br />
Browse more open-source examples at [github.com/Studio1HQ](https://github.com/Studio1HQ).

[![Website](https://img.shields.io/badge/studio1hq.com-0b0807?style=for-the-badge&logo=googlechrome&logoColor=white)](https://studio1hq.com)
[![Book a call](https://img.shields.io/badge/Book_a_strategy_call-f97316?style=for-the-badge&logo=googlecalendar&logoColor=white)](https://cal.com/studio1/collab)
[![X](https://img.shields.io/badge/%40Studio1HQ-141414?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Studio1HQ)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0a66c2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/company/studio1hq/)

<sub><a href="https://studio1hq.com">studio1hq.com</a> · Technical content, docs, video and DevRel for devtools</sub>

</div>
