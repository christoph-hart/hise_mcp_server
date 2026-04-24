"""Bundle dataset + training scripts into a single archive for the 3090 box.

Produces dist/hise_lora_dataset.zip containing:
  README.md           (generated with live dataset stats)
  SETUP.md            (WSL2 + Unsloth install)
  requirements.txt
  train_sft.py
  train_dpo.py
  evaluate.py
  export_gguf.sh
  data/
    train_sft.jsonl
    eval_sft.jsonl
    train_dpo.jsonl
    probes.jsonl
"""
from __future__ import annotations
import json
import shutil
import sys
from pathlib import Path
import zipfile

from ..extract.paths import DIST, ROOT


HANDOFF = ROOT / "finetune" / "handoff"
PROBES = ROOT / "finetune" / "probe" / "probes.jsonl"


def count_jsonl(p: Path) -> int:
    if not p.exists():
        return 0
    with p.open() as f:
        return sum(1 for _ in f)


def build_readme(train_n: int, eval_n: int, dpo_n: int) -> str:
    return f"""# HISE LoRA dataset

Target base model: **Qwen3-Coder-30B-A3B-Instruct**.
Train on: single 24GB GPU (RTX 3090 / 4090) via **Axolotl Docker**.

## Contents

| File | Count | Purpose |
|---|---|---|
| `data/train_sft.jsonl` | {train_n} | SFT training set (ChatML messages) |
| `data/eval_sft.jsonl` | {eval_n} | Held-out forum examples for eval |
| `data/train_dpo.jsonl` | {dpo_n} | DPO pairs from commonMistakes |
| `data/probes.jsonl` | 5 | P1-P5 probe prompts with rubric |

## Training flow

1. Setup per `SETUP.md` (Docker Desktop + nvidia-docker, one-time).
2. `bash run_sft.sh` — QLoRA SFT via Axolotl Docker (~8-12h on 3090).
3. `bash run_dpo.sh` — DPO on top of SFT (~1-3h).
4. `bash run_merge.sh` — merge LoRA into base fp16 weights.
5. `python evaluate.py` — runs P1-P5 probes, prints score delta.
6. `bash export_gguf.sh` — converts merged model to Q4_K_M GGUF for serving.

## Why Axolotl (not Unsloth)

Unsloth is faster (1.5-2x) but notoriously install-hostile on Windows:
custom CUDA kernels pinned to specific torch/triton/CUDA versions.
Axolotl ships a pre-built Docker image with torch, CUDA, bitsandbytes,
flash-attn, and liger-kernel all resolved. Zero dep hell.

With `flash_attention: true` + liger-kernel plugin (both set in the config),
Axolotl recovers most of the speed gap. Still overnight-runnable.

## Expected outcome

Baseline (untrained): ~9/25 on P1-P5, frequent API fabrication, C++/JS confusion.
Target after SFT + DPO: ~20+/25, minimal fabrication, stable dialect identity.

## Hyperparameters (already set in config_sft.yaml)

| Param | Value |
|---|---|
| LoRA rank | 32 |
| LoRA alpha | 64 |
| LoRA dropout | 0.05 |
| Target modules | all linear |
| Epochs | 3 |
| Learning rate | 2e-4 cosine |
| Warmup ratio | 0.03 |
| Micro batch × accum | 1 × 16 (effective 16) |
| Train seq length | 8192 |
| Precision | bf16, flash-attn, liger kernels |
"""


def main() -> int:
    needed = {
        "train_sft": DIST / "train_sft.jsonl",
        "eval_sft": DIST / "eval_sft.jsonl",
        "train_dpo": DIST / "train_dpo.jsonl",
    }
    for name, path in needed.items():
        if not path.exists():
            print(f"[package] missing {name}: {path}")
            return 1
    if not PROBES.exists():
        print(f"[package] missing probes: {PROBES}")
        return 1

    stage = DIST / "stage"
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "data").mkdir(parents=True)

    # handoff files
    for name in [
        "SETUP.md",
        "requirements.txt",
        "config_sft.yaml",
        "config_dpo.yaml",
        "run_sft.sh",
        "run_dpo.sh",
        "run_merge.sh",
        "evaluate.py",
        "export_gguf.sh",
    ]:
        src = HANDOFF / name
        if src.exists():
            shutil.copy(src, stage / name)
        else:
            print(f"[package] warning: handoff file missing: {name}")
    # preserve executable bit on .sh files
    for shname in stage.glob("*.sh"):
        shname.chmod(0o755)

    # data
    for name in ("train_sft.jsonl", "eval_sft.jsonl", "train_dpo.jsonl"):
        shutil.copy(DIST / name, stage / "data" / name)
    shutil.copy(PROBES, stage / "data" / "probes.jsonl")

    # README
    train_n = count_jsonl(DIST / "train_sft.jsonl")
    eval_n = count_jsonl(DIST / "eval_sft.jsonl")
    dpo_n = count_jsonl(DIST / "train_dpo.jsonl")
    (stage / "README.md").write_text(build_readme(train_n, eval_n, dpo_n))

    # zip
    zip_path = DIST / "hise_lora_dataset.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in stage.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(stage))

    print(f"[package] wrote {zip_path} (train={train_n} eval={eval_n} dpo={dpo_n})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
