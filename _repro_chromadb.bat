@echo off
set HF_HUB_OFFLINE=1
set TRANSFORMERS_OFFLINE=1
set ANONYMIZED_TELEMETRY=False
set HF_HUB_DISABLE_TELEMETRY=1
set PYTHONUNBUFFERED=1
echo START_CHROMADB
D:\docchat\rag-chat-main\venv\Scripts\python.exe -c "import time; t=time.time(); import chromadb; print('CHROMADB_OK', round(time.time()-t,1), 's')"
