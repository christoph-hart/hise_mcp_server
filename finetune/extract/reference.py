"""Extract training pairs from content/reference/**/*.md.

Reference files mix frontmatter metadata (`llmRef`, `commonMistakes`)
with prose body sections and fenced code examples. For each code block
we emit one record, using the nearest heading + prose as prompt context
and the llmRef summary as auxiliary context for prompt synthesis.

Transcripts are handled separately (extract/transcripts.py).
Excludes content/transcripts/ and content/scripting-api/ (the latter
mirrors data/scripting_api.json).
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

import frontmatter

from .fingerprint import fingerprint
from .paths import CONTENT, RAW


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
CODE_RE = re.compile(r"```(?:[a-zA-Z]+)?\n(.*?)\n```", re.DOTALL)
MIN_CODE_LINES = 2

EXCLUDE_DIRS = {"transcripts", "scripting-api"}


def nearest_heading_before(body: str, pos: int) -> str | None:
    last = None
    for m in HEADING_RE.finditer(body):
        if m.start() > pos:
            break
        last = m.group(2).strip()
    return last


def prose_before(body: str, code_start: int, limit: int = 600) -> str:
    """Take the text between the previous heading (or code block) and this code."""
    # walk back to find boundary
    search_from = max(0, code_start - limit)
    segment = body[search_from:code_start]
    # cut at last heading or previous code fence
    cut = max(segment.rfind("\n#"), segment.rfind("```"))
    if cut >= 0:
        segment = segment[cut:]
    # strip heading line if present
    segment = re.sub(r"^[#\s`]+[^\n]*\n", "", segment, count=1)
    return segment.strip()


def extract_file(path: Path) -> list[dict]:
    post = frontmatter.load(path)
    meta = post.metadata or {}
    body = post.content or ""

    records = []
    for i, m in enumerate(CODE_RE.finditer(body)):
        code = m.group(1).strip()
        if code.count("\n") + 1 < MIN_CODE_LINES:
            continue
        heading = nearest_heading_before(body, m.start())
        prose = prose_before(body, m.start())

        records.append(
            {
                "id": f"{path.stem}::block-{i}",
                "source": str(path.relative_to(CONTENT.parent)),
                "source_type": "reference",
                "title": meta.get("title") or heading or path.stem,
                "section": heading,
                "prose": prose,
                "code": code,
                "fingerprint": fingerprint(code),
                "component_id": meta.get("componentId"),
                "llm_ref": meta.get("llmRef"),
                "description": meta.get("description"),
                "verified": True,
            }
        )
    return records


def should_include(path: Path) -> bool:
    rel = path.relative_to(CONTENT)
    return not any(part in EXCLUDE_DIRS for part in rel.parts)


def main() -> int:
    out_path = RAW / "reference.jsonl"
    records: list[dict] = []
    files = sorted(CONTENT.rglob("*.md"))
    for f in files:
        if not should_include(f):
            continue
        records.extend(extract_file(f))

    with out_path.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"[reference] {len(records)} records -> {out_path.relative_to(CONTENT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
