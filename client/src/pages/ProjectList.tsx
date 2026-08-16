import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space, Card, Row, Col, Popconfirm, App } from 'antd';
import { PlusOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { projectApi } from '@/api';
import { Project, PROJECT_TYPES, STATUS_MAP } from '@/types';
import ImportExportToolbar from '@/components/ImportExportToolbar';
import { ResizableTable } from '../components/ResizableTable';

const { Option } = Select;

const ProjectList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [filters, setFilters] = useState({ project_type: '', status: '', keyword: '' });

  const fetchProjects = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const params: any = { page, pageSize, ...filters };
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });
      const res = await projectApi.list(params);
      setProjects(Array.isArray(res) ? res : (res.list || []));
      setPagination({
        current: page,
        pageSize,
        total: res.total || (Array.isArray(res) ? res.length : 0)
      });
    } catch (error) {
      message.error('获取项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSearch = () => {
    fetchProjects(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({ project_type: '', status: '', keyword: '' });
    fetchProjects(1, pagination.pageSize);
  };

  const handleAdd = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleView = (id: number) => {
    navigate(`/projects/${id}`);
  };

  const handleDelete = async (id: number) => {
    try {
      await projectApi.delete(id);
      message.success('删除成功');
      fetchProjects(pagination.current, pagination.pageSize);
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const res = await projectApi.create(values);
      message.success('创建成功，请完善项目基础信息和VOC附件');
      setModalVisible(false);
      form.resetFields();
      navigate(`/projects/${res.id}?new=1`);
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleTableChange = (pag: any) => {
    fetchProjects(pag.current, pag.pageSize);
  };

  const columns = [
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 120,
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
    },
    {
      title: '项目类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 140,
      render: (type: string) => {
        const typeItem = PROJECT_TYPES.find(t => t.value === type);
        const colorMap: Record<string, string> = {
          'G项目-小工装': 'blue',
          'P项目-产线': 'green',
          'P项目-实验室设备': 'purple'
        };
        return <Tag color={colorMap[type] || 'default'}>{typeItem?.label || type}</Tag>;
      }
    },
    {
      title: '客户',
      dataIndex: 'customer',
      key: 'customer',
      width: 120,
    },
    {
      title: '项目经理',
      dataIndex: 'project_manager_name',
      key: 'project_manager_name',
      width: 100,
    },
    {
      title: '机械设计负责人',
      dataIndex: 'mech_designer_name',
      key: 'mech_designer_name',
      width: 120,
    },
    {
      title: '电气设计负责人',
      dataIndex: 'elec_designer_name',
      key: 'elec_designer_name',
      width: 120,
    },
    {
      title: '工位数',
      dataIndex: 'workstation_count',
      key: 'workstation_count',
      width: 80,
      render: (_: any, record: Project) => record.workstations?.length || 0
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
      width: 160,
      fixed: 'right' as const,
      render: (_: any, record: Project) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record.id)}>查看</Button>
          <Popconfirm title="确定要删除这个项目吗？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card>
        <div className="page-header">
          <h2>项目管理</h2>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建项目</Button>
          </Space>
        </div>

        <ImportExportToolbar module="project" onImportSuccess={() => fetchProjects(pagination.current, pagination.pageSize)} />

        <Row gutter={16} style={{ marginBottom: '16px' }}>
          <Col span={5}>
            <Select
              placeholder="项目类型"
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              style={{ width: '100%' }}
              value={filters.project_type || undefined}
              onChange={(v) => setFilters({ ...filters, project_type: v || '' })}
            >
              {PROJECT_TYPES.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
          </Col>
          <Col span={5}>
            <Select
              placeholder="状态"
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              style={{ width: '100%' }}
              value={filters.status || undefined}
              onChange={(v) => setFilters({ ...filters, status: v || '' })}
            >
              {Object.entries(STATUS_MAP).map(([key, val]) => (
                <Option key={key} value={key}>{val.label}</Option>
              ))}
            </Select>
          </Col>
          <Col span={8}>
            <Input.Search
              placeholder="搜索项目编号/名称/客户"
              allowClear
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onSearch={handleSearch}
            />
          </Col>
          <Col span={6}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>

        <ResizableTable
          tableKey="project_list"
          columns={columns}
          dataSource={projects}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`
          }}
          onChange={handleTableChange}
          scroll={{ x: 1400 }}
        />
      </Card>

      <Modal title="新建项目" open={modalVisible} onOk={handleModalOk} onCancel={() => { setModalVisible(false); form.resetFields(); }} forceRender
       className="modal-sm">
        <Form form={form} layout="vertical">
          <Form.Item name="project_type" label="项目类型" rules={[{ required: true, message: '请选择项目类型' }]}>
            <Select
              placeholder="请选择项目类型"
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
            >
              {PROJECT_TYPES.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="project_name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <div style={{ color: '#888', fontSize: 12, marginTop: -8 }}>
            提示：创建后将进入项目详情页，可完善项目基础信息、团队成员、客户需求(VOC)及附件等完整信息。
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectList;
