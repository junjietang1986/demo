import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag,
  Popconfirm, Row, Col, App
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { qualityApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface DvprItem {
  id: number;
  test_no: string;
  test_name: string;
  test_category: string;
  test_spec?: string;
  requirement?: string;
  test_method?: string;
  sample_size?: number;
  responsible?: string;
  planned_start?: string;
  planned_finish?: string;
  actual_start?: string;
  actual_finish?: string;
  result: string;
  pass_fail?: string;
  lab_name?: string;
  report_no?: string;
  remark?: string;
}

const DvprTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DvprItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<DvprItem | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.dvpr.listByProject(projectId);
      setItems(data || []);
    } catch (err: any) {
      message.error(err.message || '加载DVP&R数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      test_category: 'functional',
      sample_size: 1,
      result: 'pending'
    });
    setModalVisible(true);
  };

  const handleEdit = (item: DvprItem) => {
    setEditingItem(item);
    form.setFieldsValue(item);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.dvpr.delete(id);
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
        await qualityApi.dvpr.update(editingItem.id, data);
        message.success('更新成功');
      } else {
        await qualityApi.dvpr.create(data);
        message.success('添加成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const getTestCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      functional: 'blue',
      durability: 'orange',
      environmental: 'green',
      emc: 'purple',
      safety: 'red',
      other: 'default'
    };
    return colors[category] || 'default';
  };

  const getTestCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      functional: '功能试验',
      durability: '耐久性试验',
      environmental: '环境试验',
      emc: 'EMC试验',
      safety: '安全试验',
      other: '其他'
    };
    return labels[category] || category;
  };

  const getResultColor = (result: string): string => {
    const colors: Record<string, string> = {
      pending: 'default',
      pass: 'green',
      fail: 'red'
    };
    return colors[result] || 'default';
  };

  const getResultLabel = (result: string): string => {
    const labels: Record<string, string> = {
      pending: '待测试',
      pass: '通过',
      fail: '不通过'
    };
    return labels[result] || result;
  };

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      fixed: 'left' as const,
      render: (_: any, __: any, idx: number) => idx + 1
    },
    {
      title: '试验编号',
      dataIndex: 'test_no',
      key: 'test_no',
      width: 100,
      fixed: 'left' as const
    },
    {
      title: '试验名称',
      dataIndex: 'test_name',
      key: 'test_name',
      width: 180,
      fixed: 'left' as const,
      ellipsis: true
    },
    {
      title: '试验类别',
      dataIndex: 'test_category',
      key: 'test_category',
      width: 110,
      render: (v: string) => <Tag color={getTestCategoryColor(v)}>{getTestCategoryLabel(v)}</Tag>
    },
    {
      title: '规范要求',
      dataIndex: 'requirement',
      key: 'requirement',
      width: 150,
      ellipsis: true
    },
    {
      title: '试验方法',
      dataIndex: 'test_method',
      key: 'test_method',
      width: 150,
      ellipsis: true
    },
    {
      title: '样本量',
      dataIndex: 'sample_size',
      key: 'sample_size',
      width: 70,
      align: 'center' as const
    },
    {
      title: '负责人',
      dataIndex: 'responsible',
      key: 'responsible',
      width: 90
    },
    {
      title: '计划开始',
      dataIndex: 'planned_start',
      key: 'planned_start',
      width: 110
    },
    {
      title: '计划完成',
      dataIndex: 'planned_finish',
      key: 'planned_finish',
      width: 110
    },
    {
      title: '实际完成',
      dataIndex: 'actual_finish',
      key: 'actual_finish',
      width: 110
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 90,
      render: (v: string) => <Tag color={getResultColor(v)}>{getResultLabel(v)}</Tag>
    },
    {
      title: '报告编号',
      dataIndex: 'report_no',
      key: 'report_no',
      width: 110
    },
    {
      title: '试验室',
      dataIndex: 'lab_name',
      key: 'lab_name',
      width: 100,
      ellipsis: true
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 120,
      ellipsis: true
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: DvprItem) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此试验项？" onConfirm={() => handleDelete(record.id)}>
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
        title="DVP&R设计验证计划与报告"
        extra={
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增试验</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_dvpr"
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1800, y: 'calc(100vh - 380px)' }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingItem ? '编辑试验项' : '新增试验项'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="test_no" label="试验编号" rules={[{ required: true, message: '请输入试验编号' }]}>
                <Input placeholder="如 DV-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="test_name" label="试验名称" rules={[{ required: true, message: '请输入试验名称' }]}>
                <Input placeholder="请输入试验名称" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="test_category" label="试验类别" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="functional">功能试验</Select.Option>
                  <Select.Option value="durability">耐久性试验</Select.Option>
                  <Select.Option value="environmental">环境试验</Select.Option>
                  <Select.Option value="emc">EMC试验</Select.Option>
                  <Select.Option value="safety">安全试验</Select.Option>
                  <Select.Option value="other">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="test_spec" label="试验规范">
                <Input placeholder="试验依据规范/标准" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="requirement" label="规范要求">
                <Input placeholder="验收标准/要求" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="test_method" label="试验方法">
            <Input.TextArea rows={2} placeholder="请描述试验方法" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="sample_size" label="样本量">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="responsible" label="负责人">
                <Input placeholder="负责人" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="lab_name" label="试验室">
                <Input placeholder="试验室名称" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="report_no" label="报告编号">
                <Input placeholder="试验报告编号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="planned_start" label="计划开始日期">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="planned_finish" label="计划完成日期">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="actual_start" label="实际开始日期">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="actual_finish" label="实际完成日期">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="result" label="试验结果">
                <Select>
                  <Select.Option value="pending">待测试</Select.Option>
                  <Select.Option value="pass">通过</Select.Option>
                  <Select.Option value="fail">不通过</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="pass_fail" label="合格判定">
                <Select>
                  <Select.Option value="pass">合格</Select.Option>
                  <Select.Option value="fail">不合格</Select.Option>
                  <Select.Option value="conditional">有条件合格</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DvprTab;
