# 0007. Board data is untrusted

- **Status**: Accepted
- **Date**: 2026-10-31

## Context

Boards arrive from files people open, from other people's saves and from live messages. Any of them can be crafted to inject markup or script, point images at tracking hosts, or crash the app with malformed shapes.

## Decision

- Every scene from outside the engine goes through `sanitizeElements()` in [`src/engine/scene.ts`](../../src/engine/scene.ts) before it is used: files, loaded boards, remote saves and live strokes.
- Text from other people is rendered as text, never as HTML.
- Profile pictures load only from Google's image hosts (`lh3`–`lh6.googleusercontent.com`) over HTTPS.
- All code is bundled from npm. If a script is ever loaded from a CDN, it is pinned with Subresource Integrity.
- Invites only match verified emails, and the owner's email is hidden from link visitors.

## Consequences

- A new shape property must be added to the sanitizer, or it is dropped on load.
- New places that accept outside data (a new import format, a new live message) sanitize it at the edge, before it reaches the engine or the UI.
- Security problems are reported privately ([SECURITY.md](../../SECURITY.md)), not in public issues.
