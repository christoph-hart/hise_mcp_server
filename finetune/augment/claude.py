"""Shared Anthropic client with prompt caching and parallel dispatch."""
from __future__ import annotations
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Iterable, TypeVar

from anthropic import Anthropic


T = TypeVar("T")
U = TypeVar("U")


_client: Anthropic | None = None


def client() -> Anthropic:
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        _client = Anthropic()
    return _client


def cached_system(text: str) -> list[dict]:
    """Return a system block list with cache_control enabled.

    Anthropic prompt caching caches content blocks marked with
    cache_control; cache hits are 90% cheaper than writes and the TTL
    is 5 minutes. For batch augmentation we fire many calls in quick
    succession, so the system prompt should be cached.
    """
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def map_parallel(
    fn: Callable[[T], U],
    items: Iterable[T],
    max_workers: int = 8,
    total: int | None = None,
    progress: bool = True,
) -> list[U]:
    items = list(items)
    results: list[U | None] = [None] * len(items)
    ok = 0
    err = 0

    try:
        from tqdm import tqdm

        bar = tqdm(total=total if total is not None else len(items), disable=not progress)
    except ImportError:
        bar = None

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(fn, item): i for i, item in enumerate(items)}
        for fut in as_completed(futures):
            i = futures[fut]
            try:
                results[i] = fut.result()
                ok += 1
            except Exception as e:
                err += 1
                print(f"[error idx={i}] {e}")
            if bar:
                bar.update(1)
    if bar:
        bar.close()
    print(f"[parallel] ok={ok} err={err}")
    return [r for r in results if r is not None]
