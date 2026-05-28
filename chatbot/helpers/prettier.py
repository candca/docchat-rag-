import os


def prettify_source(source):
    document = os.path.basename(source.get("document"))
    score = source.get("score")
    content_preview = source.get("content_preview")
    document_id = source.get("document_id")
    page = source.get("page")
    metadata = f" **Score ({round(score,2)})** \n\n"
    if document_id:
        metadata += f" **Document ID:** {document_id} \n\n"
    if page:
        metadata += f" **Page:** {page} \n\n"
    return f"• **{document}** \n\n{metadata} **Preview:** \n >{content_preview} \n"
