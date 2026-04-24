"""Split deduped.jsonl into batch files for subagent processing.

Pass 1 (synthesize): split records needing synthesis into N batches.
Pass 2 (paraphrase): split all records into batches of a chosen size.

Usage:
  python -m finetune.augment.chunk synthesize  # writes work/batches/synth_XX.jsonl
  python -m finetune.augment.chunk paraphrase  # writes work/batches/para_XX.jsonl
"""
from __future__ import annotations
import json
import sys

from ..extract.paths import RAW, WORK


MIN_PROSE = 30
BATCH_SIZE_SYNTH = 40
BATCH_SIZE_PARA = 80


def needs_synthesis(r: dict) -> bool:
    if r.get("source_type") in ("transcript", "reference"):
        return False
    return len((r.get("prose") or "").strip()) < MIN_PROSE


def chunk(records: list[dict], size: int, prefix: str) -> list[str]:
    batches_dir = WORK / "batches"
    batches_dir.mkdir(parents=True, exist_ok=True)
    # clean previous
    for p in batches_dir.glob(f"{prefix}_*.jsonl"):
        p.unlink()
    paths = []
    for i in range(0, len(records), size):
        batch = records[i : i + size]
        p = batches_dir / f"{prefix}_{i // size:03d}.jsonl"
        with p.open("w") as f:
            for r in batch:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        paths.append(str(p))
    return paths


def main(mode: str) -> int:
    if mode == "synthesize":
        records = [json.loads(line) for line in (RAW / "deduped.jsonl").open()]
        targets = [r for r in records if needs_synthesis(r)]
        paths = chunk(targets, BATCH_SIZE_SYNTH, "synth")
        print(f"[chunk/synthesize] {len(targets)} records -> {len(paths)} batches")
    elif mode == "paraphrase":
        src = RAW / "prompts_synthesized.jsonl"
        if not src.exists():
            print(f"[chunk/paraphrase] missing {src}. Run synthesize + collate first.")
            return 1
        records = [json.loads(line) for line in src.open()]
        paths = chunk(records, BATCH_SIZE_PARA, "para")
        print(f"[chunk/paraphrase] {len(records)} records -> {len(paths)} batches")
    else:
        print("usage: chunk.py {synthesize|paraphrase}")
        return 1
    for p in paths:
        print(f"  {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
