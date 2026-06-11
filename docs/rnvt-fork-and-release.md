# RNVT fork — link vs. release notes

**Why fork:** orientation fix lives only in npm `8.1.4` (never pushed to GitHub) + our merge/trim perf work.
Production always ships the fork, never the stock npm package.

**Key idea:** the link (submodule/`file:`/git URL) is build-time only. The fork's native code is compiled
into the binary at build time — *how* it was resolved doesn't exist at runtime. So you ship the fork, but
never the local `file:` link.

## Two modes (only one committed at a time)
- **Dev (now):** `"react-native-video-trim": "file:modules/react-native-video-trim"` — edit native → rebuild → test, no push cycle.
- **Release:** `"react-native-video-trim": "github:morepriyam/react-native-video-trim#<sha-or-tag>"` — reproducible; `npm install` builds `lib/` itself.

Keep the **git-URL spec committed on `main`** (always shippable); switch to `file:` only locally, don't commit it.

## Go-live steps
1. Push perf branch to fork, tag it, grab the SHA.
2. Flip `package.json` to `github:morepriyam/...#<sha>` (pin SHA/tag, never a bare branch).
3. `npm install` → confirm lock resolves to the SHA, not `"link": true`.
4. `npx expo prebuild --clean && npx expo run:ios` → confirm `VideoTrim` in pod install output.
5. Device smoke test: portrait trim (upright) + multi-clip merge/export.

## Fresh clone (dev)
```bash
git submodule update --init
cd modules/react-native-video-trim && corepack yarn install && corepack yarn prepare && cd ../..
npm install
```
`file:` deps don't build the submodule's `lib/` — hence `yarn prepare` first.

## Setup gotchas
- SSH to GitHub not configured here → submodule uses HTTPS (`gh` covers it).
- Stray root `lefthook.yml` from the fork's postinstall — harmless, hooks not hijacked, safe to delete.
- npm `allow-scripts` blocking `bob build` at root install is fine — `lib/` is pre-built in the submodule.

## Iterate
- Native: edit `modules/react-native-video-trim/ios/*.swift` (or `android/.../*.kt`) → rebuild.
- JS in fork: `corepack yarn prepare` to rebuild `lib/`.
- Tests: `cd modules/react-native-video-trim && corepack yarn test`.
- Commit both ends: commit+push in submodule, then `git add modules/react-native-video-trim` in parent.
