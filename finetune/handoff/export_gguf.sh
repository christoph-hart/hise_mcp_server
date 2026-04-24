#!/usr/bin/env bash
# Convert the merged model to GGUF Q4_K_M for local serving.
# Uses the ghcr.io llama.cpp Docker image — no local llama.cpp install.

set -euo pipefail

MERGED_DIR="outputs/hise_merged"
GGUF_PATH="outputs/hise-q4_k_m.gguf"

if [ ! -d "$MERGED_DIR" ]; then
    echo "Missing $MERGED_DIR. Run run_merge.sh first."
    exit 1
fi

IMAGE="ghcr.io/ggml-org/llama.cpp:full"

# 1. Convert HF safetensors -> GGUF fp16
docker run --rm \
  -v "$PWD":/workspace \
  "$IMAGE" \
  --convert "/workspace/$MERGED_DIR" --outtype f16 --outfile "/workspace/outputs/hise-f16.gguf"

# 2. Quantize fp16 -> Q4_K_M
docker run --rm \
  -v "$PWD":/workspace \
  "$IMAGE" \
  --quantize "/workspace/outputs/hise-f16.gguf" "/workspace/$GGUF_PATH" Q4_K_M

rm -f "outputs/hise-f16.gguf"

echo "[gguf] wrote $GGUF_PATH"
echo "[serve] example: llama-server -m $GGUF_PATH -c 131072 --host 0.0.0.0 --port 8080"
