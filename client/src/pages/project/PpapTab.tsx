import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, Progress,
  DatePicker, message, Row, Col, Statistic, Tooltip, Popconfirm
} from 'antd';
import {
  PlusOutlined, EditOutlined, ReloadOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined, FileDoneOutlined,
  SendOutlined, StopOutlined
} from '@ant-design/icons';
import { qualityApi, userApi } from '@/api';
import dayjs from 'dayjs';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface PpapElement {
  id: number;
  element_no: number;
  element_name: string;
  is_required: boolean;
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';
  responsible_id?: number;
  responsible_name?: string;
  plan_submit_date?: string;
  actual_submit_date?: string;
  submission_level: number;
  customer_approval: 'pending' | 'approved' | 'rejected' | 'conditional';
  remark?: string;
}

const PPAP_STANDARD_ELEMENTS = [
  { no: 1, name: '设计记录', required: true },
  { no: 2, name: '工程变更文件', required: true },
  { no: 3, name: '顾客工程批准', required: false },
  { no: 4, name: '设计FMEA', required: true },
  { no: 5, name: '过程流程图', required: true },
  { no: 6, name: '过程FMEA', required: true },
  { no: 7, name: '控制计划', required: true },
  { no: 8, name: '测量系统分析(MSA)', required: true },
  { no: 9, name: '全尺寸测量结果', required: true },
  { no: 10, name: '材料/性能试验结果', required: true },
  { no: 11, name: '初始过程研究', required: true },
  { no: 12, name: '合格实验室文件', required: true },
  { no: 13, name: '外观批准报告(AAR)', required: false },
  { no: 14, name: '生产件样品', required: true },
  { no: 15, name: '标准样品', required: true },
  { no: 16, name: '检查辅具', required: true },
  { no: 17, name: '顾客特殊要求', required: false },
  { no: 18, name: '零件提交保证书(PSW)', required: true }
];

const PpapTab: React.FC<Props> = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [elements, setElements] = useState<PpapElement[]>([]);
  const [submissionLevel, setSubmissionLevel] = useState<number>(3);
  const [users, setUsers] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingElement, setEditingElement] = useState<PpapElement | null>(null);
  const [form] = Form.useForm();
  const [msgApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadData();
    loadUsers();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.ppap.listByProject(projectId);
      setElements(data || []);
    } catch (err: any) {
      msgApi.error(err.message || '加载PPAP数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await userApi.all();
      setUsers(data || []);
    } catch (err) {
      console.error('加载用户列表失败', err);
    }
  };

  const handleInit = async () => {
    try {
      await qualityApi.ppap.init(projectId);
      msgApi.success('PPAP初始化成功，已创建18项标准要素');
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '初始化失败');
    }
  };

  const handleEdit = (element: PpapElement) => {
    setEditingElement(element);
    form.setFieldsValue({
      ...element,
      plan_submit_date: element.plan_submit_date ? dayjs(element.plan_submit_date) : null,
      actual_submit_date: element.actual_submit_date ? dayjs(element.actual_submit_date) : null
    });
    setModalVisible(true);
  };

  const handleQuickUpdate = async (element: PpapElement, field: string, value: any) => {
    try {
      await qualityApi.ppap.updateElement(element.id, { [field]: value });
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '更新失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        plan_submit_date: values.plan_submit_date ? values.plan_submit_date.format('YYYY-MM-DD') : null,
        actual_submit_date: values.actual_submit_date ? values.actual_submit_date.format('YYYY-MM-DD') : null
      };

      if (editingElement) {
        await qualityApi.ppap.updateElement(editingElement.id, data);
        msgApi.success('更新成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '保存失败');
    }
  };

  const getStatusProgress = (status: string) => {
    const statusMap: Record<string, number> = {
      not_started: 0,
      in_progress: 50,
      submitted: 80,
      approved: 100,
      rejected: 30
    };
    return statusMap[status] ?? 0;
  };

  const getStatusTag = (status: string) => {
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      not_started: { color: 'default', text: '未开始', icon: <ClockCircleOutlined /> },
      in_progress: { color: 'blue', text: '进行中', icon: <ExclamationCircleOutlined /> },
      submitted: { color: 'cyan', text: '已提交', icon: <SendOutlined /> },
      approved: { color: 'green', text: '已批准', icon: <CheckCircleOutlined /> },
      rejected: { color: 'red', text: '已拒收', icon: <StopOutlined /> }
    };
    const cfg = configs[status] || configs.not_started;
    return <Tag color={cfg.color} icon={cfg.icon}>{cfg.text}</Tag>;
  };

  const getApprovalTag = (approval: string) => {
    const configs: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待批准' },
      approved: { color: 'green', text: '批准' },
      rejected: { color: 'red', text: '拒收' },
      conditional: { color: 'orange', text: '有条件批准' }
    };
    const cfg = configs[approval] || configs.pending;
    return <Tag color={cfg.color}>{cfg.text}</Tag>;
  };

  const getStatistics = () => {
    const total = elements.length;
    const approved = elements.filter(e => e.status === 'approved').length;
    const submitted = elements.filter(e => e.status === 'submitted').length;
    const inProgress = elements.filter(e => e.status === 'in_progress').length;
    const rejected = elements.filter(e => e.status === 'rejected').length;
    const progress = total > 0 ? Math.round(((approved + submitted * 0.8) / total) * 100) : 0;
    return { total, approved, submitted, inProgress, rejected, progress };
  };

  const stats = getStatistics();

  const columns = [
    {
      title: '要素编号',
      dataIndex: 'element_no',
      key: 'element_no',
      width: 80,
      fixed: 'left' as const
    },
    {
      title: '要素名称',
      dataIndex: 'element_name',
      key: 'element_name',
      width: 200,
      fixed: 'left' as const,
      render: (text: string, record: PpapElement) => (
        <Space>
          {record.is_required && <Tag color="red">必交</Tag>}
          <span>{text}</span>
        </Space>
      )
    },
    {
      title: '状态/进度',
      dataIndex: 'status',
      key: 'status',
      width: 200,
      render: (status: string, record: PpapElement) => (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {getStatusTag(status)}
          <Progress percent={getStatusProgress(status)} size="small"
            status={status === 'rejected' ? 'exception' : status === 'approved' ? 'success' : 'active'} />
        </Space>
      )
    },
    {
      title: '负责人',
      dataIndex: 'responsible_name',
      key: 'responsible_id',
      width: 130,
      render: (text: string, record: PpapElement) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={record.responsible_id}
          placeholder="选择负责人"
          allowClear
          onChange={(val) => handleQuickUpdate(record, 'responsible_id', val)}
        >
          {users.map((u: any) => (
            <Select.Option key={u.id} value={u.id}>{u.real_name || u.username}</Select.Option>
          ))}
        </Select>
      )
    },
    {
      title: '计划提交',
      dataIndex: 'plan_submit_date',
      key: 'plan_submit_date',
      width: 150,
      render: (text: string, record: PpapElement) => (
        <DatePicker
          size="small"
          style={{ width: '100%' }}
          value={text ? dayjs(text) : null}
          onChange={(date) => handleQuickUpdate(record, 'plan_submit_date', date ? date.format('YYYY-MM-DD') : null)}
        />
      )
    },
    {
      title: '实际提交',
      dataIndex: 'actual_submit_date',
      key: 'actual_submit_date',
      width: 150,
      render: (text: string, record: PpapElement) => (
        <DatePicker
          size="small"
          style={{ width: '100%' }}
          value={text ? dayjs(text) : null}
          onChange={(date) => handleQuickUpdate(record, 'actual_submit_date', date ? date.format('YYYY-MM-DD') : null)}
        />
      )
    },
    {
      title: '提交等级',
      dataIndex: 'submission_level',
      key: 'submission_level',
      width: 100,
      align: 'center' as const,
      render: (level: number) => <Tag color="purple">等级 {level}</Tag>
    },
    {
      title: '客户批准',
      dataIndex: 'customer_approval',
      key: 'customer_approval',
      width: 120,
      render: (approval: string) => getApprovalTag(approval)
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: any, record: PpapElement) => (
        <Space size="small">
          <Tooltip title="编辑详情">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
        </Space>
      )
    }
  ];

  return (
    <div>
      {contextHolder}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="PPAP要素总数" value={stats.total || 18} suffix="项" prefix={<FileDoneOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="已批准" value={stats.approved} suffix="项" valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="已提交" value={stats.submitted} suffix="项" valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="进行中" value={stats.inProgress} suffix="项" valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="拒收" value={stats.rejected} suffix="项" valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="整体进度" value={stats.progress} suffix="%" valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="PPAP生产件批准程序"
        extra={
          <Space wrap>
            <span>提交等级：</span>
            <Select
              value={submissionLevel}
              onChange={setSubmissionLevel}
              style={{ width: 100 }}
              options={[
                { value: 1, label: '等级1' },
                { value: 2, label: '等级2' },
                { value: 3, label: '等级3' },
                { value: 4, label: '等级4' },
                { value: 5, label: '等级5' }
              ]}
            />
            <Popconfirm
              title="确定要初始化PPAP吗？将创建18项标准要素。"
              onConfirm={handleInit}
              okText="确定"
              cancelText="取消"
            >
              <Button icon={<ReloadOutlined />} type="primary" ghost>初始化PPAP</Button>
            </Popconfirm>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_ppap"
          columns={columns}
          dataSource={elements.length > 0 ? elements : PPAP_STANDARD_ELEMENTS.map((e, idx) => ({
            id: -idx - 1,
            element_no: e.no,
            element_name: e.name,
            is_required: e.required,
            status: 'not_started' as const,
            submission_level: submissionLevel,
            customer_approval: 'pending' as const
          }))}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600, y: 'calc(100vh - 430px)' }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingElement ? `编辑要素 - ${editingElement.element_name}` : '编辑要素'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-md">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Select.Option value="not_started">未开始</Select.Option>
                  <Select.Option value="in_progress">进行中</Select.Option>
                  <Select.Option value="submitted">已提交</Select.Option>
                  <Select.Option value="approved">已批准</Select.Option>
                  <Select.Option value="rejected">已拒收</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="responsible_id" label="负责人">
                <Select placeholder="选择负责人" allowClear>
                  {users.map((u: any) => (
                    <Select.Option key={u.id} value={u.id}>{u.real_name || u.username}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="plan_submit_date" label="计划提交日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="actual_submit_date" label="实际提交日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="submission_level" label="提交等级">
                <Select>
                  <Select.Option value={1}>等级1 - 仅提交PSW</Select.Option>
                  <Select.Option value={2}>等级2 - PSW+样品+有限数据</Select.Option>
                  <Select.Option value={3}>等级3 - PSW+样品+完整数据</Select.Option>
                  <Select.Option value={4}>等级4 - PSW+其他要求</Select.Option>
                  <Select.Option value={5}>等级5 - PSW+全部资料+现场评审</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_approval" label="客户批准状态">
                <Select>
                  <Select.Option value="pending">待批准</Select.Option>
                  <Select.Option value="approved">批准</Select.Option>
                  <Select.Option value="rejected">拒收</Select.Option>
                  <Select.Option value="conditional">有条件批准</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="备注说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PpapTab;
