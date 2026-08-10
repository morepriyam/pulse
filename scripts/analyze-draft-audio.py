#!/usr/bin/env python3
"""Analyze a .pulse draft export for silent-audio segments (issue #157).

Background: iOS AVCaptureMovieFileOutput + a .mp4-named output arms Apple's
movieFragmentInterval bug — recordings that cross the 10s fragment interval
consolidate with an ISO-style v0 mp4a+esds sound entry inside the recorder's
'qt'-brand container, which AVFoundation itself refuses to read back. The clip
then plays back SILENT in the app (preview/merge/transcription) while the audio
bytes sit intact in the file. Fixed forward by recording fileType 'mov' on iOS;
this script triages drafts (old or new) without needing ffmpeg or a device.

For every media segment, reports:
  - ftyp brand (qt vs mp42/isom)
  - video codec, audio presence/bytes (structural, ffmpeg-level truth)
  - audio sample-entry STYLE: QuickTime v1+wave vs ISO v0+esds
  - stsd channel count vs actual AAC bitstream element (SCE mono / CPE stereo)
  - device model (from QuickTime metadata)
  - VERDICT: whether AVFoundation (app preview/merge) will see the audio.
    Rule (validated empirically on affected drafts): audio is INVISIBLE to
    AVFoundation iff brand == 'qt' AND the sound entry is ISO-style v0+esds.

Usage: python3 scripts/analyze-draft-audio.py <draft.pulse | directory-with-media/>
"""
import json
import re
import struct
import sys
import zipfile
from pathlib import Path


def boxes_in(data, start, end):
    o = start
    while o < end:
        if end - o < 8:
            return
        (size,) = struct.unpack(">I", data[o : o + 4])
        typ = data[o + 4 : o + 8].decode("latin1")
        hdr = 8
        if size == 1:
            (size,) = struct.unpack(">Q", data[o + 8 : o + 16])
            hdr = 16
        elif size == 0:
            size = end - o
        yield typ, o + hdr, o + size
        o += size


def find(data, start, end, path):
    if not path:
        yield (start, end)
        return
    for typ, cs, ce in boxes_in(data, start, end):
        if typ == path[0]:
            yield from find(data, cs, ce, path[1:])


def audio_track_info(data):
    """Return dict about the first soun trak, or None."""
    for trak_s, trak_e in find(data, 0, len(data), ["moov", "trak"]):
        handler = None
        for mdia_s, mdia_e in find(data, trak_s, trak_e, ["mdia"]):
            for typ, cs, ce in boxes_in(data, mdia_s, mdia_e):
                if typ == "hdlr":
                    handler = data[cs + 8 : cs + 12].decode("latin1")
        if handler != "soun":
            continue
        info = {}
        for stsd_s, stsd_e in find(data, trak_s, trak_e, ["mdia", "minf", "stbl", "stsd"]):
            o = stsd_s + 8
            (esize,) = struct.unpack(">I", data[o : o + 4])
            entry = data[o : o + esize]
            info["entry4cc"] = entry[4:8].decode("latin1")
            (version,) = struct.unpack(">H", entry[16:18])
            (ch,) = struct.unpack(">H", entry[24:26])
            info["stsd_version"] = version
            info["stsd_ch"] = ch
            info["has_wave"] = b"wave" in entry
            info["has_esds"] = b"esds" in entry
        # sample count + payload bytes
        for stbl_s, stbl_e in find(data, trak_s, trak_e, ["mdia", "minf", "stbl"]):
            for typ, cs, ce in boxes_in(data, stbl_s, stbl_e):
                if typ == "stsz":
                    ss, count = struct.unpack(">II", data[cs + 4 : cs + 12])
                    info["samples"] = count
                    if ss == 0:
                        sizes = struct.unpack(f">{count}I", data[cs + 12 : cs + 12 + 4 * count])
                        info["audio_bytes"] = sum(sizes)
                    else:
                        info["audio_bytes"] = ss * count
        # first AAC element type (SCE=mono bitstream, CPE=stereo bitstream)
        first = first_audio_sample(data, trak_s, trak_e)
        if first is not None:
            off, _ = first
            elem = data[off] >> 5
            info["aac_element"] = {0: "SCE(mono)", 1: "CPE(stereo)"}.get(elem, f"id{elem}")
        return info
    return None


def first_audio_sample(data, trak_s, trak_e):
    for stbl_s, stbl_e in find(data, trak_s, trak_e, ["mdia", "minf", "stbl"]):
        sizes = None
        chunk_offsets = None
        for typ, cs, ce in boxes_in(data, stbl_s, stbl_e):
            if typ == "stsz":
                ss, n = struct.unpack(">II", data[cs + 4 : cs + 12])
                sizes = list(struct.unpack(f">{n}I", data[cs + 12 : cs + 12 + 4 * n])) if ss == 0 else [ss] * n
            elif typ == "stco":
                (n,) = struct.unpack(">I", data[cs + 4 : cs + 8])
                chunk_offsets = struct.unpack(f">{n}I", data[cs + 8 : cs + 8 + 4 * n])
            elif typ == "co64":
                (n,) = struct.unpack(">I", data[cs + 4 : cs + 8])
                chunk_offsets = struct.unpack(f">{n}Q", data[cs + 8 : cs + 8 + 8 * n])
        if sizes and chunk_offsets:
            return chunk_offsets[0], sizes[0]
    return None


def video_codec(data):
    for trak_s, trak_e in find(data, 0, len(data), ["moov", "trak"]):
        for stsd_s, stsd_e in find(data, trak_s, trak_e, ["mdia", "minf", "stbl", "stsd"]):
            o = stsd_s + 8
            fourcc = data[o + 4 : o + 8].decode("latin1")
            if fourcc in ("avc1", "avc3", "hvc1", "hev1"):
                return fourcc
    return "?"


def device_strings(data):
    models = set(m.group().decode(errors="replace") for m in re.finditer(rb"iPhone[^\x00]{0,40}", data))
    return sorted(models)


def analyze_file(name, data):
    # Fail gracefully per-file: a truncated/corrupt segment (or a stray non-media
    # file swept up by directory mode) shouldn't abort the whole triage run.
    if len(data) < 12 or data[4:8] != b"ftyp":
        return {"file": name, "brand": "?", "video": "?", "verdict": "NOT AN MP4/MOV (no ftyp header)"}
    try:
        brand = data[8:12].decode("latin1").strip()
        vcodec = video_codec(data)
        a = audio_track_info(data)
    except (struct.error, IndexError, UnicodeDecodeError) as e:
        return {"file": name, "brand": "?", "video": "?", "verdict": f"UNPARSEABLE ({e.__class__.__name__}: truncated or corrupt)"}
    row = {"file": name, "brand": brand, "video": vcodec}
    if a is None:
        row.update(audio="NONE", verdict="NO AUDIO TRACK AT ALL (capture-level loss)")
        return row
    style = (
        "QT v1+wave"
        if a.get("stsd_version") == 1 and a.get("has_wave")
        else "ISO v0+esds"
        if a.get("stsd_version") == 0 and a.get("has_esds")
        else f"v{a.get('stsd_version')}?"
    )
    invisible = brand == "qt" and style == "ISO v0+esds"
    row.update(
        audio=f"{a.get('samples', '?')} frames / {a.get('audio_bytes', '?')} B",
        entry_style=style,
        stsd_ch=a.get("stsd_ch"),
        bitstream=a.get("aac_element", "?"),
        verdict="SILENT in app (AVFoundation drops track)" if invisible else "OK (audio visible)",
    )
    return row


def main(path):
    p = Path(path)
    entries = []
    if p.is_dir():
        for f in sorted(q for ext in ("*.mp4", "*.mov", "*.m4v") for q in p.glob(f"**/{ext}")):
            entries.append((str(f.relative_to(p)), f.read_bytes()))
    else:
        with zipfile.ZipFile(p) as z:
            manifest = None
            for n in z.namelist():
                if n == "manifest.json":
                    manifest = json.loads(z.read(n))
                elif n.endswith((".mp4", ".mov", ".m4v")):
                    entries.append((n, z.read(n)))
            if manifest:
                d = manifest["drafts"][0]
                print(f"Draft: {d.get('name') or '(untitled)'}  mode={d.get('mode')}  segments={len(d.get('segments', []))}")

    def seg_key(item):
        m = re.search(r"s(\d+)", item[0])
        return (int(m.group(1)) if m else 0, item[0])

    entries.sort(key=seg_key)

    devices = set()
    silent = []
    for name, data in entries:
        devices.update(device_strings(data))
        row = analyze_file(name, data)
        ok = row["verdict"].startswith("OK")
        mark = "✅" if ok else "❌"
        print(
            f"{mark} {row['file']:26s} brand={row['brand']:4s} video={row['video']} "
            f"audio={row.get('audio', '?'):24s} style={row.get('entry_style', '-'):11s} "
            f"stsd_ch={row.get('stsd_ch', '-')} bitstream={row.get('bitstream', '-'):11s} -> {row['verdict']}"
        )
        if mark == "❌":
            silent.append(row["file"])
    print()
    if devices:
        print("Recording device(s):", "; ".join(devices))
    if silent:
        print(f"\n{len(silent)}/{len(entries)} segment(s) will be SILENT in the app: {', '.join(silent)}")
    else:
        print(f"\nAll {len(entries)} segments have app-visible audio.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
