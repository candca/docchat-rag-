from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from entities.document import Document
from helpers.log import get_logger

logger = get_logger(__name__)

TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_./:#-]+|[\u4e00-\u9fff]")


@dataclass
class RetrievalCandidate:
    document: Document
    vector_score: float = 0.0
    bm25_score: float = 0.0
    keyword_score: float = 0.0
    fused_score: float = 0.0
    rerank_score: float = 0.0


def tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(text or "") if token.strip()]


def chunk_key(document: Document) -> tuple[str, str, str]:
    metadata = document.metadata or {}
    document_id = str(metadata.get("document_id") or metadata.get("source") or "")
    chunk_index = str(metadata.get("chunk_index") or "")
    if document_id or chunk_index:
        return (document_id, chunk_index, "")
    return ("", "", document.page_content[:200])


def normalize_scores(scores: dict[tuple[str, str, str], float]) -> dict[tuple[str, str, str], float]:
    if not scores:
        return {}
    values = list(scores.values())
    min_score = min(values)
    max_score = max(values)
    if math.isclose(min_score, max_score):
        return {key: 1.0 for key in scores}
    return {key: (value - min_score) / (max_score - min_score) for key, value in scores.items()}


def keyword_score(query_tokens: list[str], text: str) -> float:
    if not query_tokens:
        return 0.0

    normalized_text = (text or "").lower()
    text_tokens = tokenize(text)
    text_counter = Counter(text_tokens)
    unique_query_tokens = set(query_tokens)

    overlap = sum(min(text_counter[token], 3) for token in unique_query_tokens)
    exact_bonus = sum(2.0 for token in unique_query_tokens if len(token) > 1 and token in normalized_text)
    numeric_bonus = sum(1.5 for token in unique_query_tokens if any(char.isdigit() for char in token) and token in text_counter)
    return overlap + exact_bonus + numeric_bonus


def bm25_scores(query_tokens: list[str], documents: list[Document]) -> dict[tuple[str, str, str], float]:
    if not query_tokens or not documents:
        return {}

    tokenized_docs = [tokenize(document.page_content) for document in documents]
    doc_count = len(tokenized_docs)
    avg_doc_len = sum(len(tokens) for tokens in tokenized_docs) / max(doc_count, 1)
    doc_freqs: Counter[str] = Counter()
    for tokens in tokenized_docs:
        doc_freqs.update(set(tokens))

    query_terms = Counter(query_tokens)
    scores: dict[tuple[str, str, str], float] = {}
    k1 = 1.5
    b = 0.75

    for document, tokens in zip(documents, tokenized_docs, strict=False):
        if not tokens:
            continue
        frequencies = Counter(tokens)
        score = 0.0
        doc_len = len(tokens)
        for term, query_frequency in query_terms.items():
            term_frequency = frequencies.get(term, 0)
            if term_frequency == 0:
                continue
            idf = math.log(1 + (doc_count - doc_freqs[term] + 0.5) / (doc_freqs[term] + 0.5))
            denominator = term_frequency + k1 * (1 - b + b * doc_len / max(avg_doc_len, 1))
            score += idf * (term_frequency * (k1 + 1) / denominator) * query_frequency
        if score > 0:
            scores[chunk_key(document)] = score
    return scores


def build_source(candidate: RetrievalCandidate) -> dict[str, Any]:
    document = candidate.document
    return {
        "score": round(candidate.rerank_score or candidate.fused_score, 3),
        "document": document.metadata.get("source"),
        "content_preview": document.page_content,
        "retrieval": {
            "vector": round(candidate.vector_score, 3),
            "bm25": round(candidate.bm25_score, 3),
            "keyword": round(candidate.keyword_score, 3),
        },
    }


def hybrid_search_with_rerank(
    index: Any,
    query: str,
    where: dict[str, Any] | None = None,
    initial_k: int = 20,
    top_k: int = 5,
    keyword_candidate_limit: int = 1000,
) -> tuple[list[Document], list[dict[str, Any]]]:
    """
    Retrieve with vector, keyword and BM25 signals, then rerank the merged candidates.
    """
    query_tokens = tokenize(query)
    candidates: dict[tuple[str, str, str], RetrievalCandidate] = {}

    try:
        vector_results = index.similarity_search_with_relevance_scores(query=query, k=initial_k, filter=where)
    except Exception as exc:
        logger.warning("Vector retrieval failed; continuing with lexical retrieval: %s", exc)
        vector_results = []

    for document, score in vector_results:
        key = chunk_key(document)
        candidate = candidates.setdefault(key, RetrievalCandidate(document=document))
        candidate.vector_score = max(candidate.vector_score, float(score or 0.0))

    try:
        lexical_pool = index.get_chunks(where=where, limit=keyword_candidate_limit)
    except Exception as exc:
        logger.warning("Keyword/BM25 retrieval failed; using vector candidates only: %s", exc)
        lexical_pool = []

    raw_keyword_scores = {
        chunk_key(document): score
        for document in lexical_pool
        if (score := keyword_score(query_tokens, document.page_content)) > 0
    }
    raw_bm25_scores = bm25_scores(query_tokens, lexical_pool)
    normalized_keyword = normalize_scores(raw_keyword_scores)
    normalized_bm25 = normalize_scores(raw_bm25_scores)

    lexical_keys = set(
        sorted(normalized_keyword, key=normalized_keyword.get, reverse=True)[:initial_k]
        + sorted(normalized_bm25, key=normalized_bm25.get, reverse=True)[:initial_k]
    )

    lexical_by_key = {chunk_key(document): document for document in lexical_pool}
    for key in lexical_keys:
        document = lexical_by_key.get(key)
        if document is None:
            continue
        candidate = candidates.setdefault(key, RetrievalCandidate(document=document))
        candidate.keyword_score = normalized_keyword.get(key, 0.0)
        candidate.bm25_score = normalized_bm25.get(key, 0.0)

    for key, candidate in candidates.items():
        candidate.keyword_score = max(candidate.keyword_score, normalized_keyword.get(key, 0.0))
        candidate.bm25_score = max(candidate.bm25_score, normalized_bm25.get(key, 0.0))
        candidate.fused_score = (
            0.50 * candidate.vector_score
            + 0.30 * candidate.bm25_score
            + 0.20 * candidate.keyword_score
        )
        long_token_hits = sum(
            1
            for token in set(query_tokens)
            if len(token) >= 3 and token in candidate.document.page_content.lower()
        )
        candidate.rerank_score = candidate.fused_score + 0.04 * long_token_hits

    ranked = sorted(candidates.values(), key=lambda item: item.rerank_score, reverse=True)[:top_k]
    logger.info(
        "Hybrid retrieval selected %s/%s chunks for query=%r",
        len(ranked),
        len(candidates),
        query,
    )
    return [candidate.document for candidate in ranked], [build_source(candidate) for candidate in ranked]
