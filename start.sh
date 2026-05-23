#!/bin/bash
set -e

if ! command -v poetry >/dev/null 2>&1; then
  echo "Poetry is not installed or not available in PATH. Install Poetry before starting the backend."
  exit 1
fi

# Start backend in background
cd backend || exit
PYTHONPATH=.:../chatbot poetry run python migration.py
PYTHONPATH=.:../chatbot poetry run uvicorn main:app &
BACKEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID" EXIT

# Wait for backend to be ready
echo "Waiting for backend to start..."
until curl -s http://localhost:8000/health > /dev/null 2>&1; do
  sleep 1
done

echo "Backend is ready. Starting frontend..."

# Start frontend
cd ../docchat-frontend || exit
npm run dev
