# Setup — Windows 3090 + Docker + Axolotl

Axolotl ships a Docker image with torch, CUDA, bitsandbytes, flash-attn,
liger-kernel, and peft all pre-compiled. Zero dependency resolution.

## 1. Host Windows prerequisites

- Latest NVIDIA driver (Studio or Game Ready).
- **Docker Desktop for Windows** with WSL2 backend enabled:
  <https://docs.docker.com/desktop/install/windows-install/>
- Enable **Settings -> Resources -> WSL Integration** for your Ubuntu distro.
- Enable **Settings -> Resources -> Advanced -> GPU support** (nvidia).

## 2. Verify GPU is visible to Docker

```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

Should list your 3090. If not: reinstall Docker Desktop, update NVIDIA driver,
reboot Windows host.

## 3. Pull the Axolotl image

```bash
docker pull axolotlai/axolotl:main-latest
```

~15GB. One-time. All Python deps baked in.

## 4. Extract the dataset and cd into it

```bash
unzip hise_lora_dataset.zip -d hise_lora
cd hise_lora
```

## 5. SFT training

```bash
bash run_sft.sh
```

Under the hood this runs:

```bash
docker run --rm --gpus all \
  -v $PWD:/workspace \
  -v $HOME/.cache/huggingface:/root/.cache/huggingface \
  axolotlai/axolotl:main-latest \
  accelerate launch -m axolotl.cli.train /workspace/config_sft.yaml
```

The HuggingFace cache mount is important — it keeps the ~18GB base model
download between runs.

Wall time on RTX 3090: **~8-12 hours** for 7,600 pairs × 3 epochs.

## 6. DPO training

```bash
bash run_dpo.sh
```

Runs on top of the SFT adapter. **~1-3 hours**.

## 7. Merge + evaluate

```bash
bash run_merge.sh          # merges LoRA into base, writes outputs/hise_merged
python evaluate.py         # runs P1-P5 probes, prints score delta
```

`evaluate.py` uses plain transformers + peft (no Axolotl at inference). Install
the tiny eval deps into a plain venv:

```bash
python3 -m venv .venv
source .venv/bin/activate     # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

## 8. Export GGUF for serving

```bash
bash export_gguf.sh        # produces outputs/hise-q4_k_m.gguf
```

Uses llama.cpp's HuggingFace converter (pulled from ghcr.io, no local install).

Serve via LM Studio, `llama-server`, or Ollama.

## Troubleshooting

- **`could not select device driver "" with capabilities: [[gpu]]`**
  Docker Desktop GPU support not enabled. Settings -> Resources -> Advanced.
- **Slow first run**: base model downloads to the HF cache on first launch.
  Subsequent runs skip the ~18GB download.
- **OOM during SFT**: reduce `micro_batch_size` from 1 (already minimum) —
  cannot go lower. Reduce `sequence_len` from 8192 to 4096 instead.
- **Training hangs on "loading checkpoint"**: first-time tokenizer + config
  download from HuggingFace. Wait 2-3 minutes.
- **`CUDA out of memory` on 3090**: edit `config_sft.yaml`, set
  `sequence_len: 4096` and `lora_r: 16` (from 32). Marginally less capacity,
  fits comfortably in 24GB.
