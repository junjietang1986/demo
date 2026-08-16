import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, App, Row, Col
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { qualityApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface ControlPlanItem {
  id: number;
  project_id: number;
  cp_type: string;
  process_no: string;
  process_name: string;
  machine_or_device?: string;
  characteristics_product?: string;
  characteristics_process?: string;
  specification?: string;
  tolerance?: string;
  measurement_technique?: string;
  sample_size?: string;
  sample_frequency?: string;
  control_method?: string;
  reaction_plan?: string;
  responsible_name?: string;
}

const CP_TYPE_OPTIONS = [
  { value: 'prototype', label: '原型样件' },
  { value: 'prelaunch', label: '试生产' },
  { value: 'production', label: '量产' }
];

const CP_TYPE_COLORS: Record<string, string> = {
  prototype: 'blue',
  prelaunch: 'orange',
  production: 'green'
};

const ControlPlanTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ControlPlanItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ControlPlanItem[]>([]);
  const [cpTypeFilter, setCpTypeFilter] = useState<string | undefined>();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ControlPlanItem | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [projectId]);

  useEffect(() => {
    if (cpTypeFilter) {
      setFilteredItems(items.filter(item => item.cp_type === cpTypeFilter));
    } else {
      setFilteredItems(items);
    }
  }, [items, cpTypeFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.cp.listByProject(projectId);
      setItems(data || []);
    } catch (err: any) {
      message.error(err.message || '加载控制计划数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ cp_type: 'production' });
    setModalVisible(true);
  };

  const handleEdit = (item: ControlPlanItem) => {
    setEditingItem(item);
    form.setFieldsValue(item);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.cp.delete(id);
      message.success('删除成功');
      loadData();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        project_id: projectId
      };

      if (editingItem) {
        await qualityApi.cp.update(editingItem.id, data);
        message.success('更新成功');
      } else {
        await qualityApi.cp.create(data);
        message.success('添加成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const columns = [
    {
      title: '过程号',
      dataIndex: 'process_no',
      key: 'process_no',
      width: 80,
      fixed: 'left' as const
    },
    {
      title: '类型',
      dataIndex: 'cp_type',
      key: 'cp_type',
      width: 100,
      render: (v: string) => (
        <Tag color={CP_TYPE_COLORS[v] || 'default'}>
          {CP_TYPE_OPTIONS.find(o => o.value === v)?.label || v}
        </Tag>
      )
    },
    {
      title: '过程名称',
      dataIndex: 'process_name',
      key: 'process_name',
      width: 150
    },
    {
      title: '设备/工装',
      dataIndex: 'machine_or_device',
      key: 'machine_or_device',
      width: 130,
      ellipsis: true
    },
    {
      title: '产品特性',
      dataIndex: 'characteristics_product',
      key: 'characteristics_product',
      width: 150,
      ellipsis: true
    },
    {
      title: '过程特性',
      dataIndex: 'characteristics_process',
      key: 'characteristics_process',
      width: 150,
      ellipsis: true
    },
    {
      title: '规范/公差',
      dataIndex: 'specification',
      key: 'specification',
      width: 120,
      ellipsis: true,
      render: (_: any, record: ControlPlanItem) => (
        <span>{[record.specification, record.tolerance].filter(Boolean).join(' / ')}</span>
      )
    },
    {
      title: '测量技术',
      dataIndex: 'measurement_technique',
      key: 'measurement_technique',
      width: 130,
      ellipsis: true
    },
    {
      title: '样本量',
      dataIndex: 'sample_size',
      key: 'sample_size',
      width: 80
    },
    {
      title: '抽样频率',
      dataIndex: 'sample_frequency',
      key: 'sample_frequency',
      width: 100,
      ellipsis: true
    },
    {
      title: '控制方法',
      dataIndex: 'control_method',
      key: 'control_method',
      width: 130,
      ellipsis: true
    },
    {
      title: '反应计划',
      dataIndex: 'reaction_plan',
      key: 'reaction_plan',
      width: 130,
      ellipsis: true
    },
    {
      title: '负责人',
      dataIndex: 'responsible_name',
      key: 'responsible_name',
      width: 100
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: ControlPlanItem) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此条目？" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card
        size="small"
        title="控制计划 (Control Plan)"
        extra={
          <Space wrap>
            <Select
              placeholder="筛选类型"
              allowClear
              style={{ width: 140 }}
              options={CP_TYPE_OPTIONS}
              value={cpTypeFilter}
              onChange={setCpTypeFilter}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增条目</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_control_plan"
          columns={columns}
          dataSource={filteredItems}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600 }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingItem ? '编辑控制计划条目' : '新增控制计划条目'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="cp_type" label="控制计划类型" rules={[{ required: true, message: '请选择类型' }]}>
                <Select options={CP_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="process_no" label="过程号" rules={[{ required: true, message: '请输入过程号' }]}>
                <Input placeholder="如 10" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="responsible_name" label="负责人">
                <Input placeholder="负责人姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="process_name" label="过程名称" rules={[{ required: true, message: '请输入过程名称' }]}>
            <Input placeholder="过程/操作名称" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="machine_or_device" label="设备/工装">
                <Input placeholder="机器、装置、夹具、工装" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="characteristics_product" label="产品特性">
                <Input placeholder="产品特殊特性编号/描述" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="characteristics_process" label="过程特性">
            <Input placeholder="过程特殊特性编号/描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="specification" label="规范">
                <Input placeholder="规范/要求" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tolerance" label="公差">
                <Input placeholder="公差/技术规格" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="measurement_technique" label="测量技术">
                <Input placeholder="测量设备/量具/检具" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sample_size" label="样本量">
                <Input placeholder="样本容量" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sample_frequency" label="抽样频率">
                <Input placeholder="抽样频次" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="control_method" label="控制方法">
            <Input placeholder="控制方法(如SPC、防错、检验等)" />
          </Form.Item>
          <Form.Item name="reaction_plan" label="反应计划">
            <Input.TextArea rows={2} placeholder="异常反应计划/纠正措施" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ControlPlanTab;
