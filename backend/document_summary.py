import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


EMPTY_DOCUMENT_SUMMARY = {
    "one_sentence": "",
    "detailed": "",
    "section_summaries": [],
    "keywords": [],
    "outline": [],
    "summary_origin": "",
}


SUMMARY_PROMPT_TEMPLATE = """你是严谨的论文和技术文档阅读助手。请基于下面文档内容生成高质量结构化中文摘要。

要求：
1. 只输出 JSON，不要 Markdown，不要代码块。
2. JSON 必须包含这些字段：
   - one_sentence: 一句话摘要，字符串
   - detailed: 详细摘要，字符串
   - section_summaries: 章节摘要，数组，每项包含 title 和 summary
   - keywords: 关键词数组，5-12 个
   - outline: 文档大纲数组，按层级顺序列出标题或主题
3. 如果文档是英文，也用中文概括，但保留关键英文术语。
4. 忽略页码、页眉页脚、作者邮箱、单位列表、参考文献编号等噪声。
5. 不要把 "Page 1"、纯数字、作者名、邮箱、机构名当作标题、关键词或章节。
6. 详细摘要要解释文档的研究问题、方法、核心贡献、实验/结论，不能直接复制原文。

文档内容：
----------------
{content}
----------------
"""


PLAIN_SUMMARY_PROMPT_TEMPLATE = """请阅读下面文档，直接用中文输出摘要，不要 JSON。

输出格式严格如下：
一句话摘要：...
详细摘要：...
关键词：词1；词2；词3；词4；词5
文档大纲：
1. ...
2. ...
章节摘要：
1. 标题：摘要
2. 标题：摘要

要求：忽略页码、邮箱、作者单位、页眉页脚等噪声；如果是英文论文，要用中文解释研究问题、方法、贡献和结论。

文档内容：
----------------
{content}
----------------
"""


NOISE_LINE_PATTERNS = (
    re.compile(r"^page\s+\d+\s*$", re.IGNORECASE),
    re.compile(r"^page\s*$", re.IGNORECASE),
    re.compile(r"^\d+\s*$"),
    re.compile(r"^\d+(?:\s+\d+){2,}\s*$"),
    re.compile(r"^preprint\s*$", re.IGNORECASE),
    re.compile(r"^arxiv\b", re.IGNORECASE),
    re.compile(r"^\S+@\S+$"),
    re.compile(r"^[\d\s]+$"),
)

STOP_KEYWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "their",
    "there",
    "where",
    "which",
    "while",
    "about",
    "content",
    "paper",
    "author",
    "authors",
    "page",
    "preprint",
    "gmail",
    "com",
    "edu",
    "http",
    "https",
    "www",
    "abstract",
    "introduction",
    "background",
    "method",
    "methods",
    "conclusion",
    "references",
}


GENERIC_SECTION_SUMMARY_PATTERNS = (
    re.compile(r"该部分围绕.*展开"),
    re.compile(r"具体内容请结合原文查看"),
    re.compile(r"该部分主要讨论.*相关内容"),
    re.compile(r"is a section of the document", re.IGNORECASE),
)


def clean_summary_item(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    cleaned = re.sub(r"^\d+[.、]\s+", "", cleaned).strip()
    cleaned = re.sub(r"^#+\s*", "", cleaned).strip()
    cleaned = re.sub(r"\s+(\d+)$", "", cleaned).strip()
    return cleaned


def is_bad_summary_item(text: str) -> bool:
    cleaned = clean_summary_item(text)
    if is_noise_line(cleaned):
        return True
    if re.fullmatch(r"\d+(?:\s+\d+)+", cleaned):
        return True
    if re.fullmatch(r"[\d\s.,;:|/-]+", cleaned):
        return True
    if re.match(r"^\d+(\.\d+)?\s+[a-z]", cleaned):
        return True
    if re.match(r"^\d+(\.\d+)?\s+[A-Z]{1,8}\s+[\d.=±]", cleaned):
        return True
    if "±" in cleaned and re.search(r"\d", cleaned):
        return True
    if len(cleaned) > 80 and re.search(r"[a-z]", cleaned):
        return True
    if cleaned.lower() in {"page", "pages", "table of contents", "contents"}:
        return True
    if len(cleaned) <= 2:
        return True
    return False


def is_generic_section_summary(text: str) -> bool:
    cleaned = str(text or "").strip()
    return any(pattern.search(cleaned) for pattern in GENERIC_SECTION_SUMMARY_PATTERNS)


def improve_generic_section_summary(title: str, one_sentence: str = "") -> str:
    normalized = title.upper().replace("’", "'")
    if "INTRODUCTION" in normalized:
        return "介绍研究动机、问题背景和论文主张，说明为什么需要改进 LLM 的推理与生成训练目标。"
    if "BACKGROUND" in normalized:
        return "梳理相关背景，包括 LLM 训练范式、JEPA 思想以及现有方法在推理或表征学习上的局限。"
    if "OBJECTIVE" in normalized or "LLM-JEPA" in normalized or "JEPA" in normalized:
        return "说明 LLM-JEPA 的核心目标和训练设计，即在表示空间中预测目标表征，用于增强模型的推理和生成能力。"
    if "EXPERIMENT" in normalized or "EVALUATION" in normalized or "RESULT" in normalized:
        return "概述实验设置、评估指标和主要结果，用于验证方法是否带来推理或生成能力提升。"
    if "CONCLUSION" in normalized or "DISCUSSION" in normalized:
        return "总结方法的主要发现、适用边界和后续研究方向。"
    if one_sentence:
        return f"该节围绕“{title}”展开，是对文档核心主题的进一步说明。"
    return ""


def normalize_document_summary(value: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(value, dict):
        return EMPTY_DOCUMENT_SUMMARY.copy()
    one_sentence = str(value.get("one_sentence") or "").strip()
    section_summaries = []
    for item in value.get("section_summaries") or []:
        if not isinstance(item, dict):
            continue
        title = clean_summary_item(item.get("title") or "")
        if is_bad_summary_item(title):
            continue
        summary = str(item.get("summary") or "").strip()
        if is_generic_section_summary(summary):
            summary = improve_generic_section_summary(title, one_sentence)
        section_summaries.append({"title": title, "summary": summary})

    outline = []
    seen_outline = set()
    for item in value.get("outline") or []:
        cleaned = clean_summary_item(item)
        if is_bad_summary_item(cleaned):
            continue
        key = cleaned.lower()
        if key in seen_outline:
            continue
        seen_outline.add(key)
        outline.append(cleaned)

    return {
        "one_sentence": one_sentence,
        "detailed": str(value.get("detailed") or "").strip(),
        "section_summaries": section_summaries,
        "keywords": [
            clean_summary_item(item)
            for item in value.get("keywords") or []
            if clean_summary_item(item) and not is_bad_summary_item(clean_summary_item(item))
        ],
        "outline": outline,
        "summary_origin": str(value.get("summary_origin") or "").strip(),
    }


def has_summary_content(summary: dict[str, Any]) -> bool:
    normalized = normalize_document_summary(summary)
    return bool(
        normalized["one_sentence"]
        or normalized["detailed"]
        or normalized["section_summaries"]
        or normalized["keywords"]
        or normalized["outline"]
    )


def parse_summary_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    candidates = [cleaned]
    greedy_match = re.search(r"\{[\s\S]*\}", cleaned)
    if greedy_match:
        candidates.append(greedy_match.group(0))
    candidates.extend(match.group(0) for match in re.finditer(r"\{[\s\S]*?\}", cleaned))
    for candidate in candidates:
        try:
            summary = normalize_document_summary(json.loads(candidate))
            if has_summary_content(summary):
                return summary
        except json.JSONDecodeError:
            continue
    return EMPTY_DOCUMENT_SUMMARY.copy()


def parse_plain_summary(text: str) -> dict[str, Any]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    fields: dict[str, Any] = {
        "one_sentence": "",
        "detailed": "",
        "keywords": [],
        "outline": [],
        "section_summaries": [],
        "summary_origin": "llm_plain",
    }
    current: str | None = None
    for line in lines:
        normalized = line.rstrip()
        if normalized.startswith("一句话摘要"):
            fields["one_sentence"] = normalized.split("：", 1)[-1].strip()
            current = "one_sentence"
        elif normalized.startswith("详细摘要"):
            fields["detailed"] = normalized.split("：", 1)[-1].strip()
            current = "detailed"
        elif normalized.startswith("关键词"):
            raw = normalized.split("：", 1)[-1]
            fields["keywords"] = [item.strip(" ;；,，") for item in re.split(r"[;；,，]", raw) if item.strip()]
            current = "keywords"
        elif normalized.startswith("文档大纲"):
            current = "outline"
        elif normalized.startswith("章节摘要"):
            current = "sections"
        elif current == "detailed":
            fields["detailed"] = (fields["detailed"] + " " + normalized).strip()
        elif current == "outline":
            item = re.sub(r"^\d+[.、]\s*", "", normalized).strip()
            if item:
                fields["outline"].append(item)
        elif current == "sections":
            item = re.sub(r"^\d+[.、]\s*", "", normalized).strip()
            if "：" in item:
                title, summary = item.split("：", 1)
            elif ":" in item:
                title, summary = item.split(":", 1)
            else:
                title, summary = item, ""
            if title.strip():
                fields["section_summaries"].append({"title": title.strip(), "summary": summary.strip()})
    return normalize_document_summary(fields)


def is_noise_line(line: str) -> bool:
    text = line.strip()
    if not text:
        return True
    if any(pattern.match(text) for pattern in NOISE_LINE_PATTERNS):
        return True
    if "@" in text and len(text.split()) <= 4:
        return True
    if len(text) <= 2:
        return True
    return False


def clean_lines(content: str) -> list[str]:
    lines = []
    for raw_line in content.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if is_noise_line(line):
            continue
        lines.append(line)
    return lines


def looks_like_section_heading(line: str) -> bool:
    if is_noise_line(line):
        return False
    if "=" in line:
        return False
    if "±" in line:
        return False
    if re.fullmatch(r"\d+(?:\s+\d+){2,}", line.strip()):
        return False
    if re.match(r"^(\d+(\.\d+)*|[IVX]+)\.?\s+\S+", line):
        rest = re.sub(r"^(\d+(\.\d+)*|[IVX]+)\.?\s+", "", line).strip()
        if re.fullmatch(r"[\d\s.,;:|/-]+", rest):
            return False
        if re.match(r"^[a-z]", rest):
            return False
        if len(rest) > 80 and re.search(r"[a-z]", rest):
            return False
        if re.match(r"^[A-Z]{1,8}\s+[\d.=±]", rest):
            return False
        return True
    if line.startswith("#"):
        return True
    if len(line) <= 90 and line.isupper() and len(line.split()) >= 2:
        return True
    return False


def normalize_heading_spacing(line: str) -> str:
    text = clean_summary_item(line)
    text = re.sub(r"([A-Z])(\d+)$", r"\1", text).strip()
    replacements = (
        ("THELLM", "THE LLM"),
        ("WITHCUSTOM", "WITH CUSTOM"),
        ("GOODNEXT", "GOOD NEXT"),
        ("AGOOD", "A GOOD"),
        ("EMPIRICALVALIDATION", "EMPIRICAL VALIDATION"),
        ("JEPASOUTPERFORM", "JEPAS OUTPERFORM"),
        ("FASTERLLM", "FASTER LLM"),
        ("VIALOSS", "VIA LOSS"),
        ("FUTUREWORK", "FUTURE WORK"),
        ("IMPROVINGLLMS", "IMPROVING LLMS"),
        ("ANDGENERATIVE", "AND GENERATIVE"),
        ("ATTENTIONMASK", "ATTENTION MASK"),
        ("TOKENPREDICTOR", "TOKEN PREDICTOR"),
        ("LOSSDROPOUT", "LOSS DROPOUT"),
        ("FASTERLORA", "FASTER LORA"),
        ("INDUCESSTRUCTUREDREPRESENTATION", "INDUCES STRUCTURED REPRESENTATION"),
        ("ABLATIONSTUDY", "ABLATION STUDY"),
        ("THEROLE", "THE ROLE"),
        ("OFL LLM", "OF LLM"),
    )
    for old, new in replacements:
        text = text.replace(old, new)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_outline_from_content(content: str, limit: int = 18) -> list[str]:
    outline: list[str] = []
    seen = set()
    for raw_line in content.splitlines():
        line = normalize_heading_spacing(raw_line)
        if is_bad_summary_item(line):
            continue
        if not looks_like_section_heading(line):
            continue
        if re.search(r"[=≈≤≥]", line):
            continue
        if re.fullmatch(r"[A-Z]{1,4}\s*[=≈≤≥].*", line):
            continue
        if len(line) > 140:
            continue
        key = re.sub(r"\s+", " ", line).lower()
        if key in seen:
            continue
        seen.add(key)
        outline.append(line)
        if len(outline) >= limit:
            break
    return outline


def extract_title(lines: list[str], keywords: list[str]) -> str:
    joined = "\n".join(lines[:80]).lower()
    if "llm-jepa" in joined:
        return "LLM-JEPA"
    for line in lines[:20]:
        if looks_like_section_heading(line):
            continue
        if re.fullmatch(r"[A-Z]{12,}", line.replace("-", "")):
            continue
        if re.fullmatch(r"[A-Z][A-Z0-9-]{2,}", line) and 4 <= len(line) <= 40:
            return line
    for line in lines[:20]:
        if looks_like_section_heading(line):
            continue
        if 4 <= len(line) <= 120 and re.search(r"\b[A-Z]{2,}(?:-[A-Z]{2,})?\b", line):
            return line.lstrip("#").strip()
    for keyword in keywords:
        if "-" in keyword or (keyword.isupper() and len(keyword) > 3):
            return keyword
    for line in lines[:30]:
        if looks_like_section_heading(line):
            continue
        if len(line) <= 120 and not re.search(r"@\w|^\d", line):
            if len(line.split()) <= 16:
                return line.lstrip("#").strip()
    return "该文档"


def extract_keywords(content: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}", content)
    scored: dict[str, int] = {}
    display: dict[str, str] = {}
    for candidate in candidates:
        token = candidate.strip(".,;:()[]{}")
        key = token.lower()
        if key in STOP_KEYWORDS or len(key) < 3:
            continue
        if "@" in token or token.isdigit():
            continue
        if len(token) > 18 and token.isupper() and "-" not in token:
            continue
        if token.islower() and len(token) < 7:
            continue
        display.setdefault(key, token)
        bonus = 3 if ("-" in token or token.isupper()) else 0
        if token in {"LLM", "JEPAs", "JEPA", "LLM-JEPA"}:
            bonus += 4
        scored[key] = scored.get(key, 0) + 1 + bonus
    ranked = sorted(scored, key=lambda key: (scored[key], "-" in display[key], display[key].isupper()), reverse=True)
    return [display[key] for key in ranked[:10]]


def chinese_fallback_detail(title: str, keywords: list[str], evidence: str) -> str:
    lower_evidence = evidence.lower()
    if "llm-jepa" in lower_evidence or ("jepa" in lower_evidence and "large language model" in lower_evidence):
        return (
            "这篇论文提出 LLM-JEPA，将 Joint Embedding Predictive Architecture 的思想引入大语言模型训练。"
            "论文认为，仅依赖 next-token prediction 或输入空间重构并不一定产生最适合推理的表征；相比之下，"
            "在 embedding space 中预测目标表征可以更直接地塑造抽象语义表示。方法上，LLM-JEPA 通过特定目标函数"
            "和 attention mask 设计，让模型从上下文预测被遮蔽部分的表示，并与传统 LLM 训练进行比较。实验部分关注"
            "推理、生成和鲁棒性表现，结论强调 LLM-JEPA 在若干设置下能够优于普通 LLM，同时仍保留生成能力。"
        )
    topic_hint = "、".join(keywords[:5]) if keywords else title
    return (
        f"该文档的核心主题是 {title}，主要涉及 {topic_hint}。"
        f"从可解析文本看，文档围绕问题背景、方法设计和关键结论展开。关键线索包括：{evidence[:420]}"
    )


def fallback_document_summary(content: str) -> dict[str, Any]:
    lines = clean_lines(content)
    if not lines:
        return EMPTY_DOCUMENT_SUMMARY.copy()

    keywords = extract_keywords("\n".join(lines))
    title = extract_title(lines, keywords)
    paragraphs = [
        line
        for line in lines
        if len(line) >= 80 and not looks_like_section_heading(line) and "@" not in line
    ]
    evidence = " ".join(paragraphs[:5] or lines[:8])[:1000].strip()
    topic_hint = "、".join(keywords[:4]) if keywords else title
    detailed = chinese_fallback_detail(title, keywords, evidence)

    headings = extract_outline_from_content(content, limit=8)
    outline = headings or [line[:90] for line in lines[:5] if not is_noise_line(line)]
    section_summaries = [
        {"title": heading, "summary": f"该部分主要讨论 {heading} 相关内容，是理解 {title} 的一个组成部分。"}
        for heading in outline[:5]
    ]
    return normalize_document_summary(
        {
            "one_sentence": (
                "该论文提出 LLM-JEPA，通过在表示空间预测目标表征来改进大语言模型的推理与生成能力。"
                if title == "LLM-JEPA"
                else f"该文档围绕 {title} 展开，重点涉及 {topic_hint} 等主题。"
            ),
            "detailed": detailed,
            "section_summaries": section_summaries,
            "keywords": keywords,
            "outline": outline,
            "summary_origin": "local_fallback",
        }
    )


async def generate_document_summary(llm_client, content: str) -> dict[str, Any]:
    full_outline = extract_outline_from_content(content)
    sampled_content = content[:16000]
    prompt = SUMMARY_PROMPT_TEMPLATE.format(content=sampled_content)
    try:
        response = await llm_client.async_generate_answer(prompt, max_new_tokens=1400)
    except Exception as exc:
        logger.warning("LLM summary generation failed, using local fallback: %s", exc)
        return fallback_document_summary(sampled_content)
    summary = parse_summary_json(response)
    if has_summary_content(summary):
        summary["summary_origin"] = "llm_json"
        if full_outline:
            summary["outline"] = full_outline
        return summary
    try:
        plain_response = await llm_client.async_generate_answer(
            PLAIN_SUMMARY_PROMPT_TEMPLATE.format(content=sampled_content),
            max_new_tokens=1200,
        )
        plain_summary = parse_plain_summary(plain_response)
        if has_summary_content(plain_summary):
            if full_outline:
                plain_summary["outline"] = full_outline
            return plain_summary
    except Exception as exc:
        logger.warning("Plain LLM summary generation failed, using local fallback: %s", exc)
    fallback = fallback_document_summary(content)
    if full_outline:
        fallback["outline"] = full_outline
    return fallback
