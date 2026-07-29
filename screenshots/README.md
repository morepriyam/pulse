# Store screenshots

Release screenshot sets for Pulse v2.0, captured with the dev-seed fixtures
(Big Buck Bunny, CC-BY 3.0) and demo-mode status bars. Both platforms use the
same 13-shot run sheet and shared `01-…13-` naming.

## Layout

| Directory | Contents |
| --- | --- |
| `ios/` | Raw captures — iPhone 17 Pro Max, 1320×2868 (exact App Store 6.9" spec) |
| `android/` | Raw captures — 720×1600 (⚠️ 1:2.22 aspect exceeds Play's 2:1 limit; upload the framed set instead) |
| `store/appstore/` | Framed marketing shots, 1284×2778 PNG, no alpha — upload-ready for App Store Connect |
| `store/playstore/` | Framed marketing shots, 1080×1920 (9:16) PNG, no alpha — upload-ready for Play Console |
| `frame/` | The framing script (see below) |

## Shots

| # | File | Caption |
| --- | --- | --- |
| 01 | `01-home-dark.png` | All your drafts, ready when you are |
| 02 | `02-recorder.png` | Record multi-clip videos fast |
| 03 | `03-clip-editor.png` | Tap any clip to preview it |
| 04 | `04-edit-clip-trim.png` | Trim right on device |
| 05 | `05-vault-pair-confirm.png` | Pair with your server securely |
| 06 | `06-vault-connected.png` | Connected to your private vault |
| 07 | `07-export-select.png` | Pick drafts to export |
| 08 | `08-home-light.png` | Light or dark — your call |
| 09 | `09-merging.png` | Merge clips into one video |
| 10 | `10-merged-share.png` | Share, save, or upload |
| 11 | `11-upload-complete.png` | Upload straight to your vault |
| 12 | `12-on-device-ai-models.png` | On-device AI — nothing leaves your phone |
| 13 | `13-captions-editor.png` | Word-by-word caption editing |

## Regenerating the framed sets

Requires Node >= 20.9.0 (needed by `sharp`).

```sh
cd screenshots/frame
npm ci
npm run frame
```

The script composites each raw capture into a generic rounded-corner bezel with
a soft shadow, caption, and brand-tinted gradient background, then flattens to
alpha-free PNG at the exact store dimensions. The caption sits in a band above
the device, and the device is sized so the full screenshot stays visible on
both canvases. Generic bezels are deliberate: neither capture device has
official frame art, and stores accept (and expect) stylized marketing frames.
Captions live in the `CAPTIONS` map in [frame.mjs](frame/frame.mjs).

## Store size cheat sheet

- **App Store Connect**: 6.5" display — 1284×2778 portrait. App Store Connect
  reuses this single set for all other iPhone display sizes unless overridden.
- **Play Console**: phone screenshots 1080×1920 (9:16); each side 320–3840 px,
  aspect ratio at most 2:1, PNG/JPEG ≤ 8 MB, no alpha. Feature graphic
  (1024×500) is required for store listing promotion and is not generated here.
