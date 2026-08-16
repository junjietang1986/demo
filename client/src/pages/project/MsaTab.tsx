import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag,
  DatePicker, message, Row, Col, Statistic, Tooltip, Popconfirm
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, BarChartOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, StopOutlined,
  LineChartOutlined, DotChartOutlined, PieChartOutlined
} from '@ant-design/icons';
import { qualityApi, userApi } from '@/api';
import dayjs from 'dayjs';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface MsaStudy {
  id: number;
  study_type: 'grr' | 'bias' | 'linearity' | 'stability' | 'attribute';
  characteristic_name: string;
  gauge_name: string;
  gauge_no: string;
  tolerance?: number;
  appraiser_count?: number;
  part_count?: number;
  trial_count?: number;
  study_date?: string;
  responsible_id?: number;
  responsible_name?: string;
  grr_percent?: number;
  ndc?: number;
  conclusion: 'pending' | 'accepted' | 'conditional' | 'rejected';
  remark?: string;
}

const MsaTab: React.FC<Props> = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [studies, setStudies] = useState<MsaStudy[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStudy, setEditingStudy] = useState<MsaStudy | null>(null);
  const [form] = Form.useForm();
  const [msgApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadData();
    loadUsers();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.msa.listByProject(projectId);
      setStudies(data || []);
    } catch (err: any) {
      msgApi.error(err.message || '加载MSA数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await userApi.all();
      setUsers(data || []);
    } catch (err) {
      console.error('加载用户列表失败', err);
    }
  };

  const handleAdd = () => {
    setEditingStudy(null);
    form.resetFields();
    form.setFieldsValue({
      study_type: 'grr',
      appraiser_count: 3,
      part_count: 10,
      trial_count: 3,
      conclusion: 'pending'
    });
    setModalVisible(true);
  };

  const handleEdit = (study: MsaStudy) => {
    setEditingStudy(study);
    form.setFieldsValue({
      ...study,
      study_date: study.study_date ? dayjs(study.study_date) : null
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.msa.delete(id);
      msgApi.success('删除成功');
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        project_id: projectId,
        study_date: values.study_date ? values.study_date.format('YYYY-MM-DD') : null,
        grr_percent: values.grr_percent !== undefined ? Number(values.grr_percent) : null,
        ndc: values.ndc !== undefined ? Number(values.ndc) : null,
        appraiser_count: values.appraiser_count ? Number(values.appraiser_count) : null,
        part_count: values.part_count ? Number(values.part_count) : null,
        trial_count: values.trial_count ? Number(values.trial_count) : null,
        tolerance: values.tolerance ? Number(values.tolerance) : null
      };

      if (editingStudy) {
        await qualityApi.msa.update(editingStudy.id, data);
        msgApi.success('更新成功');
      } else {
        await qualityApi.msa.create(data);
        msgApi.success('添加成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '保存失败');
    }
  };

  const calculateConclusion = (grr?: number, ndc?: number): 'pending' | 'accepted' | 'conditional' | 'rejected' => {
    if (grr === undefined || grr === null) return 'pending';
    if (ndc !== undefined && ndc !== null && ndc < 5) return 'rejected';
    if (grr < 10) return 'accepted';
    if (grr <= 30) return 'conditional';
    return 'rejected';
  };

  const getStudyTypeTag = (type: string) => {
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      grr: { color: 'blue', text: 'GR&R双性', icon: <BarChartOutlined /> },
      bias: { color: 'cyan', text: '偏倚', icon: <LineChartOutlined /> },
      linearity: { color: 'geekblue', text: '线性', icon: <DotChartOutlined /> },
      stability: { color: 'purple', text: '稳定性', icon: <LineChartOutlined /> },
      attribute: { color: 'magenta', text: '计数型', icon: <PieChartOutlined /> }
    };
    const cfg = configs[type] || configs.grr;
    return <Tag color={cfg.color} icon={cfg.icon}>{cfg.text}</Tag>;
  };

  const getConclusionTag = (conclusion: string, grr?: number, ndc?: number) => {
    let actualConclusion = conclusion;
    if (conclusion === 'pending' && grr !== undefined && grr !== null) {
      actualConclusion = calculateConclusion(grr, ndc);
    }
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      pending: { color: 'default', text: '待判定', icon: <ExclamationCircleOutlined /> },
      accepted: { color: 'green', text: '接受', icon: <CheckCircleOutlined /> },
      conditional: { color: 'orange', text: '条件接受', icon: <ExclamationCircleOutlined /> },
      rejected: { color: 'red', text: '拒收', icon: <StopOutlined /> }
    };
    const cfg = configs[actualConclusion] || configs.pending;
    return <Tag color={cfg.color} icon={cfg.icon}>{cfg.text}</Tag>;
  };

  const getGrrColor = (grr?: number) => {
    if (grr === undefined || grr === null) return '#000';
    if (grr < 10) return '#52c41a';
    if (grr <= 30) return '#faad14';
    return '#ff4d4f';
  };

  const getStatistics = () => {
    const total = studies.length;
    const accepted = studies.filter(s => calculateConclusion(s.grr_percent, s.ndc) === 'accepted').length;
    const conditional = studies.filter(s => calculateConclusion(s.grr_percent, s.ndc) === 'conditional').length;
    const rejected = studies.filter(s => calculateConclusion(s.grr_percent, s.ndc) === 'rejected').length;
    const pending = studies.filter(s => calculateConclusion(s.grr_percent, s.ndc) === 'pending').length;
    return { total, accepted, conditional, rejected, pending };
  };

  const stats = getStatistics();

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_: any, __: any, idx: number) => idx + 1
    },
    {
      title: '研究类型',
      dataIndex: 'study_type',
      key: 'study_type',
      width: 120,
      fixed: 'left' as const,
      render: (type: string) => getStudyTypeTag(type)
    },
    {
      title: '特性名称',
      dataIndex: 'characteristic_name',
      key: 'characteristic_name',
      width: 180,
      fixed: 'left' as const,
      ellipsis: true
    },
    {
      title: '量具名称',
      dataIndex: 'gauge_name',
      key: 'gauge_name',
      width: 150,
      ellipsis: true
    },
    {
      title: '量具编号',
      dataIndex: 'gauge_no',
      key: 'gauge_no',
      width: 120
    },
    {
      title: '公差',
      dataIndex: 'tolerance',
      key: 'tolerance',
      width: 80,
      align: 'right' as const,
      render: (v: number) => v ?? '-'
    },
    {
      title: '评价/零件/试验',
      key: 'counts',
      width: 130,
      align: 'center' as const,
      render: (_: any, record: MsaStudy) => (
        <Space size="small">
          <Tag color="blue">{record.appraiser_count || '-'}</Tag>
          <span>/</span>
          <Tag color="green">{record.part_count || '-'}</Tag>
          <span>/</span>
          <Tag color="orange">{record.trial_count || '-'}</Tag>
        </Space>
      )
    },
    {
      title: '研究日期',
      dataIndex: 'study_date',
      key: 'study_date',
      width: 120,
      render: (date: string) => date || '-'
    },
    {
      title: '负责人',
      dataIndex: 'responsible_name',
      key: 'responsible_name',
      width: 100,
      ellipsis: true
    },
    {
      title: '%GRR',
      dataIndex: 'grr_percent',
      key: 'grr_percent',
      width: 100,
      align: 'right' as const,
      render: (v: number) => (
        v !== undefined && v !== null ? (
          <span style={{ color: getGrrColor(v), fontWeight: 'bold' }}>
            {v.toFixed(2)}%
          </span>
        ) : '-'
      )
    },
    {
      title: 'ndc',
      dataIndex: 'ndc',
      key: 'ndc',
      width: 80,
      align: 'center' as const,
      render: (v: number) => {
        if (v === undefined || v === null) return '-';
        const color = v >= 5 ? '#52c41a' : '#ff4d4f';
        return <span style={{ color, fontWeight: 'bold' }}>{v}</span>;
      }
    },
    {
      title: '结论',
      dataIndex: 'conclusion',
      key: 'conclusion',
      width: 110,
      render: (conclusion: string, record: MsaStudy) =>
        getConclusionTag(conclusion, record.grr_percent, record.ndc)
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: MsaStudy) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除此研究？" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      {contextHolder}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="研究总数" value={stats.total} suffix="项" prefix={<BarChartOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="接受" value={stats.accepted} suffix="项" valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="条件接受" value={stats.conditional} suffix="项" valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="拒收" value={stats.rejected} suffix="项" valueStyle={{ color: '#ff4d4f' }} prefix={<StopOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="待判定" value={stats.pending} suffix="项" valueStyle={{ color: '#8c8c8c' }} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="MSA测量系统分析"
        extra={
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增MSA研究</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_msa_studies"
          columns={columns}
          dataSource={studies}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600, y: 'calc(100vh - 430px)' }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingStudy ? '编辑MSA研究' : '新增MSA研究'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="study_type" label="研究类型" rules={[{ required: true, message: '请选择研究类型' }]}>
                <Select>
                  <Select.Option value="grr">GR&R双性研究</Select.Option>
                  <Select.Option value="bias">偏倚分析</Select.Option>
                  <Select.Option value="linearity">线性分析</Select.Option>
                  <Select.Option value="stability">稳定性分析</Select.Option>
                  <Select.Option value="attribute">计数型研究</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="characteristic_name" label="特性名称" rules={[{ required: true, message: '请输入特性名称' }]}>
                <Input placeholder="如：尺寸/外径/重量等" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gauge_name" label="量具名称" rules={[{ required: true, message: '请输入量具名称' }]}>
                <Input placeholder="如：游标卡尺/千分尺等" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gauge_no" label="量具编号" rules={[{ required: true, message: '请输入量具编号' }]}>
                <Input placeholder="量具资产编号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="tolerance" label="公差">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="公差值" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="appraiser_count" label="评价人数">
                <InputNumber min={1} max={10} style={{ width: '100%' }} placeholder="通常3人" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="part_count" label="零件数">
                <InputNumber min={1} max={50} style={{ width: '100%' }} placeholder="通常10件" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="trial_count" label="试验次数">
                <InputNumber min={1} max={10} style={{ width: '100%' }} placeholder="通常3次" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="study_date" label="研究日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="responsible_id" label="负责人">
                <Select placeholder="选择负责人" allowClear>
                  {users.map((u: any) => (
                    <Select.Option key={u.id} value={u.id}>{u.real_name || u.username}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="grr_percent" label="%GRR">
                <InputNumber min={0} max={200} style={{ width: '100%' }} placeholder="如 15.5" addonAfter="%" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ndc" label="ndc (可区分类别数)">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="通常>=5" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="conclusion" label="结论">
                <Select>
                  <Select.Option value="pending">待判定</Select.Option>
                  <Select.Option value="accepted">接受</Select.Option>
                  <Select.Option value="conditional">条件接受</Select.Option>
                  <Select.Option value="rejected">拒收</Select.Option>
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

export default MsaTab;
