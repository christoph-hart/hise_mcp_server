"""Build the SFT training set in ChatML (messages list) format.

Emits one training pair per (prompt, code) combination, expanding
paraphrases. Each record becomes: original + N paraphrases = N+1 pairs.

Output schema (per line):
  {"messages": [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "user", "content": <prompt>},
    {"role": "assistant", "content": <code>},
  ],
   "source": <record id>,
   "source_type": <transcript|reference|forum|snippet|scripting_api>,
   "is_paraphrase": bool}

Unsloth + TRL SFTTrainer ingest this directly.
"""
from __future__ import annotations
import json
import sys

from ..extract.paths import RAW, DIST
from .system_prompt import SYSTEM_PROMPT


def to_pair(prompt: str, code: str, record: dict, is_paraphrase: bool) -> dict:
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt.strip()},
            {"role": "assistant", "content": code.strip()},
        ],
        "source": record["id"],
        "source_type": record.get("source_type"),
        "is_paraphrase": is_paraphrase,
    }


def main() -> int:
    in_path = RAW / "prompts_augmented.jsonl"
    if not in_path.exists():
        print(f"[build_sft] missing {in_path}. Falling back to prompts_synthesized.jsonl")
        in_path = RAW / "prompts_synthesized.jsonl"
    if not in_path.exists():
        print(f"[build_sft] missing {in_path}. Run earlier stages first.")
        return 1

    out_path = DIST / "train_sft.jsonl"
    n_total = n_paraphrase = 0

    with out_path.open("w") as out:
        for line in in_path.open():
            r = json.loads(line)
            prompt = (r.get("final_prompt") or "").strip()
            code = (r.get("code") or "").strip()
            if not prompt or not code:
                continue
            out.write(json.dumps(to_pair(prompt, code, r, False)) + "\n")
            n_total += 1
            for para in r.get("paraphrases") or []:
                para = (para or "").strip()
                if not para:
                    continue
                out.write(json.dumps(to_pair(para, code, r, True)) + "\n")
                n_total += 1
                n_paraphrase += 1

    print(f"[build_sft] {n_total} pairs ({n_paraphrase} paraphrased) -> {out_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
