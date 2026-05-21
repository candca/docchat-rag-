@echo off
cd /d D:\docchat\rag-chat-main\backend
set PYTHONPATH=D:\docchat\rag-chat-main\backend;D:\docchat\rag-chat-main\chatbot
D:\docchat\rag-chat-main\venv\Scripts\python.exe -c "from main import app; print('OK')"
