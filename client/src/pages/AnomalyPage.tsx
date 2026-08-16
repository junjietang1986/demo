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
  Popconfirm,
  App,
  Upload,
  Tooltip,
  Radio
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  RocketOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { qmsApi, projectApi, userApi, improvementApi } from '@/api';
import { AnomalyRecord, Project, Workstation, User, DEPARTMENTS, STATUS_MAP } from '@/types';
import { useAppStore } from '@/store';
import ImportExportToolbar from '@/components/ImportExportToolbar';
import FeishuUserSelect from '@/components/FeishuUserSelect';
import DepartmentSelect from '@/components/DepartmentSelect';
import { ResizableTable } from '../components/ResizableTable';

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Option } = Select;

const ANOMALY_TYPE_MAP: Record<string, { label: string; color: string }> = {
  process: { label: '过程异常', color: 'red' },
  inspection: { label: '巡检问题', color: 'orange' }
};

const AnomalyPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnomalyRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AnomalyRecord | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState({
    anomaly_type: 'process' as string | undefined,
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
    responsible_dept: undefined as string | undefined,
    status: undefined as string | undefined,
    keyword: ''
  });
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined);

  const fetchData = async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        pageSize,
        anomaly_type: filters.anomaly_type,
        responsible_dept: filters.responsible_dept,
        status: filters.status,
        keyword: filters.keyword || undefined
      };
      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        params.start_date = filters.dateRange[0].format('YYYY-MM-DD');
        params.end_date = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const res = await qmsApi.anomalyList(params);
      setData(Array.isArray(res) ? res : (res.list || []));
      setTotal(res.total || 0);
      setPagination({ current: page, pageSize });
    } catch (error: any) {
      message.error(error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await projectApi.list({ pageSize: 100 });
      setProjects(Array.isArray(res) ? res : (res.list || []));
    } catch (error) {
      console.error('加载项目列表失败', error);
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
    fetchProjects();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      const project = projects.find(p => p.id === selectedProject);
      setWorkstations(project?.workstations || []);
    } else {
      setWorkstations([]);
    }
  }, [selectedProject, projects]);

  const handleSearch = () => {
    fetchData(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({
      anomaly_type: 'process',
      dateRange: null,
      responsible_dept: undefined,
      status: undefined,
      keyword: ''
    });
    setTimeout(() => fetchData(1, pagination.pageSize), 0);
  };

  const handleAdd = () => {
    setEditingRecord(null);
    form.resetFields();
    setSelectedProject(undefined);
    setModalVisible(true);
  };

  const handleEdit = (record: AnomalyRecord) => {
    setEditingRecord(record);
    setSelectedProject(record.project_id);
    form.setFieldsValue({
      ...record,
      occurrence_date: record.occurrence_date ? dayjs(record.occurrence_date) : null,
      planned_completion_date: record.planned_completion_date ? dayjs(record.planned_completion_date) : null,
      actual_completion_date: record.actual_completion_date ? dayjs(record.actual_completion_date) : null
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qmsApi.anomalyDelete(id);
      message.success('删除成功');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleInitiateImprovement = async (id: number) => {
    try {
      const res = await improvementApi.fromAnomaly(id);
      const improvementId = res.id;
      message.success('改进项目已发起');
      if (improvementId) {
        navigate(`/improvement/${improvementId}`);
      }
    } catch (error: any) {
      message.error(error.message || '发起改进失败');
    }
  };

  const handleProjectChange = (projectId: number) => {
    setSelectedProject(projectId);
    const project = projects.find(p => p.id === projectId);
    if (project) {
      form.setFieldsValue({
        project_code: project.project_code,
        project_name: project.project_name,
        project_manager_id: project.project_manager_id
      });
    }
    form.setFieldsValue({ workstation_id: undefined });
  };

  const handleWorkstationChange = (workstationId: number) => {
    const workstation = workstations.find(w => w.id === workstationId);
    if (workstation) {
      form.setFieldsValue({
        station_code: workstation.station_code,
        station_name: workstation.station_name
      });
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const submitData = {
        ...values,
        occurrence_date: values.occurrence_date?.format('YYYY-MM-DD'),
        planned_completion_date: values.planned_completion_date?.format('YYYY-MM-DD'),
        actual_completion_date: values.actual_completion_date?.format('YYYY-MM-DD')
      };

      if (editingRecord) {
        await qmsApi.anomalyUpdate(editingRecord.id, submitData);
        message.success('更新成功');
      } else {
        await qmsApi.anomalyCreate(submitData);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '保存失败');
    }
  };

  const truncateText = (text: string, maxLength = 30) => {
    if (!text) return '-';
    return text.length > maxLength ? (
      <Tooltip title={text}>
        <span>{text.substring(0, maxLength)}...</span>
      </Tooltip>
    ) : text;
  };

  const columns = [
    {
      title: '发生日期',
      dataIndex: 'occurrence_date',
      key: 'occurrence_date',
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '类型',
      dataIndex: 'anomaly_type',
      key: 'anomaly_type',
      width: 100,
      render: (type: string) => {
        const typeInfo = ANOMALY_TYPE_MAP[type] || { label: type, color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.label}</Tag>;
      }
    },
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 120,
      render: (text: string) => text || '-'
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      render: (text: string) => text || '-'
    },
    {
      title: '工位',
      key: 'station',
      width: 130,
      render: (_: any, record: AnomalyRecord) => {
        if (!record.station_code && !record.station_name) return '-';
        return `${record.station_code || ''} ${record.station_name || ''}`;
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
      width: 90,
      render: (text: string) => text || '-'
    },
    {
      title: '项目经理',
      dataIndex: 'project_manager_name',
      key: 'project_manager_name',
      width: 90,
      render: (text: string) => text || '-'
    },
    {
      title: '问题现象',
      dataIndex: 'problem_description',
      key: 'problem_description',
      ellipsis: true,
      width: 150,
      render: (text: string) => truncateText(text, 30)
    },
    {
      title: '涉及零件',
      key: 'part',
      width: 150,
      render: (_: any, record: AnomalyRecord) => {
        if (!record.part_number && !record.part_spec) return '-';
        return `${record.part_number || ''} / ${record.part_spec || ''}`;
      }
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 100,
      render: (text: string) => text || '-'
    },
    {
      title: '设计责任人',
      dataIndex: 'designer_name',
      key: 'designer_name',
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const statusInfo = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.label}</Tag>;
      }
    },
    {
      title: '改进标记',
      dataIndex: 'improvement_initiated',
      key: 'improvement_initiated',
      width: 80,
      render: (flag: number, record: AnomalyRecord) => {
        if (flag === 1 && record.improvement_id) {
          return (
            <Tooltip title="查看改进项目">
              <Button
                type="link"
                size="small"
                icon={<RocketOutlined />}
                onClick={() => navigate(`/improvement/${record.improvement_id}`)}
              />
            </Tooltip>
          );
        }
        return '-';
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: AnomalyRecord) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          {record.improvement_initiated !== 1 && record.status !== 'closed' && (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => handleInitiateImprovement(record.id)}>
              发起改进
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card>
        <div className="page-header">
          <h2 style={{ margin: 0 }}>过程异常及巡检问题管理</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增异常记录
          </Button>
        </div>

        <ImportExportToolbar module="anomaly" onImportSuccess={() => fetchData(1, pagination.pageSize)} />

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              value={filters.anomaly_type}
              onChange={(v) => setFilters({ ...filters, anomaly_type: v })}
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
            >
              <Option value="process">过程异常</Option>
              <Option value="inspection">巡检问题</Option>
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={filters.dateRange as any}
              onChange={(dates) => setFilters({ ...filters, dateRange: dates as any })}
              placeholder={['开始日期', '结束日期']}
            />
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
              <Option value="open">待处理</Option>
              <Option value="closed">已关闭</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Input.Search
              placeholder="搜索关键词"
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onSearch={handleSearch}
            />
          </Col>
        </Row>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24} style={{ textAlign: 'right' }}>
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
          tableKey="anomaly_list"
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
          scroll={{ x: 1800 }}
        />
      </Card>

      <Modal title={editingRecord ? '编辑异常记录' : '新增异常记录'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
       className="modal-lg">
        <Form form={form} layout="vertical" preserve={false} initialValues={{ anomaly_type: 'process', status: 'open' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="anomaly_type"
                label="异常类型"
                rules={[{ required: true, message: '请选择异常类型' }]}
              >
                <Radio.Group>
                  <Radio value="process">过程异常</Radio>
                  <Radio value="inspection">巡检问题</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="occurrence_date"
                label="发生日期"
                rules={[{ required: true, message: '请选择发生日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="project_id" label="所属项目">
                <Select
                  placeholder="请选择项目"
                  allowClear
                  onChange={handleProjectChange}
                  showSearch
                  filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                >
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>{p.project_code} - {p.project_name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="workstation_id" label="工位">
                <Select
                  placeholder="请选择工位"
                  allowClear
                  showSearch
                  filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                  onChange={handleWorkstationChange}
                  disabled={!selectedProject}
                >
                  {workstations.map(w => (
                    <Option key={w.id} value={w.id}>{w.station_code} - {w.station_name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="responsible_dept"
                label="责任部门"
                rules={[{ required: true, message: '请选择责任部门' }]}
              >
                <DepartmentSelect
                  placeholder="请选择责任部门"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="responsible_person_id" label="责任人">
                <FeishuUserSelect placeholder="请选择责任人" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="designer_id" label="设计责任人">
                <FeishuUserSelect placeholder="请选择设计责任人" allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="part_number" label="零件品号">
                <Input placeholder="请输入零件品号" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="part_spec" label="零件规格">
                <Input placeholder="请输入零件规格" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="supplier" label="供应商">
                <Input placeholder="请输入供应商" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="problem_description"
            label="问题现象描述"
            rules={[{ required: true, message: '请输入问题现象描述' }]}
          >
            <TextArea rows={4} placeholder="请详细描述问题现象" />
          </Form.Item>

          <Form.Item name="solution_plan" label="解决方案计划">
            <TextArea rows={3} placeholder="请输入解决方案计划" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="planned_completion_date" label="计划完成日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            {editingRecord && (
              <Col span={8}>
                <Form.Item name="actual_completion_date" label="实际完成日期">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            )}
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select
                  showSearch
                  filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                >
                  <Option value="open">待处理</Option>
                  <Option value="closed">已关闭</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default AnomalyPage;
