import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag,
  Popconfirm, Row, Col, App, Descriptions, Divider
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, AuditOutlined
} from '@ant-design/icons';
import { qualityApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface VdaFinding {
  id: number;
  audit_id: number;
  clause_no: string;
  clause_title: string;
  requirement: string;
  score: number;
  finding_description?: string;
  improvement_action?: string;
  responsible_person?: string;
  due_date?: string;
  status: string;
}

interface VdaAudit {
  id: number;
  project_id: number;
  audit_code: string;
  audit_title: string;
  audit_type: 'process' | 'product' | 'system';
  audit_date: string;
  auditor_name?: string;
  score: number;
  rating: 'pending' | 'A' | 'B' | 'C' | '0';
  major_nc_count: number;
  minor_nc_count: number;
  status: 'planned' | 'in_progress' | 'completed' | 'closed';
  description?: string;
  findings?: VdaFinding[];
  created_at: string;
}

const { TextArea } = Input;

const VdaTab: React.FC<Props> = ({ projectId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<VdaAudit[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [findingModalVisible, setFindingModalVisible] = useState(false);
  const [editingAudit, setEditingAudit] = useState<VdaAudit | null>(null);
  const [currentAudit, setCurrentAudit] = useState<VdaAudit | null>(null);
  const [findings, setFindings] = useState<VdaFinding[]>([]);
  const [editingFinding, setEditingFinding] = useState<VdaFinding | null>(null);
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);
  const [form] = Form.useForm();
  const [findingForm] = Form.useForm();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.vda.listByProject(projectId);
      setAudits(data || []);
    } catch (err: any) {
      message.error(err.message || '加载VDA审核数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadFindings = async (auditId: number) => {
    try {
      const data = await qualityApi.vda.getFindings(auditId);
      setFindings(data || []);
    } catch (err: any) {
      message.error(err.message || '加载审核条款失败');
    }
  };

  const handleAdd = () => {
    setEditingAudit(null);
    form.resetFields();
    form.setFieldsValue({
      audit_type: 'process',
      score: 0,
      rating: 'pending',
      major_nc_count: 0,
      minor_nc_count: 0,
      status: 'planned'
    });
    setModalVisible(true);
  };

  const handleEdit = (audit: VdaAudit) => {
    setEditingAudit(audit);
    form.setFieldsValue(audit);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.vda.delete(id);
      message.success('删除成功');
      loadData();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleManageFindings = async (audit: VdaAudit) => {
    setCurrentAudit(audit);
    await loadFindings(audit.id);
    setFindingModalVisible(true);
  };

  const handleAddFinding = () => {
    setEditingFinding(null);
    findingForm.resetFields();
    findingForm.setFieldsValue({
      score: 10,
      status: 'open'
    });
    setShowFindingForm(true);
  };

  const handleEditFinding = (finding: VdaFinding) => {
    setEditingFinding(finding);
    findingForm.setFieldsValue(finding);
    setShowFindingForm(true);
  };

  const handleDeleteFinding = async (findingId: number) => {
    try {
      await qualityApi.vda.deleteFinding(findingId);
      message.success('删除条款成功');
      if (currentAudit) {
        await loadFindings(currentAudit.id);
      }
    } catch (err: any) {
      message.error(err.message || '删除条款失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const data = { ...values, project_id: projectId };

      if (editingAudit) {
        await qualityApi.vda.update(editingAudit.id, data);
        message.success('更新成功');
      } else {
        await qualityApi.vda.create(data);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const handleFindingModalOk = async () => {
    try {
      const values = await findingForm.validateFields();
      if (!currentAudit) return;

      if (editingFinding) {
        await qualityApi.vda.updateFinding(editingFinding.id, values);
        message.success('更新条款成功');
      } else {
        await qualityApi.vda.createFinding(currentAudit.id, values);
        message.success('添加条款成功');
      }
      await loadFindings(currentAudit.id);
      findingForm.resetFields();
      setEditingFinding(null);
      setShowFindingForm(false);
    } catch (err: any) {
      message.error(err.message || '保存条款失败');
    }
  };

  const getRatingColor = (rating: string, score?: number) => {
    if (score !== undefined) {
      if (score >= 90) return 'green';
      if (score >= 80) return 'blue';
      if (score >= 70) return 'orange';
      if (score >= 0) return 'red';
    }
    const colors: Record<string, string> = {
      A: 'green', B: 'blue', C: 'orange', '0': 'red', pending: 'default'
    };
    return colors[rating] || 'default';
  };

  const getRatingLabel = (rating: string) => {
    const labels: Record<string, string> = {
      A: 'A级', B: 'B级', C: 'C级', '0': '0级', pending: '待定'
    };
    return labels[rating] || rating;
  };

  const getScoreColor = (score: number) => {
    const colors: Record<number, string> = {
      0: '#ff4d4f', 4: '#fa8c16', 6: '#1677ff', 8: '#52c41a', 10: '#135200'
    };
    return colors[score] || '#d9d9d9';
  };

  const getScoreLabel = (score: number) => {
    const labels: Record<number, string> = {
      0: '不符合', 4: '大部分符合', 6: '符合', 8: '优秀', 10: '满分'
    };
    return labels[score] || 'N/A';
  };

  const getAuditTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      process: '过程审核', product: '产品审核', system: '体系审核'
    };
    return labels[type] || type;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      planned: '计划中', in_progress: '进行中', completed: '已完成', closed: '已关闭'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planned: 'default', in_progress: 'processing', completed: 'success', closed: 'blue'
    };
    return colors[status] || 'default';
  };

  const expandedRowRender = (record: VdaAudit) => {
    const findingColumns = [
      { title: '条款号', dataIndex: 'clause_no', key: 'clause_no', width: 80 },
      { title: '条款标题', dataIndex: 'clause_title', key: 'clause_title', width: 200 },
      { title: '要求', dataIndex: 'requirement', key: 'requirement', ellipsis: true },
      {
        title: '评分',
        dataIndex: 'score',
        key: 'score',
        width: 120,
        render: (score: number) => (
          <Tag color={getScoreColor(score)}>
            {score}分 - {getScoreLabel(score)}
          </Tag>
        )
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (v: string) => <Tag color={v === 'open' ? 'orange' : v === 'closed' ? 'green' : 'default'}>{v === 'open' ? '开放' : v === 'closed' ? '关闭' : v}</Tag>
      }
    ];

    return (
      <ResizableTable
        tableKey="project_vda_findings"
        columns={findingColumns}
        dataSource={record.findings || []}
        rowKey="id"
        size="small"
        pagination={false}
      />
    );
  };

  const columns = [
    {
      title: '审核编号',
      dataIndex: 'audit_code',
      key: 'audit_code',
      width: 130,
      fixed: 'left' as const,
      render: (text: string, record: VdaAudit) => (
        <a onClick={() => handleManageFindings(record)}>{text}</a>
      )
    },
    { title: '审核标题', dataIndex: 'audit_title', key: 'audit_title', width: 200, ellipsis: true },
    {
      title: '审核类型',
      dataIndex: 'audit_type',
      key: 'audit_type',
      width: 100,
      render: (v: string) => <Tag>{getAuditTypeLabel(v)}</Tag>
    },
    { title: '审核日期', dataIndex: 'audit_date', key: 'audit_date', width: 110 },
    { title: '审核员', dataIndex: 'auditor_name', key: 'auditor_name', width: 100 },
    {
      title: '得分',
      dataIndex: 'score',
      key: 'score',
      width: 80,
      align: 'center' as const,
      render: (v: number, record: VdaAudit) => (
        <strong style={{ color: getRatingColor(record.rating, v) }}>{v}</strong>
      )
    },
    {
      title: '评级',
      dataIndex: 'rating',
      key: 'rating',
      width: 80,
      align: 'center' as const,
      render: (v: string, record: VdaAudit) => (
        <Tag color={getRatingColor(v, record.score)}>{getRatingLabel(v)}</Tag>
      )
    },
    {
      title: '严重不符合',
      dataIndex: 'major_nc_count',
      key: 'major_nc_count',
      width: 100,
      align: 'center' as const,
      render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <span>0</span>
    },
    {
      title: '轻微不符合',
      dataIndex: 'minor_nc_count',
      key: 'minor_nc_count',
      width: 100,
      align: 'center' as const,
      render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : <span>0</span>
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
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: VdaAudit) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleManageFindings(record)}>条款</Button>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此审核？" onConfirm={() => handleDelete(record.id)}>
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
        title="VDA6.7过程审核"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建审核</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_vda_audits"
          columns={columns}
          dataSource={audits}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          size="small"
          expandable={{
            expandedRowRender,
            expandedRowKeys,
            onExpand: async (expanded, record) => {
              if (expanded) {
                setExpandedRowKeys([record.id]);
                if (!record.findings) {
                  await loadFindings(record.id);
                  setAudits(prev => prev.map(a => a.id === record.id ? { ...a, findings } : a));
                }
              } else {
                setExpandedRowKeys([]);
              }
            }
          }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Modal title={editingAudit ? '编辑审核' : '新建VDA审核'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-md">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="audit_code" label="审核编号" rules={[{ required: true, message: '请输入审核编号' }]}>
                <Input placeholder="如 VDA-2024-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="audit_title" label="审核标题" rules={[{ required: true, message: '请输入审核标题' }]}>
                <Input placeholder="请输入审核标题" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="audit_type" label="审核类型" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="process">过程审核</Select.Option>
                  <Select.Option value="product">产品审核</Select.Option>
                  <Select.Option value="system">体系审核</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="audit_date" label="审核日期" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="auditor_name" label="审核员">
                <Input placeholder="审核员姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="score" label="得分">
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="rating" label="评级">
                <Select>
                  <Select.Option value="pending">待定</Select.Option>
                  <Select.Option value="A">A级</Select.Option>
                  <Select.Option value="B">B级</Select.Option>
                  <Select.Option value="C">C级</Select.Option>
                  <Select.Option value="0">0级</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="major_nc_count" label="严重不符合数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="minor_nc_count" label="轻微不符合数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Select.Option value="planned">计划中</Select.Option>
                  <Select.Option value="in_progress">进行中</Select.Option>
                  <Select.Option value="completed">已完成</Select.Option>
                  <Select.Option value="closed">已关闭</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="审核说明">
            <TextArea rows={3} placeholder="审核范围、目的等说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={currentAudit ? `${currentAudit.audit_code} - 审核条款管理` : '审核条款管理'} open={findingModalVisible} onCancel={() => { setFindingModalVisible(false); setEditingFinding(null); setShowFindingForm(false); findingForm.resetFields(); loadData(); }} destroyOnHidden
         footer={null} className="modal-lg">
        {currentAudit && (
          <div>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="审核标题">{currentAudit.audit_title}</Descriptions.Item>
              <Descriptions.Item label="审核类型">{getAuditTypeLabel(currentAudit.audit_type)}</Descriptions.Item>
              <Descriptions.Item label="审核日期">{currentAudit.audit_date}</Descriptions.Item>
              <Descriptions.Item label="审核员">{currentAudit.auditor_name || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">评分标准：0=不符合(红) | 4=大部分符合(橙) | 6=符合(蓝) | 8=优秀(绿) | 10=满分(深绿)</Divider>

            <div style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddFinding} size="small">添加条款</Button>
            </div>

            <ResizableTable
              tableKey="project_vda_manage_findings"
              dataSource={findings}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
              columns={[
                { title: '条款号', dataIndex: 'clause_no', key: 'clause_no', width: 80 },
                { title: '条款标题', dataIndex: 'clause_title', key: 'clause_title', width: 150 },
                { title: '要求', dataIndex: 'requirement', key: 'requirement', width: 200, ellipsis: true },
                {
                  title: '评分',
                  dataIndex: 'score',
                  key: 'score',
                  width: 80,
                  render: (score: number) => (
                    <Tag color={getScoreColor(score)}>{score}</Tag>
                  )
                },
                {
                  title: '操作',
                  key: 'action',
                  width: 120,
                  render: (_: any, record: VdaFinding) => (
                    <Space size="small">
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditFinding(record)} />
                      <Popconfirm title="确定删除此条款？" onConfirm={() => handleDeleteFinding(record.id)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  )
                }
              ]}
            />

            {showFindingForm && (
              <Card size="small" title={editingFinding ? '编辑条款' : '添加条款'} style={{ marginTop: 16 }}>
                <Form form={findingForm} layout="vertical">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item name="clause_no" label="条款号" rules={[{ required: true }]}>
                        <Input placeholder="如 6.1.1" />
                      </Form.Item>
                    </Col>
                    <Col span={10}>
                      <Form.Item name="clause_title" label="条款标题" rules={[{ required: true }]}>
                        <Input placeholder="条款标题" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item name="score" label="评分">
                        <Select>
                          <Select.Option value={0}>0分</Select.Option>
                          <Select.Option value={4}>4分</Select.Option>
                          <Select.Option value={6}>6分</Select.Option>
                          <Select.Option value={8}>8分</Select.Option>
                          <Select.Option value={10}>10分</Select.Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item name="status" label="状态">
                        <Select>
                          <Select.Option value="open">开放</Select.Option>
                          <Select.Option value="closed">关闭</Select.Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="requirement" label="要求">
                    <TextArea rows={2} placeholder="条款要求描述" />
                  </Form.Item>
                  <Form.Item name="finding_description" label="发现问题">
                    <TextArea rows={2} placeholder="审核发现的问题描述" />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="improvement_action" label="改进措施">
                        <TextArea rows={2} placeholder="改进措施" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="responsible_person" label="责任人">
                        <Input placeholder="责任人" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="due_date" label="完成期限">
                        <Input type="date" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Space>
                    <Button type="primary" onClick={handleFindingModalOk}>{editingFinding ? '更新' : '添加'}</Button>
                    <Button onClick={() => { setEditingFinding(null); setShowFindingForm(false); findingForm.resetFields(); }}>取消</Button>
                  </Space>
                </Form>
              </Card>
            )}

            {!showFindingForm && findings.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                暂无审核条款，点击"添加条款"开始录入
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VdaTab;
