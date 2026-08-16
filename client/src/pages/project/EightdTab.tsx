import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag,
  Popconfirm, Row, Col, App, Descriptions, Steps, Tabs, Divider
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  TeamOutlined, FileTextOutlined, WarningOutlined, SearchOutlined,
  CheckCircleOutlined, PlayCircleOutlined, SafetyOutlined, TrophyOutlined
} from '@ant-design/icons';
import { qualityApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface EightDRecord {
  id: number;
  project_id: number;
  report_code: string;
  problem_title: string;
  problem_description: string;
  finder_name?: string;
  problem_date: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  current_step: number;
  status: 'draft' | 'in_progress' | 'completed' | 'closed';
  closed_date?: string;
  d1_team?: string;
  d2_description?: string;
  d3_interim_action?: string;
  d4_root_cause?: string;
  d5_permanent_action?: string;
  d6_implementation?: string;
  d7_prevention?: string;
  d8_congratulation?: string;
  created_at: string;
}

const { TextArea } = Input;

const STEPS = [
  { key: 1, title: 'D1 组建团队', icon: <TeamOutlined />, field: 'd1_team', label: '团队成员' },
  { key: 2, title: 'D2 问题描述', icon: <FileTextOutlined />, field: 'd2_description', label: '问题详细描述' },
  { key: 3, title: 'D3 临时遏制', icon: <WarningOutlined />, field: 'd3_interim_action', label: '临时遏制措施' },
  { key: 4, title: 'D4 根本原因', icon: <SearchOutlined />, field: 'd4_root_cause', label: '根本原因分析' },
  { key: 5, title: 'D5 永久措施', icon: <CheckCircleOutlined />, field: 'd5_permanent_action', label: '永久纠正措施' },
  { key: 6, title: 'D6 实施措施', icon: <PlayCircleOutlined />, field: 'd6_implementation', label: '纠正措施实施' },
  { key: 7, title: 'D7 预防再发', icon: <SafetyOutlined />, field: 'd7_prevention', label: '预防再发生措施' },
  { key: 8, title: 'D8 团队祝贺', icon: <TrophyOutlined />, field: 'd8_congratulation', label: '祝贺与关闭' }
];

const EightdTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<EightDRecord[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EightDRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<EightDRecord | null>(null);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('1');

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.eightd.listByProject(projectId);
      setRecords(data || []);
    } catch (err: any) {
      message.error(err.message || '加载8D报告数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({
      severity: 'medium',
      current_step: 1,
      status: 'draft'
    });
    setActiveTab('1');
    setModalVisible(true);
  };

  const handleEdit = (record: EightDRecord) => {
    setEditingRecord(record);
    form.setFieldsValue(record);
    setActiveTab(String(record.current_step || 1));
    setModalVisible(true);
  };

  const handleView = (record: EightDRecord) => {
    setDetailRecord(record);
    setDetailVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.eightd.delete(id);
      message.success('删除成功');
      loadData();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const data = { ...values, project_id: projectId };

      if (editingRecord) {
        await qualityApi.eightd.update(editingRecord.id, data);
        message.success('更新成功');
      } else {
        await qualityApi.eightd.create(data);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'green', medium: 'blue', high: 'orange', critical: 'red'
    };
    return colors[severity] || 'default';
  };

  const getSeverityLabel = (severity: string) => {
    const labels: Record<string, string> = {
      low: '低', medium: '中', high: '高', critical: '严重'
    };
    return labels[severity] || severity;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: '草稿', in_progress: '进行中', completed: '已完成', closed: '已关闭'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'default', in_progress: 'processing', completed: 'success', closed: 'blue'
    };
    return colors[status] || 'default';
  };

  const columns = [
    {
      title: '8D编号',
      dataIndex: 'report_code',
      key: 'report_code',
      width: 130,
      fixed: 'left' as const,
      render: (text: string, record: EightDRecord) => (
        <a onClick={() => handleView(record)}>{text}</a>
      )
    },
    { title: '问题标题', dataIndex: 'problem_title', key: 'problem_title', width: 200, ellipsis: true },
    {
      title: '问题描述',
      dataIndex: 'problem_description',
      key: 'problem_description',
      width: 200,
      ellipsis: true,
      render: (text: string) => text?.length > 50 ? text.slice(0, 50) + '...' : text
    },
    { title: '发现人', dataIndex: 'finder_name', key: 'finder_name', width: 100 },
    { title: '问题日期', dataIndex: 'problem_date', key: 'problem_date', width: 110 },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      align: 'center' as const,
      render: (v: string) => <Tag color={getSeverityColor(v)}>{getSeverityLabel(v)}</Tag>
    },
    {
      title: '当前阶段',
      dataIndex: 'current_step',
      key: 'current_step',
      width: 100,
      align: 'center' as const,
      render: (v: number) => <Tag color="purple">D{v}</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => <Tag color={getStatusColor(v)}>{getStatusLabel(v)}</Tag>
    },
    { title: '关闭日期', dataIndex: 'closed_date', key: 'closed_date', width: 110, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: EightDRecord) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>详情</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此8D报告？" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  const renderStepContent = (step: typeof STEPS[0], isEditable: boolean = true) => {
    const value = detailRecord ? (detailRecord as any)[step.field] : null;
    if (!isEditable) {
      return (
        <div style={{ padding: '12px 0' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={step.label}>{value || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      );
    }
    return (
      <Form.Item name={step.field} label={step.label}>
        <TextArea rows={4} placeholder={`请输入${step.label}内容`} />
      </Form.Item>
    );
  };

  return (
    <div>
      <Card
        size="small"
        title="8D/CAPA纠正预防措施"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建8D报告</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_8d"
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Modal title={editingRecord ? '编辑8D报告' : '新建8D报告'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="report_code" label="8D编号" rules={[{ required: true, message: '请输入8D编号' }]}>
                <Input placeholder="如 8D-2024-001" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="problem_title" label="问题标题" rules={[{ required: true, message: '请输入问题标题' }]}>
                <Input placeholder="请简要描述问题标题" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="finder_name" label="发现人">
                <Input placeholder="发现人姓名" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="problem_date" label="问题日期" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="severity" label="严重度" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="low">低</Select.Option>
                  <Select.Option value="medium">中</Select.Option>
                  <Select.Option value="high">高</Select.Option>
                  <Select.Option value="critical">严重</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="current_step" label="当前阶段">
                <Select>
                  {STEPS.map(s => (
                    <Select.Option key={s.key} value={s.key}>D{s.key} {s.title.split(' ')[1]}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="problem_description" label="问题描述" rules={[{ required: true, message: '请描述问题' }]}>
            <TextArea rows={3} placeholder="请详细描述发生了什么问题" />
          </Form.Item>

          <Divider orientation="left">8D步骤详情</Divider>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={STEPS.map(step => ({
              key: String(step.key),
              label: <span>{step.icon} {step.title}</span>,
              children: renderStepContent(step)
            }))}
          />

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Select.Option value="draft">草稿</Select.Option>
                  <Select.Option value="in_progress">进行中</Select.Option>
                  <Select.Option value="completed">已完成</Select.Option>
                  <Select.Option value="closed">已关闭</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="closed_date" label="关闭日期">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal title={detailRecord ? `${detailRecord.report_code} - 8D报告详情` : '8D报告详情'} open={detailVisible} onCancel={() => setDetailVisible(false)} destroyOnHidden
         footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>,
          detailRecord && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { setDetailVisible(false); handleEdit(detailRecord); }}>编辑</Button>
        ]} className="modal-xl">
        {detailRecord && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="8D编号">{detailRecord.report_code}</Descriptions.Item>
              <Descriptions.Item label="问题标题">{detailRecord.problem_title}</Descriptions.Item>
              <Descriptions.Item label="发现人">{detailRecord.finder_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="问题日期">{detailRecord.problem_date}</Descriptions.Item>
              <Descriptions.Item label="严重度">
                <Tag color={getSeverityColor(detailRecord.severity)}>{getSeverityLabel(detailRecord.severity)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={getStatusColor(detailRecord.status)}>{getStatusLabel(detailRecord.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="关闭日期">{detailRecord.closed_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="问题描述" span={2}>{detailRecord.problem_description}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">8D步骤进度</Divider>

            <Steps
              current={detailRecord.current_step - 1}
              size="small"
              style={{ marginBottom: 24 }}
              items={STEPS.map(step => ({ key: step.key, title: step.title, icon: step.icon }))}
            />

            <Divider orientation="left">各步骤详情</Divider>

            {STEPS.map((step, idx) => (
              <div key={step.key} style={{ marginBottom: 16 }}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <span style={{
                        color: idx < detailRecord.current_step - 1 ? '#52c41a' : idx === detailRecord.current_step - 1 ? '#1677ff' : '#999'
                      }}>
                        {step.icon} {step.title}
                      </span>
                      {idx < detailRecord.current_step - 1 && <Tag color="success">已完成</Tag>}
                      {idx === detailRecord.current_step - 1 && <Tag color="processing">进行中</Tag>}
                      {idx > detailRecord.current_step - 1 && <Tag>待开始</Tag>}
                    </Space>
                  }
                >
                  {renderStepContent(step, false)}
                </Card>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EightdTab;
