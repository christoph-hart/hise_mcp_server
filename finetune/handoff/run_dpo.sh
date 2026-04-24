#!/usr/bin/env bash
# DPO training on top of the SFT adapter.
# Expected wall time: 1-3 hours on RTX 3090.

set -euo pipefail

if [ ! -d "outputs/hise_sft" ]; then
    echo "Missing outputs/hise_sft — run run_sft.sh first."
    exit 1
fi

IMAGE="axolotlai/axolotl:main-latest"

docker run --rm --gpus all \
  -v "$PWD":/workspace \
  -v "$HOME/.cache/huggingface":/root/.cache/huggingface \
  -w /workspace \
  "$IMAGE" \
  accelerate launch -m axolotl.cli.train /workspace/config_dpo.yaml

echo "[dpo] done. Final LoRA at outputs/hise_dpo/"
