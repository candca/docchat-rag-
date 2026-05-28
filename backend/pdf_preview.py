from __future__ import annotations

import io
import re
from pathlib import Path


def _compact_with_map(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    index_map: list[int] = []
    for idx, char in enumerate(text):
        if char.isspace():
            continue
        chars.append(char.lower())
        index_map.append(idx)
    return "".join(chars), index_map


def _snippet_search_text(snippet: str | None) -> str:
    if not snippet:
        return ""
    text = re.sub(r"^#+\s*Page\s+\d+\s*", "", snippet.strip(), flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:900]


def _find_range(page_text: str, snippet: str | None) -> tuple[int, int] | None:
    target = _snippet_search_text(snippet)
    if not target:
        return None

    exact_idx = page_text.find(target)
    if exact_idx != -1:
        return exact_idx, exact_idx + len(target)

    lower_idx = page_text.lower().find(target.lower())
    if lower_idx != -1:
        return lower_idx, lower_idx + len(target)

    source_compact, source_map = _compact_with_map(page_text)
    target_compact, _ = _compact_with_map(target)
    if not target_compact:
        return None

    # Long snippets often differ slightly across PDF parsers. Try the whole
    # snippet first, then progressively smaller leading windows.
    lengths = [len(target_compact), 360, 260, 180, 120, 80, 48]
    for length in lengths:
        needle = target_compact[: min(length, len(target_compact))]
        if len(needle) < 24:
            continue
        compact_idx = source_compact.find(needle)
        if compact_idx == -1:
            continue
        start = source_map[compact_idx]
        end = source_map[min(compact_idx + len(needle) - 1, len(source_map) - 1)] + 1
        return start, end

    return None


def _merge_line_boxes(boxes: list[list[float]], page_height: float) -> list[list[float]]:
    if not boxes:
        return []

    # pypdfium2 char boxes are [left, bottom, right, top] in PDF coordinates.
    # Group boxes with close vertical centers into readable line highlights.
    sorted_boxes = sorted(boxes, key=lambda box: (-(box[1] + box[3]) / 2, box[0]))
    lines: list[list[list[float]]] = []
    tolerance = max(page_height * 0.006, 4)
    for box in sorted_boxes:
        center_y = (box[1] + box[3]) / 2
        for line in lines:
            line_center = sum((item[1] + item[3]) / 2 for item in line) / len(line)
            if abs(center_y - line_center) <= tolerance:
                line.append(box)
                break
        else:
            lines.append([box])

    merged: list[list[float]] = []
    for line in lines:
        x0 = min(box[0] for box in line)
        y0 = min(box[1] for box in line)
        x1 = max(box[2] for box in line)
        y1 = max(box[3] for box in line)
        pad_x = 1.5
        pad_y = 1.5
        merged.append([max(0, x0 - pad_x), max(0, y0 - pad_y), x1 + pad_x, y1 + pad_y])
    return merged


def get_pdf_page_preview(file_path: Path, page_number: int | None = None, snippet: str | None = None) -> dict:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(file_path))
    try:
        page_count = len(pdf)
        if page_number is not None and (page_number < 1 or page_number > page_count):
            raise ValueError(f"Page {page_number} is outside the PDF page range 1-{page_count}.")

        candidate_pages = [page_number - 1] if page_number is not None else list(range(page_count))
        best_preview: dict | None = None

        for page_index in candidate_pages:
            page = pdf[page_index]
            try:
                width, height = page.get_size()
                textpage = page.get_textpage()
                page_text = textpage.get_text_range()
                match_range = _find_range(page_text, snippet)
                boxes: list[list[float]] = []
                if match_range:
                    start, end = match_range
                    for char_index in range(start, end):
                        try:
                            char_box = textpage.get_charbox(char_index)
                        except Exception:
                            continue
                        if char_box and char_box[2] > char_box[0] and char_box[3] > char_box[1]:
                            boxes.append([float(value) for value in char_box])

                preview = {
                    "page": page_index + 1,
                    "page_count": page_count,
                    "width": float(width),
                    "height": float(height),
                    "boxes": _merge_line_boxes(boxes, float(height)),
                }
                if preview["boxes"]:
                    return preview
                if best_preview is None:
                    best_preview = preview
            finally:
                page.close()

        if best_preview is not None:
            return best_preview

        # Empty PDFs should be rare, but keep the error explicit.
        raise ValueError("PDF has no renderable pages.")
    finally:
        pdf.close()


def render_pdf_page_png(file_path: Path, page_number: int, scale: float = 2.0) -> bytes:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(file_path))
    try:
        page_count = len(pdf)
        if page_number < 1 or page_number > page_count:
            raise ValueError(f"Page {page_number} is outside the PDF page range 1-{page_count}.")

        page = pdf[page_number - 1]
        try:
            bitmap = page.render(scale=scale)
            image = bitmap.to_pil()
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            return buffer.getvalue()
        finally:
            page.close()
    finally:
        pdf.close()
