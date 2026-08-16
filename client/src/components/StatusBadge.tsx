import React from 'react';
import { Tag } from 'antd';

interface StatusBadgeProps {
  status: string;
  version?: number | string;
  showVersion?: boolean;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending: { label: '待审批', color: 'processing' },
  approved: { label: '已批准', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  planning: { label: '规划中', color: 'default' },
  in_progress: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  open: { label: '待处理', color: 'warning' },
  closed: { label: '已关闭', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
  current: { label: '当前版本', color: 'blue' },
  historical: { label: '历史版本', color: 'default' },
  'pending_approval': { label: '待审批', color: 'warning' }
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, version, showVersion }) => {
  const info = STATUS_MAP[status] || { label: status, color: 'default' };

  return (
    <span className="version-badge">
      {showVersion && version !== undefined && (
        <Tag color="blue">V{version}</Tag>
      )}
      <Tag color={info.color}>{info.label}</Tag>
    </span>
  );
};

export default StatusBadge;
