"""Pass 1: synthesize natural-language prompts for records with weak prose.

Records from scripting_api.json and some snippet entries have terse
titles instead of instruction-shaped prose. This pass feeds
(title, code, optional metadata) to Claude Haiku and produces a single
user-question phrasing.

Transcripts and reference records already have natural prose and are
passed through unchanged (prose used directly as prompt).
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

from .claude import cached_system, client, map_parallel
from ..extract.paths import RAW


MODEL = "claude-haiku-4-5-20251001"

SYSTEM = """You turn HISE scripting code examples into natural developer questions.

Given code plus metadata, produce ONE short user question (10-30 words) that a \
HISE developer would ask to get this code as the answer. Match the phrasing \
level to the code complexity: short/fragment for trivial snippets, full \
sentence for full scripts.

Rules:
- Output ONLY the question text, no quotes, no preamble.
- Reference key APIs from the code (e.g. mention "LAF" if code uses \
createLocalLookAndFeel, "sampler" if code uses asSampler).
- Sound like a real developer, not a tutorial writer. "How do I..." / \
"Show me..." / fragment like "multi-band EQ with LFO" are all fine.
- Do not invent requirements not in the code.
"""


MIN_PROSE = 30  # chars; below this, synthesize a prompt


def needs_synthesis(record: dict) -> bool:
    # Transcripts and reference always have prose; skip.
    if record.get("source_type") in ("transcript", "reference"):
        return False
    prose = (record.get("prose") or "").strip()
    return len(prose) < MIN_PROSE


def build_user_message(record: dict) -> str:
    parts = []
    if record.get("source_type") == "scripting_api":
        parts.append(f"Class.method: {record.get('class')}.{record.get('method')}")
        if record.get("method_description"):
            parts.append(f"Method description: {record['method_description'][:400]}")
    if record.get("title"):
        parts.append(f"Title: {record['title']}")
    if record.get("description"):
        parts.append(f"Description: {record['description']}")
    if record.get("category"):
        parts.append(f"Category: {record['category']}")
    if record.get("tags"):
        parts.append(f"Tags: {', '.join(record['tags'])}")
    parts.append(f"Code:\n```javascript\n{record['code']}\n```")
    return "\n\n".join(parts)


def synthesize(record: dict) -> dict:
    if not needs_synthesis(record):
        record["synthesized_prompt"] = None
        record["final_prompt"] = record.get("prose", "").strip()
        return record
    msg = client().messages.create(
        model=MODEL,
        max_tokens=200,
        system=cached_system(SYSTEM),
        messages=[{"role": "user", "content": build_user_message(record)}],
    )
    text = msg.content[0].text.strip().strip('"').strip()
    record["synthesized_prompt"] = text
    record["final_prompt"] = text
    return record


def main() -> int:
    in_path = RAW / "deduped.jsonl"
    out_path = RAW / "prompts_synthesized.jsonl"
    if not in_path.exists():
        print(f"[synthesize] missing input {in_path}. Run extraction + dedup first.")
        return 1

    records = [json.loads(line) for line in in_path.open()]
    to_synth = [r for r in records if needs_synthesis(r)]
    passthrough = [r for r in records if not needs_synthesis(r)]

    print(
        f"[synthesize] {len(records)} records total; "
        f"{len(to_synth)} need synthesis, {len(passthrough)} pass through"
    )

    # passthrough: just set final_prompt
    for r in passthrough:
        r["synthesized_prompt"] = None
        r["final_prompt"] = (r.get("prose") or r.get("title") or "").strip()

    synthesized = map_parallel(synthesize, to_synth, max_workers=8)
    all_records = passthrough + synthesized

    with out_path.open("w") as f:
        for r in all_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"[synthesize] wrote {len(all_records)} records -> {out_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
