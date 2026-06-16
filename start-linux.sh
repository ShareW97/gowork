#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1

echo "正在启动弈棋无限教学工作台..."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js。请先安装 Node.js，然后再次运行本文件。"
  echo "下载地址：https://nodejs.org/"
  exit 1
fi

node server.mjs
