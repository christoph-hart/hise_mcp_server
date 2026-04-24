"""Evaluate the trained LoRA on P1-P5 probes.

Loads the merged model (outputs/hise_merged/) if available, else stacks the
DPO or SFT adapter onto the base model at inference time. Uses plain
transformers + peft — no Axolotl dependency at inference.
"""
from __future__ import annotations
import json
import os
import re
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


BASE_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
MERGED_DIR = Path("outputs/hise_merged")
DPO_DIR = Path("outputs/hise_dpo")
SFT_DIR = Path("outputs/hise_sft")
DATA_DIR = Path("data")
MAX_NEW_TOKENS = 1024

SYSTEM_PROMPT = (
    "You write HiseScript, a JavaScript dialect for scripting audio plugins "
    "in the HISE framework (not C++, not browser JS). Use HISE's Content, "
    "Synth, Engine, Console, Colours, and Message APIs. Variables: reg "
    "(realtime), var (init-only), const var (immutable). Callbacks: onInit, "
    "onNoteOn, onNoteOff, onController, onTimer, onControl. Parameter set "
    "via .setAttribute(id, value). UI components via Content.getComponent. "
    "Audio objects via Synth.getChildSynth. Output HiseScript code only."
)

STOCK_JS_RE = re.compile(
    r"\blet\s|=>|\basync\b|console\.log|document\.|window\.|"
    r"`[^`]*`|\.forEach\(|\.map\(|for\s*\([^)]*of\s"
)


def load_model():
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    if MERGED_DIR.exists():
        print(f"[evaluate] loading merged model from {MERGED_DIR}")
        model = AutoModelForCausalLM.from_pretrained(
            str(MERGED_DIR),
            quantization_config=bnb,
            device_map="auto",
            trust_remote_code=True,
        )
        tokenizer = AutoTokenizer.from_pretrained(str(MERGED_DIR), trust_remote_code=True)
        return model, tokenizer

    # Fall back: base + adapter on the fly
    from peft import PeftModel

    adapter = DPO_DIR if DPO_DIR.exists() else SFT_DIR
    if not adapter.exists():
        raise SystemExit(
            "No merged model and no adapter found. "
            "Run run_sft.sh (+ optionally run_dpo.sh) first."
        )
    print(f"[evaluate] loading base {BASE_MODEL} + adapter {adapter}")
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb,
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base, str(adapter))
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    return model, tokenizer


def score_rubric(code: str, rubric: list[str]) -> int:
    score = 0
    for item in rubric:
        tokens = re.findall(r"`([^`]+)`|\"([^\"]+)\"", item)
        signals = [a or b for a, b in tokens]
        if not signals:
            m = re.search(r"(\w+\.\w+\([^)]*\))|(\b\w+\([^)]*\))", item)
            if m:
                signals = [m.group(0)]
        if not signals:
            continue
        if any(s.strip() in code for s in signals):
            score += 1
    return score


def meta_checks(code: str) -> tuple[bool, bool]:
    compiles_like = not re.search(r"(nullptr|->|float\s+\w+\s*=|int\s+\w+\s*=|#include)", code)
    no_stock_js = not STOCK_JS_RE.search(code)
    return compiles_like, no_stock_js


def generate(model, tokenizer, user: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]
    prompt = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=MAX_NEW_TOKENS,
            temperature=0.2,
            top_p=0.9,
            repetition_penalty=1.05,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(
        out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
    )
    m = re.search(r"```(?:[a-zA-Z]+)?\n(.*?)\n```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


def main() -> None:
    model, tokenizer = load_model()

    total = 0
    max_total = 0
    print("\n=== P1-P5 Probes ===")
    with (DATA_DIR / "probes.jsonl").open() as f:
        for line in f:
            probe = json.loads(line)
            code = generate(model, tokenizer, probe["prompt"])
            rubric_score = score_rubric(code, probe["rubric"])
            compiles_like, no_stock_js = meta_checks(code)
            meta_score = int(compiles_like) + int(no_stock_js)
            probe_total = rubric_score + meta_score
            probe_max = probe["max_score"] + 2
            total += probe_total
            max_total += probe_max
            print(
                f"  {probe['id']} {probe['name']:30s}  {probe_total}/{probe_max}  "
                f"(rubric {rubric_score}/{probe['max_score']}, meta {meta_score}/2)"
            )
            print(f"    --- output ---\n{code[:300]}\n")

    print(f"\nProbe total: {total}/{max_total}  ({100*total/max_total:.1f}%)")
    print("Baseline (untrained Qwen3-Coder-30B-A3B): 9/25. Target: 20+/25.")


if __name__ == "__main__":
    main()
