import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag,
  Popconfirm, Row, Col, App, Divider
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { qualityApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface FmeaItem {
  id: number;
  fmea_type: string;
  function_process: string;
  failure_mode: string;
  failure_effect: string;
  failure_cause: string;
  current_controls: string;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  recommended_action?: string;
  responsible?: string;
  target_date?: string;
  action_taken?: string;
  severity_after?: number;
  occurrence_after?: number;
  detection_after?: number;
  rpn_after?: number;
  status: string;
}

const FmeaTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FmeaItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<FmeaItem[]>([]);
  const [fmeaTypeFilter, setFmeaTypeFilter] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<FmeaItem | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [projectId]);

  useEffect(() => {
    if (fmeaTypeFilter) {
      setFilteredItems(items.filter(item => item.fmea_type === fmeaTypeFilter));
    } else {
      setFilteredItems(items);
    }
  }, [items, fmeaTypeFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.fmea.listByProject(projectId);
      setItems(data || []);
    } catch (err: any) {
      message.error(err.message || '加载FMEA数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      fmea_type: 'dfmea',
      severity: 1,
      occurrence: 1,
      detection: 1,
      status: 'open'
    });
    setModalVisible(true);
  };

  const handleEdit = (item: FmeaItem) => {
    setEditingItem(item);
    form.setFieldsValue(item);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.fmea.delete(id);
      message.success('删除成功');
      loadData();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const rpn = (values.severity || 1) * (values.occurrence || 1) * (values.detection || 1);
      const rpn_after = values.severity_after && values.occurrence_after && values.detection_after
        ? values.severity_after * values.occurrence_after * values.detection_after
        : undefined;
      const data = {
        ...values,
        project_id: projectId,
        rpn,
        rpn_after
      };

      if (editingItem) {
        await qualityApi.fmea.update(editingItem.id, data);
        message.success('更新成功');
      } else {
        await qualityApi.fmea.create(data);
        message.success('添加成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const getRpnColor = (rpn: number): string => {
    if (rpn > 100) return '#ff4d4f';
    if (rpn >= 40) return '#fa8c16';
    return '#52c41a';
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      open: 'orange',
      in_progress: 'blue',
      closed: 'green'
    };
    return colors[status] || 'default';
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      open: '待处理',
      in_progress: '进行中',
      closed: '已关闭'
    };
    return labels[status] || status;
  };

  const getFmeaTypeLabel = (type: string): string => {
    return type === 'dfmea' ? 'DFMEA' : 'PFMEA';
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
      title: '类型',
      dataIndex: 'fmea_type',
      key: 'fmea_type',
      width: 90,
      fixed: 'left' as const,
      render: (v: string) => <Tag color={v === 'dfmea' ? 'blue' : 'purple'}>{getFmeaTypeLabel(v)}</Tag>
    },
    {
      title: '功能/过程',
      dataIndex: 'function_process',
      key: 'function_process',
      width: 150,
      ellipsis: true
    },
    {
      title: '失效模式',
      dataIndex: 'failure_mode',
      key: 'failure_mode',
      width: 150,
      ellipsis: true
    },
    {
      title: '失效后果',
      dataIndex: 'failure_effect',
      key: 'failure_effect',
      width: 150,
      ellipsis: true
    },
    {
      title: '失效原因',
      dataIndex: 'failure_cause',
      key: 'failure_cause',
      width: 150,
      ellipsis: true
    },
    {
      title: '当前控制措施',
      dataIndex: 'current_controls',
      key: 'current_controls',
      width: 180,
      ellipsis: true
    },
    {
      title: 'S',
      dataIndex: 'severity',
      key: 'severity',
      width: 60,
      align: 'center' as const
    },
    {
      title: 'O',
      dataIndex: 'occurrence',
      key: 'occurrence',
      width: 60,
      align: 'center' as const
    },
    {
      title: 'D',
      dataIndex: 'detection',
      key: 'detection',
      width: 60,
      align: 'center' as const
    },
    {
      title: 'RPN',
      dataIndex: 'rpn',
      key: 'rpn',
      width: 80,
      align: 'center' as const,
      render: (v: number) => (
        <strong style={{ color: getRpnColor(v), fontSize: 16 }}>{v}</strong>
      )
    },
    {
      title: '建议措施',
      dataIndex: 'recommended_action',
      key: 'recommended_action',
      width: 150,
      ellipsis: true
    },
    {
      title: '负责人',
      dataIndex: 'responsible',
      key: 'responsible',
      width: 90
    },
    {
      title: '目标日期',
      dataIndex: 'target_date',
      key: 'target_date',
      width: 110
    },
    {
      title: '措施后RPN',
      dataIndex: 'rpn_after',
      key: 'rpn_after',
      width: 90,
      align: 'center' as const,
      render: (v: number) => v ? (
        <strong style={{ color: getRpnColor(v) }}>{v}</strong>
      ) : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => <Tag color={getStatusColor(v)}>{getStatusLabel(v)}</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: FmeaItem) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此FMEA条目？" onConfirm={() => handleDelete(record.id)}>
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
        title="FMEA失效模式与影响分析"
        extra={
          <Space wrap>
            <Select
              placeholder="FMEA类型筛选"
              allowClear
              style={{ width: 140 }}
              value={fmeaTypeFilter || undefined}
              onChange={(value) => setFmeaTypeFilter(value || '')}
              options={[
                { label: 'DFMEA(设计FMEA)', value: 'dfmea' },
                { label: 'PFMEA(过程FMEA)', value: 'pfmea' }
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增FMEA</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_fmea"
          columns={columns}
          dataSource={filteredItems}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1800, y: 'calc(100vh - 380px)' }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingItem ? '编辑FMEA' : '新增FMEA'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="fmea_type" label="FMEA类型" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="dfmea">DFMEA(设计FMEA)</Select.Option>
                  <Select.Option value="pfmea">PFMEA(过程FMEA)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Select.Option value="open">待处理</Select.Option>
                  <Select.Option value="in_progress">进行中</Select.Option>
                  <Select.Option value="closed">已关闭</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="function_process" label="功能/过程" rules={[{ required: true, message: '请输入功能/过程' }]}>
                <Input placeholder="请输入功能或过程名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="failure_mode" label="失效模式" rules={[{ required: true, message: '请输入失效模式' }]}>
                <Input placeholder="请输入失效模式" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="failure_effect" label="失效后果">
                <Input.TextArea rows={2} placeholder="请输入失效后果" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="failure_cause" label="失效原因">
                <Input.TextArea rows={2} placeholder="请输入失效原因" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="current_controls" label="当前控制措施">
            <Input.TextArea rows={2} placeholder="请输入当前控制措施" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="severity" label="S(严重度1-10)" rules={[{ required: true }]}>
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="occurrence" label="O(频度1-10)" rules={[{ required: true }]}>
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="detection" label="D(探测度1-10)" rules={[{ required: true }]}>
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" style={{ margin: '12px 0' }}>改进措施</Divider>
          <Form.Item name="recommended_action" label="建议措施">
            <Input.TextArea rows={2} placeholder="请输入建议的改进措施" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="responsible" label="负责人">
                <Input placeholder="负责人" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="target_date" label="目标完成日期">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="action_taken" label="已采取措施">
            <Input.TextArea rows={2} placeholder="请输入已采取的措施" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="severity_after" label="措施后S">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="occurrence_after" label="措施后O">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="detection_after" label="措施后D">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default FmeaTab;
