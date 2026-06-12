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
cd modules/react-native-video-trim && corepack yarn install && corepack yarn prepare
rm -rf node_modules && cd ../..          # ⚠️ REQUIRED — see "duplicate react-native" below
npm install
```
`file:` deps don't build the submodule's `lib/` — hence `yarn prepare` first. Then the submodule's
`node_modules` MUST be removed before app builds.

## ⚠️ Critical: the submodule must NOT keep its own `node_modules` during app builds
`corepack yarn install` gives the submodule its own `react-native` (a devDep). Because the package is
symlinked into the app, that becomes a **second react-native** → on the new architecture codegen breaks,
the `VideoTrimSpec` TurboModule interface isn't generated, and you get **`VideoTrim could not be found,
verify that a module by this name is registered`** at runtime.

- **Default / app-build state:** submodule has built `lib/` but **no `node_modules`**. One react-native. Works.
- **Only when editing the fork's JS or running its tests:** `corepack yarn install` → do the work
  (`yarn prepare` / `yarn test`) → **`rm -rf node_modules`** before the next app build.
- Native (Swift/Kotlin) iteration needs **no** `node_modules` — `lib/` is already built and the native
  build compiles against the Pods, not the submodule's deps.
- Verify anytime: `npx expo-modules-autolinking verify` → must say "Everything is fine!" (no duplicate RN).

After fixing dedup, regenerate: `npx expo prebuild --clean` then rebuild (`npx expo run:ios`).

## Setup gotchas
- SSH to GitHub not configured here → submodule uses HTTPS (`gh` covers it).
- Stray root `lefthook.yml` from the fork's postinstall — harmless, hooks not hijacked, ignored via `.gitignore`.
- npm `allow-scripts` blocking `bob build` at root install is fine — `lib/` is pre-built in the submodule.
- **CocoaPods crash `Unicode Normalization not appropriate for ASCII-8BIT`** = shell locale isn't UTF-8.
  Run pods/prebuild with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` (e.g. `LANG=en_US.UTF-8 npx pod-install ios`).

## Iterate
- Native: edit `modules/react-native-video-trim/ios/*.swift` (or `android/.../*.kt`) → rebuild. No `node_modules` needed.
- JS in fork: `corepack yarn install && corepack yarn prepare` to rebuild `lib/`, then `rm -rf node_modules`.
- Tests: `corepack yarn install && corepack yarn test` in the submodule, then `rm -rf node_modules`.
- Commit both ends: commit+push in submodule, then `git add modules/react-native-video-trim` in parent.
