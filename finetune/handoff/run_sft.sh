#!/usr/bin/env bash
# SFT training on Qwen3-Coder-30B-A3B-Instruct via Axolotl Docker.
# Expected wall time: 8-12 hours on RTX 3090.

set -euo pipefail

IMAGE="axolotlai/axolotl:main-latest"

docker run --rm --gpus all \
  -v "$PWD":/workspace \
  -v "$HOME/.cache/huggingface":/root/.cache/huggingface \
  -w /workspace \
  "$IMAGE" \
  accelerate launch -m axolotl.cli.train /workspace/config_sft.yaml

echo "[sft] done. LoRA at outputs/hise_sft/"
