import React, { useEffect, useState } from 'react';
import { Drawer, Timeline, Tag, Empty, Descriptions, Space, Typography } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { impexpApi } from '@/api';
import StatusBadge from './StatusBadge';

const { Text } = Typography;

interface VersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  module: string;
  recordId: number;
  recordName?: string;
}

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  manual: { label: '手动编辑', color: 'blue' },
  import: { label: '导入创建', color: 'purple' },
  system: { label: '系统生成', color: 'default' }
};

const VersionHistoryDrawer: React.FC<VersionHistoryDrawerProps> = ({ open, onClose, module, recordId, recordName }) => {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && recordId) {
      setLoading(true);
      impexpApi.getVersions(module, recordId)
        .then(data => setVersions(data || []))
        .catch(() => setVersions([]))
        .finally(() => setLoading(false));
    }
  }, [open, module, recordId]);

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined />
          <span>版本历史 - {recordName || ''}</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      {versions.length === 0 && !loading ? (
        <Empty description="暂无版本记录" />
      ) : (
        <Timeline
          items={versions.map(v => {
            const dot = v.status === 'approved'
              ? <CheckCircleOutlined style={{ fontSize: 16, color: '#52c41a' }} />
              : v.status === 'rejected'
              ? <CloseCircleOutlined style={{ fontSize: 16, color: '#ff4d4f' }} />
              : v.is_current
              ? <ClockCircleOutlined style={{ fontSize: 16, color: '#1677ff' }} />
              : undefined;

            return {
              dot,
              color: v.status === 'approved' ? 'green' : v.status === 'rejected' ? 'red' : 'blue',
              children: (
                <div style={{ paddingBottom: 16 }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>V{v.version_no} {v.version_label || ''}</Text>
                      <StatusBadge status={v.is_current ? 'current' : v.status} />
                      <Tag color={SOURCE_MAP[v.source_type]?.color || 'default'}>
                        {SOURCE_MAP[v.source_type]?.label || v.source_type}
                      </Tag>
                      {v.is_current === 1 && <Tag color="blue">当前</Tag>}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {v.creator_name || '系统'} · {v.created_at}
                    </Text>
                    {v.change_summary && (
                      <Text style={{ fontSize: 12 }}>变更说明：{v.change_summary}</Text>
                    )}
                    {v.approved_at && (
                      <Text type="success" style={{ fontSize: 12 }}>批准时间：{v.approved_at}</Text>
                    )}
                  </Space>
                </div>
              )
            };
          })}
        />
      )}
    </Drawer>
  );
};

export default VersionHistoryDrawer;
