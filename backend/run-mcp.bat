@echo off
set OPENSSL_DIR=C:\Program Files\OpenSSL-Win64-ARM
set OPENSSL_LIB_DIR=C:\Program Files\OpenSSL-Win64-ARM\lib\VC\arm64\MD
set OPENSSL_INCLUDE_DIR=C:\Program Files\OpenSSL-Win64-ARM\include
set MINIMAX_API_KEY=%1
set MINIMAX_API_HOST=%2
uvx minimax-coding-plan-mcp -y
