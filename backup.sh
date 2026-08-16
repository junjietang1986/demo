#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

BACKUP_DIR="backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}[1/2] 备份数据库...${NC}"
if [ -f "server/data/qms.db" ]; then
    cp "server/data/qms.db" "$BACKUP_DIR/qms_${TIMESTAMP}.db"
    echo -e "${GREEN}  数据库已备份: $BACKUP_DIR/qms_${TIMESTAMP}.db${NC}"
else
    echo -e "${RED}  [警告] 未找到数据库文件${NC}"
fi

echo ""
echo -e "${BLUE}[2/2] 备份上传文件...${NC}"
if [ -d "server/uploads" ]; then
    cp -r "server/uploads" "$BACKUP_DIR/uploads_${TIMESTAMP}"
    echo -e "${GREEN}  上传文件已备份: $BACKUP_DIR/uploads_${TIMESTAMP}/${NC}"
else
    echo -e "${RED}  [提示] 无上传文件${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  备份完成！${NC}"
echo -e "${GREEN}  备份位置: $BACKUP_DIR/${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "恢复数据: 将备份文件复制回 server/data/ 和 server/uploads/ 即可"
