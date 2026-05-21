@echo off
set HF_HUB_DISABLE_TELEMETRY=1
set ANONYMIZED_TELEMETRY=False
D:\docchat\rag-chat-main\venv\Scripts\python.exe -c "from sentence_transformers import SentenceTransformer; m = SentenceTransformer('all-MiniLM-L6-v2'); print('MODEL_OK', m.get_sentence_embedding_dimension())"
