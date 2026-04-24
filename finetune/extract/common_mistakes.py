"""Extract wrong/right pairs from commonMistakes frontmatter blocks.

Sources:
- content/reference/**/*.md frontmatter `commonMistakes` field
- data/scripting_api.json method-level `pitfalls` / `commonMistakes` field

Emits DPO-ready records: {prompt, chosen, rejected, reason, source}.
These target the API-fabrication failure mode observed in model probes.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import frontmatter

from .paths import CONTENT, DATA, RAW


def from_reference() -> list[dict]:
    records = []
    for path in sorted(CONTENT.rglob("*.md")):
        post = frontmatter.load(path)
        meta = post.metadata or {}
        mistakes = meta.get("commonMistakes") or []
        if not isinstance(mistakes, list):
            continue
        for i, m in enumerate(mistakes):
            if not isinstance(m, dict):
                continue
            wrong = (m.get("wrong") or "").strip()
            right = (m.get("right") or "").strip()
            if not wrong or not right:
                continue
            records.append(
                {
                    "id": f"{path.stem}::mistake-{i}",
                    "source": str(path.relative_to(CONTENT.parent)),
                    "title": m.get("title") or meta.get("title") or path.stem,
                    "chosen": right,
                    "rejected": wrong,
                    "reason": (m.get("explanation") or m.get("reason") or "").strip(),
                    "component_id": meta.get("componentId"),
                }
            )
    return records


def from_scripting_api() -> list[dict]:
    data = json.loads((DATA / "scripting_api.json").read_text())
    records = []
    for cname, cls in data.get("classes", {}).items():
        for field_name in ("commonMistakes", "pitfalls"):
            for i, m in enumerate(cls.get(field_name) or []):
                if not isinstance(m, dict):
                    continue
                wrong = (m.get("wrong") or "").strip()
                right = (m.get("right") or "").strip()
                if not wrong or not right:
                    continue
                records.append(
                    {
                        "id": f"scripting_api::{cname}::{field_name}-{i}",
                        "source": f"data/scripting_api.json::{cname}",
                        "title": m.get("title") or f"{cname} pitfall",
                        "chosen": right,
                        "rejected": wrong,
                        "reason": (m.get("explanation") or m.get("reason") or "").strip(),
                        "class": cname,
                    }
                )
        for method in cls.get("methods", []):
            for field_name in ("commonMistakes", "pitfalls"):
                for i, m in enumerate(method.get(field_name) or []):
                    if not isinstance(m, dict):
                        continue
                    wrong = (m.get("wrong") or "").strip()
                    right = (m.get("right") or "").strip()
                    if not wrong or not right:
                        continue
                    records.append(
                        {
                            "id": f"scripting_api::{cname}.{method['name']}::{field_name}-{i}",
                            "source": f"data/scripting_api.json::{cname}.{method['name']}",
                            "title": m.get("title") or f"{cname}.{method['name']} pitfall",
                            "chosen": right,
                            "rejected": wrong,
                            "reason": (m.get("explanation") or m.get("reason") or "").strip(),
                            "class": cname,
                            "method": method.get("name"),
                        }
                    )
    return records


def main() -> int:
    records = from_reference() + from_scripting_api()
    out_path = RAW / "common_mistakes.jsonl"
    with out_path.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"[common_mistakes] {len(records)} pairs -> {out_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
