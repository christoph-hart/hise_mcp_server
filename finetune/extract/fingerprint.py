"""Code fingerprinting for cross-source deduplication.

Normalizes code by stripping comments, string contents, and whitespace,
then hashes. Two code blocks with equivalent structure produce the same
fingerprint regardless of variable renaming or string literal changes.
"""
from __future__ import annotations
import hashlib
import re


_COMMENT_LINE = re.compile(r"//.*")
_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.DOTALL)
_STRING_DOUBLE = re.compile(r'"[^"]*"')
_STRING_SINGLE = re.compile(r"'[^']*'")
_WHITESPACE = re.compile(r"\s+")


def normalize(code: str) -> str:
    s = _COMMENT_BLOCK.sub("", code)
    s = _COMMENT_LINE.sub("", s)
    s = _STRING_DOUBLE.sub('""', s)
    s = _STRING_SINGLE.sub("''", s)
    s = _WHITESPACE.sub("", s)
    return s


def fingerprint(code: str) -> str:
    return hashlib.sha256(normalize(code).encode()).hexdigest()[:16]
