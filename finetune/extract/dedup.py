"""Cross-source deduplication by code fingerprint.

Reads all raw JSONL files, applies priority order, writes a single
deduplicated JSONL. Later sources lose to earlier ones on fingerprint
match. Priority reflects training value:

  1. transcripts      (highest: verified, natural instruction shape)
  2. reference        (canonical API-correct examples with metadata)
  3. forum            (real problem->solution)
  4. snippets         (full composition)
  5. scripting_api    (volume filler, often shortest)
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

from .paths import RAW


PRIORITY = [
    "transcripts.jsonl",
    "reference.jsonl",
    "forum.jsonl",
    "snippets.jsonl",
    "scripting_api.jsonl",
]


def main() -> int:
    seen: set[str] = set()
    per_source_kept: dict[str, int] = {}
    per_source_dropped: dict[str, int] = {}
    deduped: list[dict] = []

    for fname in PRIORITY:
        path = RAW / fname
        if not path.exists():
            print(f"[dedup] skipping missing {fname}")
            continue
        kept = dropped = 0
        with path.open() as f:
            for line in f:
                r = json.loads(line)
                fp = r.get("fingerprint")
                if not fp:
                    continue
                if fp in seen:
                    dropped += 1
                    continue
                seen.add(fp)
                deduped.append(r)
                kept += 1
        per_source_kept[fname] = kept
        per_source_dropped[fname] = dropped

    out_path = RAW / "deduped.jsonl"
    with out_path.open("w") as f:
        for r in deduped:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"[dedup] {len(deduped)} unique records -> {out_path.name}")
    for fname in PRIORITY:
        if fname in per_source_kept:
            print(
                f"  {fname:28s} kept={per_source_kept[fname]:4d} "
                f"dropped={per_source_dropped[fname]:4d}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
