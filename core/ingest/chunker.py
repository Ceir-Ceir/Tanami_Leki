from typing import List


def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> List[str]:
    """Split text into overlapping character chunks."""
    if chunk_size <= overlap:
        raise ValueError("chunk_size must be greater than overlap")

    normalized = (text or "").strip()
    if not normalized:
        return []

    chunks: List[str] = []
    start = 0
    step = chunk_size - overlap

    while start < len(normalized):
        end = start + chunk_size
        chunks.append(normalized[start:end])
        start += step

    return chunks
