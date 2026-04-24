"""Collate subagent output files into the single JSONL the pipeline expects.

Subagents write to work/outputs/synth_NNN.jsonl and work/outputs/para_NNN.jsonl
with minimal fields (id + synthesized_prompt or id + paraphrases).
This script merges those back into the full deduped records, producing
prompts_synthesized.jsonl and prompts_augmented.jsonl as if the Anthropic
scripts had been run.
"""
from __future__ import annotations
import json
import sys

from ..extract.paths import RAW, WORK


MIN_PROSE = 30


def load_outputs(glob_pattern: str) -> dict[str, dict]:
    """Load all subagent output files; map id -> output fields."""
    out: dict[str, dict] = {}
    outputs_dir = WORK / "outputs"
    if not outputs_dir.exists():
        return out
    for p in sorted(outputs_dir.glob(glob_pattern)):
        with p.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                rid = rec.get("id")
                if rid:
                    out[rid] = rec
    return out


def needs_synthesis(r: dict) -> bool:
    if r.get("source_type") in ("transcript", "reference"):
        return False
    return len((r.get("prose") or "").strip()) < MIN_PROSE


def collate_synthesized() -> int:
    """Merge synth_*.jsonl subagent outputs into prompts_synthesized.jsonl."""
    records = [json.loads(line) for line in (RAW / "deduped.jsonl").open()]
    synth = load_outputs("synth_*.jsonl")

    hit = miss = passthrough = 0
    out_path = RAW / "prompts_synthesized.jsonl"
    with out_path.open("w") as f:
        for r in records:
            if needs_synthesis(r):
                s = synth.get(r["id"])
                if s and s.get("synthesized_prompt"):
                    r["synthesized_prompt"] = s["synthesized_prompt"]
                    r["final_prompt"] = s["synthesized_prompt"]
                    hit += 1
                else:
                    # fall back to title if subagent missed this record
                    r["synthesized_prompt"] = None
                    r["final_prompt"] = (r.get("title") or r.get("prose") or "").strip()
                    miss += 1
            else:
                r["synthesized_prompt"] = None
                r["final_prompt"] = (r.get("prose") or r.get("title") or "").strip()
                passthrough += 1
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    total_synth_needed = hit + miss
    print(
        f"[collate/synthesize] {len(records)} records. "
        f"synth hit={hit} miss={miss} (of {total_synth_needed} needing synth), "
        f"passthrough={passthrough} -> {out_path.name}"
    )
    return 0


def collate_paraphrased() -> int:
    """Merge para_*.jsonl subagent outputs into prompts_augmented.jsonl."""
    in_path = RAW / "prompts_synthesized.jsonl"
    if not in_path.exists():
        print(f"[collate/paraphrase] need {in_path} first (run collate_synthesized)")
        return 1
    records = [json.loads(line) for line in in_path.open()]
    para = load_outputs("para_*.jsonl")

    hit = miss = 0
    total_para = 0
    out_path = RAW / "prompts_augmented.jsonl"
    with out_path.open("w") as f:
        for r in records:
            p = para.get(r["id"])
            if p and p.get("paraphrases"):
                r["paraphrases"] = p["paraphrases"]
                total_para += len(p["paraphrases"])
                hit += 1
            else:
                r["paraphrases"] = []
                miss += 1
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(
        f"[collate/paraphrase] {len(records)} records. "
        f"hit={hit} miss={miss}, {total_para} paraphrases merged -> {out_path.name}"
    )
    return 0


def main(mode: str) -> int:
    if mode == "synthesize":
        return collate_synthesized()
    if mode == "paraphrase":
        return collate_paraphrased()
    print("usage: collate.py {synthesize|paraphrase}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
