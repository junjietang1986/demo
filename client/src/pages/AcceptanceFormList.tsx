import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Select, DatePicker, Tag, Space, Card, Row, Col,
  Popconfirm, App, Badge, Dropdown
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, DownloadOutlined, FilePdfOutlined,
  FileExcelOutlined, EyeOutlined
} from '@ant-design/icons';
import { acceptanceApi, projectApi } from '@/api';
import { AcceptanceForm, Project, STATUS_MAP, PROJECT_TYPES } from '@/types';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { ResizableTable } from '../components/ResizableTable';

const { RangePicker } = DatePicker;

const AcceptanceFormList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AcceptanceForm[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [generateForm] = Form.useForm();
  const [filters, setFilters] = useState<{
    project_id?: number;
    status?: string;
    date_range?: [dayjs.Dayjs, dayjs.Dayjs];
  }>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.project_id) params.project_id = filters.project_id;
      if (filters.status) params.status = filters.status;
      if (filters.date_range && filters.date_range.length === 2) {
        params.start_date = filters.date_range[0].format('YYYY-MM-DD');
        params.end_date = filters.date_range[1].format('YYYY-MM-DD');
      }
      const res = await acceptanceApi.forms(params);
      setData(Array.isArray(res) ? res : (res.list || []));
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await projectApi.list({ status: 'active' });
      setProjects(Array.isArray(res) ? res : (res.list || []));
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProjects();
  }, []);

  const handleReset = () => {
    setFilters({});
  };

  const handleSearch = () => {
    fetchData();
  };

  const handleDelete = async (id: number) => {
    try {
      await acceptanceApi.deleteForm(id);
      message.success('删除成功');
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const handleExport = async (id: number, format: 'excel' | 'pdf') => {
    try {
      const res = await acceptanceApi.exportForm(id, format);
      const blob = new Blob([res], {
        type: format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `验收单_${id}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err: any) {
      message.error(err?.message || '导出失败');
    }
  };

  const handleGenerateForm = async () => {
    try {
      const values = await generateForm.validateFields();
      const res = await acceptanceApi.generateForm(values.project_id);
      message.success('验收单生成成功');
      setGenerateModalVisible(false);
      generateForm.resetFields();
      if (res?.id) {
        navigate(`/acceptance/forms/${res.id}`);
      } else {
        fetchData();
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '生成失败');
    }
  };

  const handleManualCreate = async () => {
    try {
      const res = await acceptanceApi.createForm({});
      message.success('创建成功');
      if (res?.id) {
        navigate(`/acceptance/forms/${res.id}`);
      } else {
        fetchData();
      }
    } catch (err: any) {
      message.error(err?.message || '创建失败');
    }
  };

  const getProjectTypeColor = (type: string) => {
    if (type?.startsWith('G')) return 'blue';
    if (type?.includes('产线')) return 'green';
    if (type?.includes('实验室')) return 'purple';
    return 'default';
  };

  const columns = [
    {
      title: '验收单编号',
      dataIndex: 'form_code',
      key: 'form_code',
      width: 160,
      render: (text: string, record: AcceptanceForm) => (
        <Space>
          {text}
          {record.status === 'approved' && (
            <Badge status="success" text="" />
          )}
        </Space>
      )
    },
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 130
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true
    },
    {
      title: '项目类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 140,
      render: (text: string) => (
        <Tag color={getProjectTypeColor(text)}>{text}</Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '验收日期',
      dataIndex: 'acceptance_date',
      key: 'acceptance_date',
      width: 120,
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD') : '-'
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: AcceptanceForm) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/acceptance/forms/${record.id}`)}
          >
            查看
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  icon: <FileExcelOutlined />,
                  label: '导出Excel',
                  onClick: () => handleExport(record.id, 'excel')
                },
                {
                  key: 'pdf',
                  icon: <FilePdfOutlined />,
                  label: '导出PDF',
                  onClick: () => handleExport(record.id, 'pdf')
                }
              ]
            }}
          >
            <Button type="link" size="small" icon={<DownloadOutlined />}>
              导出
            </Button>
          </Dropdown>
          {record.status === 'draft' && (
            <Popconfirm
              title="确认删除此验收单？"
              onConfirm={() => handleDelete(record.id)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const createMenuItems = [
    {
      key: 'generate',
      label: '从项目自动生成',
      onClick: () => setGenerateModalVisible(true)
    },
    {
      key: 'manual',
      label: '手动创建',
      onClick: handleManualCreate
    }
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select
              placeholder="选择项目"
              style={{ width: 220 }}
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.project_id}
              onChange={v => setFilters({ ...filters, project_id: v })}
              options={projects.map(p => ({
                value: p.id,
                label: `${p.project_code} - ${p.project_name}`
              }))}
            />
          </Col>
          <Col>
            <Select
              placeholder="选择状态"
              style={{ width: 140 }}
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.status}
              onChange={v => setFilters({ ...filters, status: v })}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Col>
          <Col>
            <RangePicker
              value={filters.date_range as any}
              onChange={dates => setFilters({ ...filters, date_range: dates as [dayjs.Dayjs, dayjs.Dayjs] })}
            />
          </Col>
          <Col>
            <Space>
              <Button type="primary" onClick={handleSearch}>查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title="项目验收单"
        extra={
          <Dropdown menu={{ items: createMenuItems }}>
            <Button type="primary" icon={<PlusOutlined />}>
              新建验收单
            </Button>
          </Dropdown>
        }
      >
        <ResizableTable
          tableKey="acceptance_form_list"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title="从项目自动生成验收单"
        open={generateModalVisible}
        onOk={handleGenerateForm}
        onCancel={() => { setGenerateModalVisible(false); generateForm.resetFields(); }}
        destroyOnHidden
        className="modal-sm"
      >
        <Form form={generateForm} layout="vertical">
          <Form.Item
            name="project_id"
            label="选择项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select
              placeholder="请选择项目"
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={projects.map(p => ({
                value: p.id,
                label: `${p.project_code} - ${p.project_name} (${p.project_type})`
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AcceptanceFormList;
