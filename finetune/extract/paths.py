"""Shared path constants."""
from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
DATA = ROOT / "data"
WORK = ROOT / "finetune" / "work"
RAW = WORK / "raw"
DIST = ROOT / "finetune" / "dist"

RAW.mkdir(parents=True, exist_ok=True)
DIST.mkdir(parents=True, exist_ok=True)
