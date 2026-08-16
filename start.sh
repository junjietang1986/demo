#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  TRAC QMS - 一键启动脚本 (Linux/Mac)${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

if ! command -v docker &> /dev/null; then
    echo -e "${RED}[错误] 未检测到Docker，请先安装Docker${NC}"
    echo "安装指南: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}[错误] Docker服务未启动，请先启动Docker${NC}"
    exit 1
fi

echo -e "${GREEN}[1/3] Docker环境检查通过${NC}"

MODE="prod"
if [ "$1" = "dev" ]; then
    MODE="dev"
    echo -e "${BLUE}[2/3] [开发模式] 构建并启动热重载开发环境...${NC}"
    docker compose -f docker-compose.dev.yml up -d --build
    echo ""
    echo -e "${GREEN}  前端地址: http://localhost:5173${NC}"
    echo -e "${GREEN}  后端API:  http://localhost:3001${NC}"
else
    echo -e "${BLUE}[2/3] [生产模式] 构建并启动生产环境...${NC}"
    docker compose up -d --build
    echo ""
    echo -e "${GREEN}  访问地址: http://localhost:3001${NC}"
fi

echo ""
echo -e "${BLUE}[3/3] 等待服务就绪...${NC}"
sleep 10

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  启动完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "查看日志: docker compose logs -f"
echo "停止服务: docker compose down"
echo "查看状态: docker compose ps"
echo ""

if command -v xdg-open &> /dev/null; then
    if [ "$MODE" = "dev" ]; then
        xdg-open http://localhost:5173
    else
        xdg-open http://localhost:3001
    fi
elif command -v open &> /dev/null; then
    if [ "$MODE" = "dev" ]; then
        open http://localhost:5173
    else
        open http://localhost:3001
    fi
fi
