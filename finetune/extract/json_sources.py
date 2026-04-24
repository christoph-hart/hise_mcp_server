"""Extract training pairs from data/*.json.

Three sources:
- scripting_api.json: per-method examples with {title, code}
- snippet_dataset.json: flat list with {title, description, code}
- forum_examples.json: flat list with validated forum solutions
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

from .fingerprint import fingerprint
from .paths import DATA, RAW


def extract_scripting_api() -> list[dict]:
    data = json.loads((DATA / "scripting_api.json").read_text())
    records = []
    for cname, cls in data.get("classes", {}).items():
        for method in cls.get("methods", []):
            for i, ex in enumerate(method.get("examples") or []):
                code = (ex.get("code") or "").strip()
                if not code:
                    continue
                records.append(
                    {
                        "id": f"scripting_api::{cname}.{method['name']}::{i}",
                        "source": "data/scripting_api.json",
                        "source_type": "scripting_api",
                        "class": cname,
                        "method": method.get("name"),
                        "title": ex.get("title"),
                        "method_description": method.get("description"),
                        "prose": ex.get("title") or "",
                        "code": code,
                        "fingerprint": fingerprint(code),
                        "verified": True,
                    }
                )
    return records


def extract_snippets() -> list[dict]:
    data = json.loads((DATA / "snippet_dataset.json").read_text())
    records = []
    for i, e in enumerate(data):
        code = (e.get("code") or "").strip()
        if not code:
            continue
        records.append(
            {
                "id": f"snippet::{i}",
                "source": "data/snippet_dataset.json",
                "source_type": "snippet",
                "title": e.get("title"),
                "category": e.get("category"),
                "tags": e.get("tags") or [],
                "description": e.get("description") or "",
                "prose": (e.get("description") or "").strip(),
                "code": code,
                "fingerprint": fingerprint(code),
                "verified": True,
            }
        )
    return records


def extract_forum() -> list[dict]:
    data = json.loads((DATA / "forum_examples.json").read_text())
    records = []
    for i, e in enumerate(data):
        code = (e.get("code") or "").strip()
        if not code:
            continue
        records.append(
            {
                "id": f"forum::{i}",
                "source": "data/forum_examples.json",
                "source_type": "forum",
                "title": e.get("title"),
                "category": e.get("category"),
                "tags": e.get("tags") or [],
                "description": e.get("description") or "",
                "prose": (e.get("description") or "").strip(),
                "code": code,
                "fingerprint": fingerprint(code),
                "url": e.get("url"),
                "featured": bool(e.get("featured")),
                "verified": bool(e.get("validated")),
            }
        )
    return records


def main() -> int:
    sets = {
        "scripting_api": extract_scripting_api(),
        "snippets": extract_snippets(),
        "forum": extract_forum(),
    }
    for name, recs in sets.items():
        path = RAW / f"{name}.jsonl"
        with path.open("w") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"[{name}] {len(recs)} records -> {path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
