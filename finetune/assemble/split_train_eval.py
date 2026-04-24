"""Split SFT data into train and held-out eval.

Strategy: stratified sampling from forum_examples only, since those are
the most representative of production workloads. We hold out ~50 forum
records (originals only, no paraphrases) and everything else stays in
the train split.

This ensures the eval measures generalization to unseen problem
statements, not memorization of paraphrases.
"""
from __future__ import annotations
import json
import random
import sys

from ..extract.paths import DIST

EVAL_COUNT = 50
SEED = 42


def main() -> int:
    sft_path = DIST / "train_sft.jsonl"
    if not sft_path.exists():
        print(f"[split] missing {sft_path}. Run build_sft first.")
        return 1

    records = [json.loads(line) for line in sft_path.open()]
    forum_originals = [
        r for r in records
        if r.get("source_type") == "forum" and not r.get("is_paraphrase")
    ]

    rng = random.Random(SEED)
    rng.shuffle(forum_originals)
    eval_records = forum_originals[:EVAL_COUNT]
    eval_source_ids = {r["source"] for r in eval_records}

    # Drop held-out source IDs entirely (including their paraphrases).
    train_records = [r for r in records if r["source"] not in eval_source_ids]

    train_path = DIST / "train_sft.jsonl"  # overwrite
    eval_path = DIST / "eval_sft.jsonl"

    with train_path.open("w") as f:
        for r in train_records:
            f.write(json.dumps(r) + "\n")
    with eval_path.open("w") as f:
        for r in eval_records:
            f.write(json.dumps(r) + "\n")

    print(f"[split] train={len(train_records)} eval={len(eval_records)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
