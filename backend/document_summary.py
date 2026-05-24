import json
import re
from typing import Any


EMPTY_DOCUMENT_SUMMARY = {
    "one_sentence": "",
    "detailed": "",
    "section_summaries": [],
    "keywords": [],
    "outline": [],
}


SUMMARY_PROMPT_TEMPLATE = """请基于下面文档内容生成结构化中文摘要。

要求：
1. 只输出 JSON，不要 Markdown，不要代码块。
2. JSON 必须包含这些字段：
   - one_sentence: 一句话摘要，字符串
   - detailed: 详细摘要，字符串
   - section_summaries: 章节摘要，数组，每项包含 title 和 summary
   - keywords: 关键词数组，5-12 个
   - outline: 文档大纲数组，按层级顺序列出标题或主题
3. 如果文档是英文，也用中文概括，但保留关键英文术语。

文档内容：
----------------
{content}
----------------
"""


def normalize_document_summary(value: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(value, dict):
        return EMPTY_DOCUMENT_SUMMARY.copy()
    return {
        "one_sentence": str(value.get("one_sentence") or "").strip(),
        "detailed": str(value.get("detailed") or "").strip(),
        "section_summaries": [
            {
                "title": str(item.get("title") or "").strip(),
                "summary": str(item.get("summary") or "").strip(),
            }
            for item in value.get("section_summaries") or []
            if isinstance(item, dict)
        ],
        "keywords": [str(item).strip() for item in value.get("keywords") or [] if str(item).strip()],
        "outline": [str(item).strip() for item in value.get("outline") or [] if str(item).strip()],
    }


def parse_summary_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return normalize_document_summary(json.loads(cleaned))
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if not match:
            return EMPTY_DOCUMENT_SUMMARY.copy()
        try:
            return normalize_document_summary(json.loads(match.group(0)))
        except json.JSONDecodeError:
            return EMPTY_DOCUMENT_SUMMARY.copy()


async def generate_document_summary(llm_client, content: str) -> dict[str, Any]:
    sampled_content = content[:16000]
    prompt = SUMMARY_PROMPT_TEMPLATE.format(content=sampled_content)
    response = await llm_client.async_generate_answer(prompt, max_new_tokens=1400)
    return parse_summary_json(response)
