"""Extract training pairs from content/transcripts/*.md.

Each H2 section with prose + fenced code becomes one record:
  prompt     = section heading + preceding prose
  completion = concatenation of fenced code blocks in that section

Transcripts are the highest-quality source (verified, natural
instruction shape, authored by David Healey). ~290 pairs expected.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

import frontmatter

from .fingerprint import fingerprint
from .paths import CONTENT, RAW


SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
CODE_RE = re.compile(r"```(?:[a-zA-Z]+)?\n(.*?)\n```", re.DOTALL)
TIMESTAMP_RE = re.compile(r"\s*\[\d+:\d+\]\s*$")
MIN_PROSE_CHARS = 20
MIN_CODE_LINES = 3


def clean_title(heading: str) -> tuple[str, str | None]:
    m = TIMESTAMP_RE.search(heading)
    timestamp = None
    if m:
        timestamp = m.group(0).strip().strip("[]")
        heading = heading[: m.start()]
    return heading.strip(), timestamp


def extract_file(path: Path) -> list[dict]:
    post = frontmatter.load(path)
    meta = post.metadata or {}
    body = post.content or ""

    sections = []
    matches = list(SECTION_RE.finditer(body))
    if not matches:
        return []

    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        heading = m.group(1)
        title, ts = clean_title(heading)
        section_text = body[start:end]

        code_blocks = CODE_RE.findall(section_text)
        if not code_blocks:
            continue

        first_code_pos = section_text.find("```")
        prose = section_text[:first_code_pos].strip()
        if len(prose) < MIN_PROSE_CHARS:
            continue

        code = "\n\n".join(cb.strip() for cb in code_blocks).strip()
        if code.count("\n") + 1 < MIN_CODE_LINES:
            continue

        sections.append(
            {
                "id": f"{path.stem}::section-{i}",
                "source": str(path.relative_to(CONTENT.parent)),
                "source_type": "transcript",
                "title": title,
                "timestamp": ts,
                "prose": prose,
                "code": code,
                "fingerprint": fingerprint(code),
                "author": meta.get("channel"),
                "video_id": meta.get("videoId"),
                "domain": meta.get("domain"),
                "verified": True,
            }
        )
    return sections


def main() -> int:
    out_path = RAW / "transcripts.jsonl"
    records: list[dict] = []
    files = sorted((CONTENT / "transcripts").rglob("*.md"))
    for f in files:
        records.extend(extract_file(f))

    with out_path.open("w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"[transcripts] {len(records)} records -> {out_path.relative_to(CONTENT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
