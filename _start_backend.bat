@echo off
cd /d D:\docchat\rag-chat-main\backend
if not exist D:\docchat\rag-chat-main\logs mkdir D:\docchat\rag-chat-main\logs
set PYTHONPATH=D:\docchat\rag-chat-main\backend;D:\docchat\rag-chat-main\chatbot
set HF_HUB_OFFLINE=1
set TRANSFORMERS_OFFLINE=1
set HF_HUB_DISABLE_TELEMETRY=1
set ANONYMIZED_TELEMETRY=False
set PYTHONUNBUFFERED=1
D:\docchat\rag-chat-main\venv\Scripts\python.exe migration.py >> D:\docchat\rag-chat-main\logs\backend-live.log 2>&1
if errorlevel 1 (
    echo Migration failed, aborting backend startup. See logs\backend-live.log
    exit /b 1
)
D:\docchat\rag-chat-main\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 >> D:\docchat\rag-chat-main\logs\backend-live.log 2>&1
