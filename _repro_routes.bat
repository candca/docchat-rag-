@echo off
cd /d D:\docchat\rag-chat-main\backend
set PYTHONPATH=D:\docchat\rag-chat-main\backend;D:\docchat\rag-chat-main\chatbot
set HF_HUB_OFFLINE=1
set TRANSFORMERS_OFFLINE=1
set ANONYMIZED_TELEMETRY=False
set HF_HUB_DISABLE_TELEMETRY=1
set PYTHONUNBUFFERED=1
echo START_ROUTES
D:\docchat\rag-chat-main\venv\Scripts\python.exe -c "import time; t=time.time(); from api.routes import api_router; print('ROUTES_OK', round(time.time()-t,1), 's')"
