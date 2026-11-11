# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-11-11

### Fixed

- An unclosed `<!--` in the middle of a line no longer hides the rest of the document. It is a comment only when `-->` follows on the same line (CommonMark); otherwise it is plain text, so later casual sentences are checked. A comment that opens at the start of a line still spans lines.
- Indented code (4 spaces or a tab) on the very first line of a document is treated as code, like one after a blank line, so it no longer causes a false positive.

### Changed

- `examples/promptfoo` no longer has its own `package.json`, lock file or `overrides`. `npm run example:promptfoo` runs `npx --yes promptfoo@0.125.1` and imports the built `dist` adapter by relative path. The published package is unchanged.

### Added

- `npm run check:release`: checks that version, lock file, CHANGELOG, README, CLI `--version` and git tags agree, and that the repository tracks no example manifests, `node_modules` or oversized files. It runs in CI.

## [0.1.1] - 2026-11-11

### Security

- Pin `glob` 14.0.4, `minimatch` 11.0.6 and `basic-ftp` 6.2.6 through `overrides` in `examples/promptfoo` (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249, GHSA-c475-qrg2-pj4r). They were transitive dependencies of the example only; the published package has no runtime dependencies and its files are unchanged.
- The overrides force major versions outside the ranges that `promptfoo` and its dependencies declare, because no in-range patched release exists. Remove them once `promptfoo` accepts `glob` 14 and `minimatch` 11.

## [0.1.0] - 2026-11-11

### Added

- `analyze`, `check` and `classifyEnding`: rule-based speech-level classification of Korean sentences (`hasipsio`, `haeyo`, `hae`, `haera`, plus `nominal` and `unknown`) from the final ending only.
- Masking of code fences (including unclosed ones), indented code after a blank line, inline code, HTML comments (`SkipKind` `comment`), block quotes, tables, headings and quotation marks, with offsets preserved; `include` option to judge them anyway.
- Sentences wrapped in emphasis markup (`**…**`, `*…*`, `_…_`, `~~…~~`) are judged by their ending, with original offsets.
- `createStreamChecker` for incremental checks of streamed responses; results equal `check` for any chunking.
- `ko-speechlevel/promptfoo` assertion and `ko-speechlevel/vitest` matcher `toHaveSpeechLevel`.
- CLI `ko-speechlevel check|analyze` with several files, stdin, JSON Lines chat logs, table and JSON output, and exit codes 0, 1 and 2.
- Input limits (`maxLength`, `--max-bytes`, JSON depth) with clear error messages.

### Known limitations

- An unclosed `<!--` that does not start a line masks the rest of the document as a comment, so later casual sentences are missed.
- Indented code that starts on the very first line of a document (4 spaces or a tab, no preceding blank line) is judged as prose and can produce a false positive.
