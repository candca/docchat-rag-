@echo off
D:\docchat\rag-chat-main\venv\Scripts\python.exe -m pip install --quiet py-spy
echo PYSPY_INSTALLED
D:\docchat\rag-chat-main\venv\Scripts\py-spy.exe dump --pid 14668
