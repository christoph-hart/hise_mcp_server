#!/usr/bin/env bash
# Merge LoRA into base weights. Uses DPO adapter if present, else SFT.
# Output: outputs/hise_merged/ (fp16 safetensors, ready for GGUF export).

set -euo pipefail

IMAGE="axolotlai/axolotl:main-latest"
ADAPTER="outputs/hise_dpo"
if [ ! -d "$ADAPTER" ]; then
    ADAPTER="outputs/hise_sft"
fi
if [ ! -d "$ADAPTER" ]; then
    echo "No adapter found. Run run_sft.sh first."
    exit 1
fi

CONFIG="config_dpo.yaml"
if [ "$ADAPTER" = "outputs/hise_sft" ]; then
    CONFIG="config_sft.yaml"
fi

echo "[merge] merging $ADAPTER using $CONFIG"

docker run --rm --gpus all \
  -v "$PWD":/workspace \
  -v "$HOME/.cache/huggingface":/root/.cache/huggingface \
  -w /workspace \
  "$IMAGE" \
  python -m axolotl.cli.merge_lora "/workspace/$CONFIG" \
  --lora_model_dir "/workspace/$ADAPTER" \
  --output_dir "/workspace/outputs/hise_merged"

echo "[merge] done. Merged weights at outputs/hise_merged/"
