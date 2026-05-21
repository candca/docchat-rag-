@echo off
set PYTHONUNBUFFERED=1
echo START_TORCH
D:\docchat\rag-chat-main\venv\Scripts\python.exe -c "import time; t=time.time(); import torch; print('TORCH_OK', round(time.time()-t,1), 's', 'cuda=', torch.cuda.is_available())"
