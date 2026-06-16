@echo off
cd /d "%~dp0"

echo 正在启动弈棋无限教学工作台...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。请先安装 Node.js，然后再次双击本文件。
  echo 下载地址：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node server.mjs

echo.
echo 服务已停止。
pause
