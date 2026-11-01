# Changelog

Notable changes to Scrawl. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Full notes for each version are on the [releases page](https://github.com/RedSnoww12/scrawl/releases).

## [Unreleased]

## [1.1.0] - 2026-11-01

### Added

- Search boards by name in the board list. Matching folders open while you search, and Escape clears it.

### Changed

- Update React to 19.3.1.

### Security

- Upgrade Vite to 8.3.5, which fixes a high-severity advisory in the development server. This affects people running Scrawl locally, not the deployed app.
- Patch `minimatch` in the lint tools against a denial-of-service advisory.

## [1.0.0] - 2026-11-01

The first release.

### Added

- Hand-drawn whiteboard with several saved boards, image export and save to file.
- Google sign-in, with boards saved online through Supabase. Guest mode keeps working without an account.
- Shared boards and folders: invite people by email or share a link.
- Live collaboration: see other people's cursors, names and comments that follow the pointer, and their drawing as it happens.
- Look through a collaborator's eyes, or follow them around the board.
- Arrows and lines connect to shapes and stay attached when the shapes move.

### Fixed

- Collaborators stay visible on shared boards.
- Live updates work again for signed-in people.

### Security

- Invites only match verified emails, and the owner's email is hidden from link visitors.
- Live pointers, comments and names are tied to the account that sent them.
- Collaborators' avatars load only from Google's image hosts.
- Imported scenes are sanitized and rough.js is pinned with SRI.

[Unreleased]: https://github.com/RedSnoww12/scrawl/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/RedSnoww12/scrawl/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/RedSnoww12/scrawl/releases/tag/v1.0.0
