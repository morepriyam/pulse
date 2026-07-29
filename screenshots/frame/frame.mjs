// Store-ready screenshot framing for Pulse.
//
// Takes the raw device captures in ../ios and ../android and produces marketing-framed,
// store-compliant images:
//   ../store/appstore/   1284x2778  (Apple 6.5" spec — App Store Connect reuses it for all sizes)
//   ../store/playstore/  1080x1920  (9:16 — the raw 720x1600 captures are 1:2.22, which
//                                    exceeds Play's 2:1 aspect limit; the canvas fixes that)
//
// Each output: dark gradient background, caption, and the screenshot inside a generic
// rounded-corner bezel with a soft shadow (device-agnostic on purpose — no official frame
// art exists for either capture device). Output PNGs are flattened: both stores reject alpha.
//
// Usage: node frame.mjs
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Captions keyed by the shared 01-…13 shot names. `|` forces a line break.
const CAPTIONS = {
  '01-home-dark': 'All your drafts,|ready when you are',
  '02-recorder': 'Record multi-clip|videos fast',
  '03-clip-editor': 'Tap any clip|to preview it',
  '04-edit-clip-trim': 'Trim right|on device',
  '05-vault-pair-confirm': 'Pair with your|server securely',
  '06-vault-connected': 'Connected to your|private vault',
  '07-export-select': 'Pick drafts|to export',
  '08-home-light': 'Light or dark —|your call',
  '09-merging': 'Merge clips into|one video',
  '10-merged-share': 'Share, save,|or upload',
  '11-upload-complete': 'Upload straight|to your vault',
  '12-on-device-ai-models': 'On-device AI —|nothing leaves your phone',
  '13-captions-editor': 'Word-by-word|caption editing',
};

const TARGETS = [
  {
    name: 'appstore',
    src: path.join(ROOT, '..', 'ios'),
    out: path.join(ROOT, '..', 'store', 'appstore'),
    canvas: { w: 1284, h: 2778 },
    // Screen corner radius as a fraction of the rendered screenshot width.
    screenRadius: 0.105, // iPhone 17 Pro Max display corners are strongly rounded
  },
  {
    name: 'playstore',
    src: path.join(ROOT, '..', 'android'),
    out: path.join(ROOT, '..', 'store', 'playstore'),
    canvas: { w: 1080, h: 1920 },
    screenRadius: 0.06,
  },
  {
    // Apple requires at least one 13" iPad screenshot when the app supports tablets.
    // Reuses the iPhone captures on the iPad canvas (2048x2732, 12.9/13" portrait spec).
    name: 'appstore-ipad',
    src: path.join(ROOT, '..', 'ios'),
    out: path.join(ROOT, '..', 'store', 'appstore-ipad'),
    canvas: { w: 2048, h: 2732 },
    screenRadius: 0.105,
  },
];

const BG_TOP = '#101014';
const BG_BOTTOM = '#22222c';
const ACCENT = '#ff453a'; // Pulse record-button red
const BEZEL = '#050507';
const BEZEL_PAD_FRAC = 0.02; // bezel thickness as a fraction of canvas width

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function backgroundSvg(w, h) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${BG_TOP}"/>
        <stop offset="1" stop-color="${BG_BOTTOM}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.05" r="0.9">
        <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.14"/>
        <stop offset="0.55" stop-color="${ACCENT}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
  </svg>`);
}

function captionSvg(w, h, caption, fontSize) {
  const lines = caption.split('|').map((l) => l.trim());
  const lineHeight = Math.round(fontSize * 1.18);
  const firstY = Math.round(h / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.36);
  const tspans = lines
    .map((line, i) => `<tspan x="${w / 2}" y="${firstY + i * lineHeight}">${esc(line)}</tspan>`)
    .join('');
  // Accent underline under the last line for a bit of pop.
  const underline = `<rect x="${Math.round(w / 2 - fontSize * 1.1)}" y="${firstY + (lines.length - 1) * lineHeight + Math.round(fontSize * 0.42)}"
      width="${Math.round(fontSize * 2.2)}" height="${Math.max(4, Math.round(fontSize * 0.1))}"
      rx="${Math.max(2, Math.round(fontSize * 0.05))}" fill="${ACCENT}"/>`;
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text text-anchor="middle" fill="#ffffff" font-weight="800"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${fontSize}"
      letter-spacing="-0.5">${tspans}</text>
    ${underline}
  </svg>`);
}

function roundedRectSvg(w, h, r, fill) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/></svg>`,
  );
}

async function frameOne(srcFile, target) {
  const { canvas, screenRadius } = target;
  const name = path.basename(srcFile, path.extname(srcFile));
  const caption = CAPTIONS[name];
  if (!caption) console.warn(`  ! no caption for ${name} — framing without text`);

  const fontSize = Math.round(canvas.w * 0.058);
  const bezelPad = Math.round(canvas.w * BEZEL_PAD_FRAC);
  const meta = await sharp(srcFile).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`could not read dimensions of ${srcFile} — file may be corrupt or unsupported`);
  }
  const aspect = meta.width / meta.height;

  // Layout: caption band up top, whole device fully visible below it — sized by the
  // remaining height (and capped by width) so nothing gets cropped on either store's canvas.
  const captionBand = Math.round(canvas.h * 0.14);
  const deviceTop = captionBand + Math.round(canvas.h * 0.015);
  const bottomMargin = Math.round(canvas.h * 0.03);
  let shotH = canvas.h - deviceTop - bottomMargin - bezelPad * 2;
  let shotW = Math.round(shotH * aspect);
  const maxW = Math.round(canvas.w * 0.8);
  if (shotW > maxW) {
    shotW = maxW;
    shotH = Math.round(shotW / aspect);
  }

  const radius = Math.round(shotW * screenRadius);
  const shot = await sharp(srcFile).resize(shotW, shotH).png().toBuffer();
  const rounded = await sharp(shot)
    .composite([{ input: roundedRectSvg(shotW, shotH, radius, '#fff'), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const bezelW = shotW + bezelPad * 2;
  const bezelH = shotH + bezelPad * 2;
  const bezel = await sharp(roundedRectSvg(bezelW, bezelH, radius + bezelPad, BEZEL))
    .composite([{ input: rounded, left: bezelPad, top: bezelPad }])
    .png()
    .toBuffer();

  // Soft shadow: the bezel silhouette, blurred, slightly oversized canvas so the blur
  // isn't clipped, composited beneath the device.
  const shadowMargin = Math.round(canvas.w * 0.06);
  const shadow = await sharp({
    create: {
      width: bezelW + shadowMargin * 2,
      height: bezelH + shadowMargin * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: roundedRectSvg(bezelW, bezelH, radius + bezelPad, 'rgba(0,0,0,0.55)'),
        left: shadowMargin,
        top: shadowMargin,
      },
    ])
    .png()
    .toBuffer()
    .then((buf) => sharp(buf).blur(shadowMargin / 3).png().toBuffer());

  const deviceLeft = Math.round((canvas.w - bezelW) / 2);
  // Crop the shadow layer to the canvas — sharp rejects composite inputs larger than the base
  // (happens in the overlay layout, where the device spans nearly the full canvas height).
  const shadowW = bezelW + shadowMargin * 2;
  const shadowH = bezelH + shadowMargin * 2;
  let shadowLeft = deviceLeft - shadowMargin;
  let shadowTop = deviceTop - shadowMargin + Math.round(shadowMargin * 0.35);
  let shadowLayer = shadow;
  const cropLeft = Math.max(0, -shadowLeft);
  const cropTop = Math.max(0, -shadowTop);
  const cropW = Math.min(shadowW - cropLeft, canvas.w - Math.max(shadowLeft, 0));
  const cropH = Math.min(shadowH - cropTop, canvas.h - Math.max(shadowTop, 0));
  if (cropLeft || cropTop || cropW < shadowW || cropH < shadowH) {
    shadowLayer = await sharp(shadow)
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .png()
      .toBuffer();
    shadowLeft = Math.max(shadowLeft, 0);
    shadowTop = Math.max(shadowTop, 0);
  }
  const layers = [
    { input: shadowLayer, left: shadowLeft, top: shadowTop },
    { input: bezel, left: deviceLeft, top: deviceTop },
  ];
  if (caption) {
    layers.unshift({ input: captionSvg(canvas.w, captionBand, caption, fontSize), left: 0, top: 0 });
  }

  await mkdir(target.out, { recursive: true });
  await sharp(backgroundSvg(canvas.w, canvas.h))
    .composite(layers)
    .flatten({ background: BG_TOP })
    .removeAlpha() // both stores reject alpha channels
    .png()
    .toFile(path.join(target.out, `${name}.png`));
}

for (const target of TARGETS) {
  if (!existsSync(target.src)) {
    console.warn(`skipping ${target.name}: ${target.src} not found`);
    continue;
  }
  const files = (await readdir(target.src)).filter((f) => /\.png$/i.test(f)).sort();
  console.log(`${target.name}: framing ${files.length} shots → ${target.canvas.w}x${target.canvas.h}`);
  for (const f of files) {
    await frameOne(path.join(target.src, f), target);
    console.log(`  ✓ ${f}`);
  }
}
console.log('done.');
