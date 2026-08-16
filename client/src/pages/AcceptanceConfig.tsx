import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space, Card, Row, Col,
  Popconfirm, App, Tabs, InputNumber
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined
} from '@ant-design/icons';
import { acceptanceApi } from '@/api';
import { AcceptanceConfig as AcceptanceConfigType, PROJECT_TYPES } from '@/types';
import ImportExportToolbar from '@/components/ImportExportToolbar';
import { ResizableTable } from '@/components/ResizableTable';

const { TextArea } = Input;

const CATEGORY_OPTIONS = [
  { value: 'mechanical', label: '机械结构', color: 'blue' },
  { value: 'electrical', label: '电气系统', color: 'cyan' },
  { value: 'functional', label: '功能测试', color: 'green' },
  { value: 'safety', label: '安全', color: 'red' },
  { value: 'error_proofing', label: '防错防呆', color: 'orange' },
  { value: 'msa', label: 'MSA', color: 'purple' },
  { value: 'mfu', label: 'MFU', color: 'geekblue' },
  { value: 'other', label: '其他', color: 'default' }
];

const PROJECT_TYPE_COLORS: Record<string, string> = {
  'G项目-小工装': 'blue',
  'P项目-产线': 'green',
  'P项目-实验室设备': 'purple'
};

const getCategoryInfo = (value: string) => {
  return CATEGORY_OPTIONS.find(c => c.value === value) || { label: value, color: 'default' };
};

const AcceptanceConfig: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AcceptanceConfigType[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<AcceptanceConfigType | null>(null);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState({
    project_type: undefined as string | undefined,
    category: undefined as string | undefined
  });
  const [activeTab, setActiveTab] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { is_active: 1 };
      if (filters.project_type) params.project_type = filters.project_type;
      if (filters.category) params.category = filters.category;
      const res = await acceptanceApi.configs(params);
      setData(res || []);
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReset = () => {
    setFilters({ project_type: undefined, category: undefined });
  };

  const handleSearch = () => {
    fetchData();
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ sort_order: 0 });
    setModalVisible(true);
  };

  const handleEdit = (record: AcceptanceConfigType) => {
    setEditingItem(record);
    form.setFieldsValue({
      project_type: record.project_type,
      category: record.category,
      item_name: record.item_name,
      standard: record.standard,
      method: record.method,
      sort_order: record.sort_order
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await acceptanceApi.deleteConfig(id);
      message.success('删除成功');
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await acceptanceApi.updateConfig(editingItem.id, values);
        message.success('更新成功');
      } else {
        await acceptanceApi.createConfig(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '项目类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 160,
      render: (text: string) => (
        <Tag color={PROJECT_TYPE_COLORS[text] || 'default'}>{text}</Tag>
      )
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (text: string) => {
        const info = getCategoryInfo(text);
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '验收项目名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 200
    },
    {
      title: '验收标准',
      dataIndex: 'standard',
      key: 'standard',
      ellipsis: true
    },
    {
      title: '检验方法',
      dataIndex: 'method',
      key: 'method',
      ellipsis: true
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, record: AcceptanceConfigType) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除此配置项？"
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const groupedData = data.reduce((acc, item) => {
    if (!acc[item.project_type]) acc[item.project_type] = [];
    acc[item.project_type].push(item);
    return acc;
  }, {} as Record<string, AcceptanceConfigType[]>);

  const projectTypes = Object.keys(groupedData).sort();
  const tabItems = [
    { key: 'all', label: '全部' },
    ...projectTypes.map(pt => ({ key: pt, label: pt }))
  ];

  const displayData = activeTab === 'all'
    ? data
    : groupedData[activeTab] || [];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select
              placeholder="选择项目类型"
              style={{ width: 200 }}
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.project_type}
              onChange={v => setFilters({ ...filters, project_type: v })}
              options={PROJECT_TYPES}
            />
          </Col>
          <Col>
            <Select
              placeholder="选择类别"
              style={{ width: 160 }}
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.category}
              onChange={v => setFilters({ ...filters, category: v })}
              options={CATEGORY_OPTIONS.map(c => ({ value: c.value, label: c.label }))}
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
        title="验收基础项配置"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增配置项
          </Button>
        }
      >
        <ImportExportToolbar module="acceptance_config" onImportSuccess={fetchData} />
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ marginBottom: 16 }}
        />
        <ResizableTable
          tableKey="acceptance_config"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={displayData}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal title={editingItem ? '编辑配置项' : '新增配置项'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
       className="modal-md">
        <Form form={form} layout="vertical">
          <Form.Item
            name="project_type"
            label="项目类型"
            rules={[{ required: true, message: '请选择项目类型' }]}
          >
            <Select
              options={PROJECT_TYPES}
              placeholder="请选择项目类型"
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item
            name="category"
            label="类别"
            rules={[{ required: true, message: '请选择类别' }]}
          >
            <Select
              options={CATEGORY_OPTIONS.map(c => ({ value: c.value, label: c.label }))}
              placeholder="请选择类别"
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item
            name="item_name"
            label="验收项目名称"
            rules={[{ required: true, message: '请输入验收项目名称' }]}
          >
            <Input placeholder="请输入验收项目名称" />
          </Form.Item>
          <Form.Item name="standard" label="验收标准">
            <TextArea rows={3} placeholder="请输入验收标准" />
          </Form.Item>
          <Form.Item name="method" label="检验方法">
            <TextArea rows={3} placeholder="请输入检验方法" />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AcceptanceConfig;
