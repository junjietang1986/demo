import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag,
  Popconfirm, Row, Col, App, Descriptions, Divider, Timeline, Alert
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  HistoryOutlined, TagOutlined
} from '@ant-design/icons';
import { qualityApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface VersionRecord {
  id: number;
  project_id: number;
  version_no: string;
  version_type: 'revision' | 'major' | 'minor';
  change_summary: string;
  changer_name?: string;
  change_date: string;
  approval_status: 'draft' | 'pending' | 'approved' | 'rejected';
  approver_name?: string;
  approval_date?: string;
  approval_comment?: string;
  snapshot_data?: any;
  created_at: string;
}

const { TextArea } = Input;

const VersionTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailVersion, setDetailVersion] = useState<VersionRecord | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.versions.listByProject(projectId);
      setVersions(data || []);
    } catch (err: any) {
      message.error(err.message || '加载版本历史失败');
    } finally {
      setLoading(false);
    }
  };

  const generateVersionNo = (type: string) => {
    const existingVersions = versions.filter(v => v.version_type === type);
    const maxNum = existingVersions.reduce((max, v) => {
      const num = parseInt(v.version_no.replace(/[^0-9]/g, '')) || 0;
      return num > max ? num : max;
    }, 0);
    const prefix = type === 'major' ? 'V' : type === 'minor' ? 'v' : 'R';
    return `${prefix}${String(maxNum + 1).padStart(2, '0')}`;
  };

  const handleAdd = () => {
    form.resetFields();
    form.setFieldsValue({
      version_type: 'revision',
      approval_status: 'draft'
    });
    setModalVisible(true);
  };

  const handleViewDetail = (version: VersionRecord) => {
    setDetailVersion(version);
    setDetailVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      message.warning('版本记录不支持删除操作');
    } catch (err: any) {
      message.error(err.message || '操作失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const versionNo = generateVersionNo(values.version_type);
      const data = {
        ...values,
        project_id: projectId,
        version_no: versionNo,
        change_date: new Date().toISOString().split('T')[0]
      };

      await qualityApi.versions.create(data);
      message.success(`版本 ${versionNo} 创建成功`);
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '创建版本失败');
    }
  };

  const getVersionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      revision: 'blue', major: 'red', minor: 'green'
    };
    return colors[type] || 'default';
  };

  const getVersionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      revision: '修订', major: '大版本', minor: '小版本'
    };
    return labels[type] || type;
  };

  const getApprovalStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: '草稿', pending: '待审批', approved: '已批准', rejected: '已驳回'
    };
    return labels[status] || status;
  };

  const getApprovalStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'default', pending: 'warning', approved: 'success', rejected: 'error'
    };
    return colors[status] || 'default';
  };

  const columns = [
    {
      title: '版本号',
      dataIndex: 'version_no',
      key: 'version_no',
      width: 100,
      fixed: 'left' as const,
      render: (text: string, record: VersionRecord) => (
        <a onClick={() => handleViewDetail(record)}>
          <TagOutlined style={{ marginRight: 4 }} />
          {text}
        </a>
      )
    },
    {
      title: '版本类型',
      dataIndex: 'version_type',
      key: 'version_type',
      width: 100,
      render: (v: string) => <Tag color={getVersionTypeColor(v)}>{getVersionTypeLabel(v)}</Tag>
    },
    { title: '变更摘要', dataIndex: 'change_summary', key: 'change_summary', width: 300, ellipsis: true },
    { title: '变更人', dataIndex: 'changer_name', key: 'changer_name', width: 100 },
    { title: '变更日期', dataIndex: 'change_date', key: 'change_date', width: 110 },
    {
      title: '审批状态',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: 100,
      render: (v: string) => <Tag color={getApprovalStatusColor(v)}>{getApprovalStatusLabel(v)}</Tag>
    },
    { title: '审批人', dataIndex: 'approver_name', key: 'approver_name', width: 100, render: (v: string) => v || '-' },
    { title: '审批日期', dataIndex: 'approval_date', key: 'approval_date', width: 110, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: VersionRecord) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>快照</Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card
        size="small"
        title="版本历史"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>创建版本</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_versions"
          columns={columns}
          dataSource={versions}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Modal title="创建新版本" open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="创建" className="modal-md">
        <Form form={form} layout="vertical">
          <Alert
            message="版本号将根据版本类型自动生成"
            description="修订(Rxx)：日常修订；大版本(Vxx)：重大变更；小版本(vxx)：小改动"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="version_type" label="版本类型" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="revision">修订 (Rxx)</Select.Option>
                  <Select.Option value="major">大版本 (Vxx)</Select.Option>
                  <Select.Option value="minor">小版本 (vxx)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="approval_status" label="审批状态">
                <Select>
                  <Select.Option value="draft">草稿</Select.Option>
                  <Select.Option value="pending">提交审批</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="change_summary" label="变更摘要" rules={[{ required: true, message: '请输入变更摘要' }]}>
            <TextArea rows={4} placeholder="请描述本次版本的主要变更内容..." />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={detailVersion ? `版本快照 - ${detailVersion.version_no}` : '版本快照'} open={detailVisible} onCancel={() => setDetailVisible(false)} destroyOnHidden
         footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>
        ]} className="modal-lg">
        {detailVersion && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="版本号">
                <Tag color={getVersionTypeColor(detailVersion.version_type)} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {detailVersion.version_no}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="版本类型">
                <Tag color={getVersionTypeColor(detailVersion.version_type)}>
                  {getVersionTypeLabel(detailVersion.version_type)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="变更人">{detailVersion.changer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="变更日期">{detailVersion.change_date}</Descriptions.Item>
              <Descriptions.Item label="审批状态">
                <Tag color={getApprovalStatusColor(detailVersion.approval_status)}>
                  {getApprovalStatusLabel(detailVersion.approval_status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="审批人">{detailVersion.approver_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="审批日期" span={detailVersion.approval_comment ? 1 : 2}>
                {detailVersion.approval_date || '-'}
              </Descriptions.Item>
              {detailVersion.approval_comment && (
                <Descriptions.Item label="审批意见">{detailVersion.approval_comment}</Descriptions.Item>
              )}
              <Descriptions.Item label="变更摘要" span={2}>
                {detailVersion.change_summary}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">
              <HistoryOutlined /> 版本历史时间线
            </Divider>

            <Timeline
              items={versions.slice().reverse().map((v, idx, arr) => {
                const isCurrent = v.id === detailVersion.id;
                const isLatest = idx === 0;
                let color = 'blue';
                if (v.approval_status === 'approved') color = 'green';
                else if (v.approval_status === 'rejected') color = 'red';
                else if (v.approval_status === 'pending') color = 'orange';

                return {
                  color: isCurrent ? 'blue' : color,
                  children: (
                    <div style={{ paddingBottom: 12 }}>
                      <Space>
                        <Tag color={getVersionTypeColor(v.version_type)}>{v.version_no}</Tag>
                        <strong style={{ color: isCurrent ? '#1677ff' : undefined }}>
                          {v.change_summary?.slice(0, 30)}{v.change_summary?.length > 30 ? '...' : ''}
                        </strong>
                        {isCurrent && <Tag color="processing">当前查看</Tag>}
                        {isLatest && !isCurrent && <Tag color="success">最新版本</Tag>}
                      </Space>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                        {v.changer_name} · {v.change_date}
                      </div>
                    </div>
                  )
                };
              })}
            />

            {detailVersion.snapshot_data && (
              <>
                <Divider orientation="left">快照数据</Divider>
                <Card size="small" style={{ background: '#f5f5f5' }}>
                  <pre style={{ margin: 0, maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
                    {JSON.stringify(detailVersion.snapshot_data, null, 2)}
                  </pre>
                </Card>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VersionTab;
