"""Pass 2: paraphrase prompts to multiply training pairs.

For each (prompt, code) pair, generate N alternative prompt phrasings.
Code stays fixed; only the prompt varies. Effect: model learns the
concept, not one phrasing.

Filter paraphrases that drop key HISE API references (regex check).
"""
from __future__ import annotations
import json
import re
import sys

from .claude import cached_system, client, map_parallel
from ..extract.paths import RAW


MODEL = "claude-haiku-4-5-20251001"
N_PARAPHRASES = 3  # 1 original + 3 paraphrases = 4x multiplier

SYSTEM = """You rephrase HISE scripting developer questions.

Given one user question and the corresponding HISE code, produce N \
alternative phrasings of the question. Vary:
- tone (beginner curious / expert terse / problem-statement)
- length (short fragment / full sentence / multi-sentence)
- entry angle (how-do-I / show-me / I want to X / description of symptom)

Rules:
- Output as a numbered list, one paraphrase per line, no code.
- Each paraphrase MUST still hint at the key API domain (LAF / sampler / \
MIDI / timer / knob / etc) so the code remains a reasonable answer.
- Do not invent new requirements, do not drop essential details.
- Do not include the original phrasing.
"""


API_SIGNALS = [
    ("laf", ["createLocalLookAndFeel", "registerFunction", "drawToggleButton", "drawRotarySlider"]),
    ("sampler", ["asSampler", "isNoteNumberMapped", "Sampler"]),
    ("midi", ["Message.", "onNoteOn", "onNoteOff", "onController"]),
    ("timer", ["startTimer", "onTimer", "createTimerObject"]),
    ("ui_knob", ["addKnob", "addSlider", "setLocalLookAndFeel"]),
    ("graphics", ["g.fillRect", "g.drawAlignedText", "g.setColour"]),
    ("colour", ["Colours.", "withAlpha"]),
    ("broadcast", ["Broadcaster", "attachTo"]),
    ("file", [".writeString", ".loadAsString", "File("]),
]


def signals_in_code(code: str) -> set[str]:
    hit = set()
    for label, patterns in API_SIGNALS:
        for p in patterns:
            if p in code:
                hit.add(label)
                break
    return hit


def paraphrase_keeps_signal(text: str, required_signals: set[str]) -> bool:
    """Paraphrase must reference at least one hint per required signal domain."""
    if not required_signals:
        return True
    text_l = text.lower()
    keywords = {
        "laf": ["laf", "look and feel", "look-and-feel", "draw", "custom render"],
        "sampler": ["sampler", "sample", "note mapped", "mapped key"],
        "midi": ["midi", "note", "cc", "control change", "velocity"],
        "timer": ["timer", "ms", "millisecond", "delay", "after"],
        "ui_knob": ["knob", "slider", "control", "interface"],
        "graphics": ["draw", "render", "paint", "graphic"],
        "colour": ["color", "colour", "alpha", "transparen"],
        "broadcast": ["broadcast", "listener", "notify", "attach"],
        "file": ["file", "save", "load", "read", "write"],
    }
    for sig in required_signals:
        kws = keywords.get(sig, [])
        if not any(k in text_l for k in kws):
            return False
    return True


def build_user(record: dict, n: int) -> str:
    prompt = record["final_prompt"]
    code = record["code"]
    return (
        f"Generate {n} alternative phrasings for this developer question:\n\n"
        f"ORIGINAL: {prompt}\n\n"
        f"CODE:\n```javascript\n{code}\n```\n\n"
        f"Output {n} numbered paraphrases, one per line, varied in tone/length/angle."
    )


def parse_list(text: str, n: int) -> list[str]:
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(\d+)[\.\)]\s+(.+)$", line)
        if m:
            items.append(m.group(2).strip())
        elif line.startswith(("-", "*", "•")):
            items.append(line.lstrip("-*• ").strip())
    return items[:n]


def paraphrase_record(record: dict) -> dict:
    required = signals_in_code(record["code"])
    msg = client().messages.create(
        model=MODEL,
        max_tokens=400,
        system=cached_system(SYSTEM),
        messages=[{"role": "user", "content": build_user(record, N_PARAPHRASES)}],
    )
    raw = msg.content[0].text
    paraphrases = parse_list(raw, N_PARAPHRASES)
    kept = [p for p in paraphrases if paraphrase_keeps_signal(p, required)]
    record["paraphrases"] = kept
    record["paraphrases_rejected"] = [p for p in paraphrases if p not in kept]
    return record


def main() -> int:
    in_path = RAW / "prompts_synthesized.jsonl"
    out_path = RAW / "prompts_augmented.jsonl"
    if not in_path.exists():
        print(f"[paraphrase] missing input {in_path}. Run synthesize_prompts first.")
        return 1

    records = [json.loads(line) for line in in_path.open()]
    print(f"[paraphrase] augmenting {len(records)} records with {N_PARAPHRASES} paraphrases each")

    augmented = map_parallel(paraphrase_record, records, max_workers=10)

    with out_path.open("w") as f:
        for r in augmented:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    total_para = sum(len(r.get("paraphrases") or []) for r in augmented)
    print(f"[paraphrase] {len(augmented)} records, {total_para} paraphrases kept -> {out_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
