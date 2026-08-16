import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Tag,
  Space,
  Card,
  Row,
  Col,
  Steps,
  App,
  Tooltip
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { improvementApi, userApi } from '@/api';
import { Improvement, User, DEPARTMENTS, STATUS_MAP } from '@/types';
import { useAppStore } from '@/store';
import FeishuUserSelect from '@/components/FeishuUserSelect';
import DepartmentSelect from '@/components/DepartmentSelect';
import { ResizableTable } from '../components/ResizableTable';

const { TextArea } = Input;
const { Option } = Select;
const { Step } = Steps;

const SOURCE_MODULE_MAP: Record<string, { label: string; color: string }> = {
  opl: { label: 'OPL', color: 'blue' },
  anomaly: { label: '异常', color: 'orange' },
  manual: { label: '手动创建', color: 'purple' }
};

const DMAIC_STEPS = [
  { title: '定义' },
  { title: '测量' },
  { title: '分析' },
  { title: '改进' },
  { title: '控制' }
];

const ImprovementList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Improvement[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [modalVisible, setModalVisible] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState({
    status: undefined as string | undefined,
    source_module: undefined as string | undefined,
    responsible_dept: undefined as string | undefined,
    keyword: ''
  });

  const fetchData = async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        pageSize,
        status: filters.status,
        source_module: filters.source_module,
        responsible_dept: filters.responsible_dept,
        keyword: filters.keyword || undefined
      };
      const res = await improvementApi.list(params);
      setData(Array.isArray(res) ? res : (res.list || []));
      setTotal(res.total || 0);
      setPagination({ current: page, pageSize });
    } catch (error: any) {
      message.error(error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await userApi.list({ pageSize: 100 });
      setUsers(Array.isArray(res) ? res : (res.list || []));
    } catch (error) {
      console.error('加载用户列表失败', error);
    }
  };

  useEffect(() => {
    fetchData(1, 10);
    fetchUsers();
  }, []);

  const handleSearch = () => {
    fetchData(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({
      status: undefined,
      source_module: undefined,
      responsible_dept: undefined,
      keyword: ''
    });
    setTimeout(() => fetchData(1, pagination.pageSize), 0);
  };

  const handleAdd = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleView = (id: number) => {
    navigate(`/improvement/${id}`);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const submitData = {
        ...values,
        planned_completion_date: values.planned_completion_date?.format('YYYY-MM-DD'),
        source_module: values.source_module || 'manual'
      };

      await improvementApi.create(submitData);
      message.success('创建成功');
      setModalVisible(false);
      fetchData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '创建失败');
    }
  };

  const getCurrentStep = (record: Improvement) => {
    if (record.status === 'completed') return 5;
    return Math.max(0, (record.current_step || 1) - 1);
  };

  const columns = [
    {
      title: '改进编号',
      dataIndex: 'improvement_code',
      key: 'improvement_code',
      width: 140,
      render: (text: string) => text || '-'
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      width: 200,
      render: (text: string) => (
        <Tooltip title={text}>
          <a onClick={() => {}}>{text}</a>
        </Tooltip>
      )
    },
    {
      title: '来源',
      dataIndex: 'source_module',
      key: 'source_module',
      width: 110,
      render: (source: string) => {
        const sourceInfo = SOURCE_MODULE_MAP[source] || { label: source, color: 'default' };
        return <Tag color={sourceInfo.color}>{sourceInfo.label}</Tag>;
      }
    },
    {
      title: '责任部门',
      dataIndex: 'responsible_dept',
      key: 'responsible_dept',
      width: 110,
      render: (dept: string) => dept ? <Tag color="blue">{dept}</Tag> : '-'
    },
    {
      title: '责任人',
      dataIndex: 'responsible_person_name',
      key: 'responsible_person_name',
      width: 100,
      render: (text: string) => text || '-'
    },
    {
      title: '计划完成日期',
      dataIndex: 'planned_completion_date',
      key: 'planned_completion_date',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '当前阶段',
      key: 'current_step',
      width: 280,
      render: (_: any, record: Improvement) => (
        <Steps
          size="small"
          current={getCurrentStep(record)}
          status={record.status === 'completed' ? 'finish' : 'process'}
          style={{ width: '100%' }}
        >
          {DMAIC_STEPS.map((step, idx) => (
            <Step key={idx} title={step.title} />
          ))}
        </Steps>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusInfo = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.label}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: any, record: Improvement) => (
        <Space size="small">
          <Button type="link" size="small" icon={<FileTextOutlined />} onClick={() => handleView(record.id)}>
            查看
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>持续改进管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建改进项目
          </Button>
        </div>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="状态"
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.status}
              onChange={(v) => setFilters({ ...filters, status: v })}
            >
              <Option value="in_progress">进行中</Option>
              <Option value="completed">已完成</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="来源模块"
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.source_module}
              onChange={(v) => setFilters({ ...filters, source_module: v })}
            >
              <Option value="opl">OPL</Option>
              <Option value="anomaly">异常</Option>
              <Option value="manual">手动创建</Option>
            </Select>
          </Col>
          <Col span={4}>
            <DepartmentSelect
              style={{ width: '100%' }}
              placeholder="责任部门"
              allowClear
              value={filters.responsible_dept}
              onChange={(v) => setFilters({ ...filters, responsible_dept: v })}
            />
          </Col>
          <Col span={8}>
            <Input.Search
              placeholder="搜索关键词"
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onSearch={handleSearch}
            />
          </Col>
          <Col span={4}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Col>
        </Row>

        <ResizableTable
          tableKey="improvement_list"
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => fetchData(page, pageSize)
          }}
          scroll={{ x: 1500 }}
        />
      </Card>

      <Modal title="新建改进项目" open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
       className="modal-md">
        <Form form={form} layout="vertical" preserve={false} initialValues={{ source_module: 'manual', status: 'in_progress' }}>
          <Form.Item
            name="title"
            label="改进标题"
            rules={[{ required: true, message: '请输入改进标题' }]}
          >
            <Input placeholder="请输入改进项目标题" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="source_module" label="来源模块">
                <Select
                  showSearch
                  filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                >
                  <Option value="manual">手动创建</Option>
                  <Option value="opl">OPL单点课程</Option>
                  <Option value="anomaly">过程异常</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="responsible_dept" label="责任部门">
                <DepartmentSelect
                  placeholder="请选择责任部门"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="responsible_person_id"
                label="责任人"
                rules={[{ required: true, message: '请选择责任人' }]}
              >
                <FeishuUserSelect placeholder="请选择责任人" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="planned_completion_date" label="计划完成日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="problem_description"
            label="问题描述"
            rules={[{ required: true, message: '请输入问题描述' }]}
          >
            <TextArea rows={4} placeholder="请详细描述需要改进的问题" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ImprovementList;
