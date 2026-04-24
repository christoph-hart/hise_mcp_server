"""Build the DPO training set from common_mistakes pairs.

Output schema matches TRL's DPOTrainer expectations:
  {"prompt": <task>, "chosen": <right>, "rejected": <wrong>}

We wrap each mistake as an instruction so the model has a concrete
target rather than a free-form choice.
"""
from __future__ import annotations
import json
import sys

from ..extract.paths import RAW, DIST
from .system_prompt import SYSTEM_PROMPT


def to_dpo(record: dict) -> dict:
    title = (record.get("title") or "").strip()
    reason = (record.get("reason") or "").strip()
    prompt_parts = []
    if title:
        prompt_parts.append(title)
    if reason:
        prompt_parts.append(f"Context: {reason}")
    prompt_parts.append("Write the correct code for this situation.")
    prompt = "\n\n".join(prompt_parts)

    return {
        "prompt": prompt,
        "chosen": record["chosen"],
        "rejected": record["rejected"],
        "system": SYSTEM_PROMPT,
        "source": record.get("source", ""),
    }


def main() -> int:
    in_path = RAW / "common_mistakes.jsonl"
    out_path = DIST / "train_dpo.jsonl"
    if not in_path.exists():
        print(f"[build_dpo] missing {in_path}. Run extract.common_mistakes first.")
        return 1

    n = 0
    with out_path.open("w") as out:
        for line in in_path.open():
            r = json.loads(line)
            if not r.get("chosen") or not r.get("rejected"):
                continue
            out.write(json.dumps(to_dpo(r)) + "\n")
            n += 1
    print(f"[build_dpo] {n} DPO pairs -> {out_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
