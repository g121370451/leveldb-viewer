# Architecture

The main path is deliberately explicit:

```text
VS Code command → panel controller → worker → database session
                                            ├─ snapshot manager
                                            ├─ physical LevelDB reader
                                            ├─ private record index
                                            └─ queries → IndexedDB decoder
```

## Responsibilities

| Directory | Responsibility |
| --- | --- |
| `src/panel` | Webview resources, message validation, worker requests and cleanup. |
| `src/snapshot` | Source inventory, cancellable copying, immutable-file reuse, leases and disk budget. |
| `src/storage` | LevelDB checksums, fragmented logs, manifest edits, table blocks and physical records. |
| `src/database` | Reconcile sequence numbers/tombstones, publish a completed session, page/search/detail queries. |
| `src/indexeddb` | Key prefixes, metadata/catalog, external objects, Blink envelopes and V8 values. |
| `src/core` | Small shared binary, cancellation/error and lossless JSON-formatting helpers. |
| `media` | External styles, view rendering and user interaction. Database content is rendered as text nodes. |

`classic-level` only opens a viewer-created query index. It never opens the source or the physical snapshot. That separation is necessary: LevelDB recovery or compaction must not mutate immutable snapshot files shared with a later refresh.

The manifest determines the live table set. WALs selected using the current/previous log numbers overlay those table records. The private index retains the highest sequence for each identity, including deletion markers, before building the catalog and serving queries. IndexedDB primary-key identities are canonicalized from decoded key components; numeric signed zero and alternative prefix widths must not resurrect an older record.

The worker isolates copying, checksumming, indexing and decoding from the VS Code extension host. Requests are serialized. Cancellation is cooperative during file streaming and between records; a single synchronous value decode finishes before cancellation is observed. A candidate build does not replace the active session until it succeeds.

External object files are intentionally not eagerly copied. References are decoded from the snapshot, and content is read on demand with path containment and size checks. This preserves useful large-attachment behavior but cannot promise an attachment snapshot matching the database snapshot.

## Validation

- Real `classic-level` generated compressed SSTables and WALs are compared byte-for-byte with engine iteration, including deletions and updates.
- Source file hashes are checked before/after reading and refreshing a closed test database.
- Synthetic IndexedDB fixtures cover schema, object decoding, tombstones and more than 10,000 records.
- V8 fixtures cover object identity, cycles, sparse arrays, typed arrays, strings, BigInts and hostile property names.
- Limits, cancellation, failed refresh preservation, checksums, external values and Blob access have explicit tests.
- Browser smoke tests exercise the panel/controller/worker together, including paging, search outside the first page and responsive layouts.
- The locally installed Focus To-Do sample was read without modifying its source: 311 live physical records, 8 object stores, and 15 business records decoded successfully at implementation time. No private sample is checked in.

## Format references

- [LevelDB log format](https://github.com/google/leveldb/blob/main/doc/log_format.md)
- [LevelDB table format](https://github.com/google/leveldb/blob/main/doc/table_format.md)
- [LevelDB manifest recovery](https://github.com/google/leveldb/blob/main/db/version_set.cc)
- [Chromium IndexedDB coding scheme](https://chromium.googlesource.com/chromium/src/+/HEAD/content/browser/indexed_db/docs/leveldb_coding_scheme.md)
- [V8 serialization tags and versions](https://github.com/v8/v8/blob/main/src/objects/value-serializer.cc)
- [Blink serialization tags](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/bindings/core/v8/serialization/serialization_tag.h)

These are versioned implementation formats, not a promise that every future Chromium format will remain compatible. Unknown versions/tags fail visibly rather than guessing.
