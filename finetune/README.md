# HISE LoRA finetune pipeline

Build a QLoRA finetune dataset for a local HISE scripting assistant.
Target model: **Qwen3-Coder-30B-A3B-Instruct** (or Qwen3.6-27B dense) on a 24GB GPU.

## Layout

```
finetune/
├── extract/          stage 1: raw sources → JSONL records
├── augment/          stage 2: LLM prompt synthesis + paraphrase
├── assemble/         stage 3: merge, split, package
├── probe/            P1-P5 evaluation probes
└── handoff/          ships to the 3090 Windows box for training
```

## Flow

```
content/transcripts/*.md ─┐
content/reference/*.md ───┼─> extract/ ─> work/raw/*.jsonl ─┐
data/*.json ──────────────┘                                  │
                                                              v
                                               augment/synthesize_prompts.py
                                                              │
                                                              v
                                                 augment/paraphrase.py
                                                              │
                                                              v
                                            assemble/build_sft.py (+ build_dpo.py)
                                                              │
                                                              v
                                         assemble/split_train_eval.py
                                                              │
                                                              v
                                       assemble/package_handoff.py ─> dist/hise_lora_dataset.zip
```

## Prereqs (this machine, dataset creation)

```bash
cd finetune
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
```

## Run

```bash
# stage 1 — extract (all deterministic, no LLM)
python -m extract.transcripts
python -m extract.reference
python -m extract.json_sources
python -m extract.common_mistakes
python -m extract.dedup

# stage 2 — LLM augmentation
python -m augment.synthesize_prompts   # Pass 1, ~$5
python -m augment.paraphrase           # Pass 2, ~$10

# stage 3 — assemble + package
python -m assemble.build_sft
python -m assemble.build_dpo
python -m assemble.split_train_eval
python -m assemble.package_handoff
```

Output: `dist/hise_lora_dataset.zip` — ship this to the 3090 box.

## On the 3090 box

Unzip, follow `handoff/SETUP.md`. Training runs overnight.

## Cost estimate

| Stage | LLM calls | Cost |
|---|---|---|
| Pass 1 prompt synthesis | ~1000 records | ~$5 |
| Pass 2 paraphrase 4x | ~2000 records × 4 | ~$10 |
| **Total** | | **~$15** |
