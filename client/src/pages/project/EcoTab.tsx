import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, App, Row, Col, Descriptions, DatePicker, Divider
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { qualityApi } from '@/api';
import dayjs from 'dayjs';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface EcoItem {
  id: number;
  project_id: number;
  change_no: string;
  change_type: string;
  change_title: string;
  change_description?: string;
  reason?: string;
  affected_parts?: string;
  impact_analysis?: string;
  risk_assessment?: string;
  requested_by_name?: string;
  requested_date?: string;
  approver_name?: string;
  approved_date?: string;
  implementation_date?: string;
  verification_result?: string;
  status: string;
}

const CHANGE_TYPE_OPTIONS = [
  { value: 'ecr', label: '变更请求(ECR)' },
  { value: 'eco', label: '变更指令(ECO)' }
];

const CHANGE_TYPE_COLORS: Record<string, string> = {
  ecr: 'orange',
  eco: 'purple'
};

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '已提交' },
  { value: 'approved', label: '已批准' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'implemented', label: '已实施' },
  { value: 'verified', label: '已验证' }
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  submitted: 'blue',
  approved: 'green',
  rejected: 'red',
  implemented: 'orange',
  verified: 'cyan'
};

const EcoTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EcoItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EcoItem | null>(null);
  const [detailItem, setDetailItem] = useState<EcoItem | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.eco.listByProject(projectId);
      setItems(data || []);
    } catch (err: any) {
      message.error(err.message || '加载工程变更数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      change_type: 'ecr',
      status: 'draft',
      requested_date: dayjs().format('YYYY-MM-DD')
    });
    setModalVisible(true);
  };

  const handleEdit = (item: EcoItem) => {
    setEditingItem(item);
    const formValues = { ...item };
    if (item.requested_date) formValues.requested_date = dayjs(item.requested_date);
    if (item.approved_date) formValues.approved_date = dayjs(item.approved_date);
    if (item.implementation_date) formValues.implementation_date = dayjs(item.implementation_date);
    form.setFieldsValue(formValues);
    setModalVisible(true);
  };

  const handleView = (item: EcoItem) => {
    setDetailItem(item);
    setDetailVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.eco.delete(id);
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
        project_id: projectId,
        requested_date: values.requested_date ? dayjs(values.requested_date).format('YYYY-MM-DD') : undefined,
        approved_date: values.approved_date ? dayjs(values.approved_date).format('YYYY-MM-DD') : undefined,
        implementation_date: values.implementation_date ? dayjs(values.implementation_date).format('YYYY-MM-DD') : undefined
      };

      if (editingItem) {
        await qualityApi.eco.update(editingItem.id, data);
        message.success('更新成功');
      } else {
        await qualityApi.eco.create(data);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const columns = [
    {
      title: '变更编号',
      dataIndex: 'change_no',
      key: 'change_no',
      width: 130,
      fixed: 'left' as const
    },
    {
      title: '变更类型',
      dataIndex: 'change_type',
      key: 'change_type',
      width: 120,
      render: (v: string) => (
        <Tag color={CHANGE_TYPE_COLORS[v] || 'default'}>
          {CHANGE_TYPE_OPTIONS.find(o => o.value === v)?.label || v}
        </Tag>
      )
    },
    {
      title: '变更标题',
      dataIndex: 'change_title',
      key: 'change_title',
      width: 220,
      ellipsis: true,
      render: (text: string, record: EcoItem) => (
        <a onClick={() => handleView(record)}>{text}</a>
      )
    },
    {
      title: '变更原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 180,
      ellipsis: true
    },
    {
      title: '提出人',
      dataIndex: 'requested_by_name',
      key: 'requested_by_name',
      width: 100
    },
    {
      title: '提出日期',
      dataIndex: 'requested_date',
      key: 'requested_date',
      width: 110
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => (
        <Tag color={STATUS_COLORS[v] || 'default'}>
          {STATUS_OPTIONS.find(o => o.value === v)?.label || v}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: EcoItem) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此变更？" onConfirm={() => handleDelete(record.id)}>
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
        title="工程变更管理 (ECR/ECO)"
        extra={
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建ECR</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_eco"
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600 }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingItem ? '编辑工程变更' : '新建工程变更'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="change_no" label="变更编号" rules={[{ required: true, message: '请输入变更编号' }]}>
                <Input placeholder="如 ECR-2024-001" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="change_type" label="变更类型" rules={[{ required: true, message: '请选择类型' }]}>
                <Select options={CHANGE_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="change_title" label="变更标题" rules={[{ required: true, message: '请输入变更标题' }]}>
            <Input placeholder="简要描述变更标题" />
          </Form.Item>
          <Form.Item name="change_description" label="变更描述">
            <Input.TextArea rows={2} placeholder="详细描述变更内容" />
          </Form.Item>
          <Form.Item name="reason" label="变更原因">
            <Input.TextArea rows={2} placeholder="说明变更原因及背景" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="affected_parts" label="受影响零件/产品">
                <Input placeholder="列出受影响的零件号/产品" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="risk_assessment" label="风险评估">
                <Input placeholder="变更风险等级及评估" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="impact_analysis" label="影响分析">
            <Input.TextArea rows={2} placeholder="对成本、交期、质量等的影响分析" />
          </Form.Item>
          <Divider orientation="left" style={{ margin: '12px 0' }}>审批与实施信息</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="requested_by_name" label="提出人">
                <Input placeholder="提出人姓名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="requested_date" label="提出日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="approver_name" label="批准人">
                <Input placeholder="批准人姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="approved_date" label="批准日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="implementation_date" label="实施日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="verification_result" label="验证结果">
            <Input.TextArea rows={2} placeholder="变更实施后的验证结果" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={detailItem ? `${detailItem.change_no} - 工程变更详情` : '变更详情'} open={detailVisible} onCancel={() => setDetailVisible(false)} footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>,
          detailItem && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { setDetailVisible(false); handleEdit(detailItem); }}>编辑</Button>
        ]} destroyOnHidden
       className="modal-lg">
        {detailItem && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="变更编号" span={1}>{detailItem.change_no}</Descriptions.Item>
            <Descriptions.Item label="变更类型" span={1}>
              <Tag color={CHANGE_TYPE_COLORS[detailItem.change_type]}>
                {CHANGE_TYPE_OPTIONS.find(o => o.value === detailItem.change_type)?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态" span={1}>
              <Tag color={STATUS_COLORS[detailItem.status]}>
                {STATUS_OPTIONS.find(o => o.value === detailItem.status)?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="变更标题" span={2}>{detailItem.change_title}</Descriptions.Item>
            <Descriptions.Item label="变更描述" span={2}>{detailItem.change_description || '-'}</Descriptions.Item>
            <Descriptions.Item label="变更原因" span={2}>{detailItem.reason || '-'}</Descriptions.Item>
            <Descriptions.Item label="受影响零件" span={1}>{detailItem.affected_parts || '-'}</Descriptions.Item>
            <Descriptions.Item label="风险评估" span={1}>{detailItem.risk_assessment || '-'}</Descriptions.Item>
            <Descriptions.Item label="影响分析" span={2}>{detailItem.impact_analysis || '-'}</Descriptions.Item>
            <Descriptions.Item label="提出人" span={1}>{detailItem.requested_by_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="提出日期" span={1}>{detailItem.requested_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="批准人" span={1}>{detailItem.approver_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="批准日期" span={1}>{detailItem.approved_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="实施日期" span={1}>{detailItem.implementation_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="验证结果" span={2}>{detailItem.verification_result || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default EcoTab;
