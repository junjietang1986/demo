import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag,
  message, Row, Col, Statistic, Tooltip, Popconfirm
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, LineChartOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, WarningOutlined,
  StopOutlined, DashboardOutlined, AlertOutlined
} from '@ant-design/icons';
import { qualityApi, userApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface SpcCharacteristic {
  id: number;
  characteristic_name: string;
  process_name: string;
  workstation: string;
  usl?: number;
  lsl?: number;
  target?: number;
  unit?: string;
  subgroup_size?: number;
  sampling_frequency?: string;
  cpk_target?: number;
  latest_cpk?: number;
  latest_ppk?: number;
  out_of_control_points?: number;
  status: 'monitoring' | 'out_of_control' | 'controlled';
  responsible_id?: number;
  responsible_name?: string;
  remark?: string;
}

const SpcTab: React.FC<Props> = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [characteristics, setCharacteristics] = useState<SpcCharacteristic[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingChar, setEditingChar] = useState<SpcCharacteristic | null>(null);
  const [form] = Form.useForm();
  const [msgApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadData();
    loadUsers();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await qualityApi.spc.listByProject(projectId);
      setCharacteristics(data || []);
    } catch (err: any) {
      msgApi.error(err.message || '加载SPC数据失败');
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
    setEditingChar(null);
    form.resetFields();
    form.setFieldsValue({
      subgroup_size: 5,
      cpk_target: 1.33,
      status: 'monitoring',
      out_of_control_points: 0
    });
    setModalVisible(true);
  };

  const handleEdit = (char: SpcCharacteristic) => {
    setEditingChar(char);
    form.setFieldsValue({
      ...char
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await qualityApi.spc.delete(id);
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
        usl: values.usl !== undefined ? Number(values.usl) : null,
        lsl: values.lsl !== undefined ? Number(values.lsl) : null,
        target: values.target !== undefined ? Number(values.target) : null,
        subgroup_size: values.subgroup_size ? Number(values.subgroup_size) : null,
        cpk_target: values.cpk_target !== undefined ? Number(values.cpk_target) : null,
        latest_cpk: values.latest_cpk !== undefined ? Number(values.latest_cpk) : null,
        latest_ppk: values.latest_ppk !== undefined ? Number(values.latest_ppk) : null,
        out_of_control_points: values.out_of_control_points ? Number(values.out_of_control_points) : 0
      };

      if (editingChar) {
        await qualityApi.spc.update(editingChar.id, data);
        msgApi.success('更新成功');
      } else {
        await qualityApi.spc.create(data);
        msgApi.success('添加成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '保存失败');
    }
  };

  const getCpkColor = (cpk?: number) => {
    if (cpk === undefined || cpk === null) return '#8c8c8c';
    if (cpk >= 1.67) return '#52c41a';
    if (cpk >= 1.33) return '#1677ff';
    if (cpk >= 1.0) return '#faad14';
    return '#ff4d4f';
  };

  const getCpkRating = (cpk?: number) => {
    if (cpk === undefined || cpk === null) return '-';
    if (cpk >= 1.67) return '优秀';
    if (cpk >= 1.33) return '合格';
    if (cpk >= 1.0) return '警告';
    return '不合格';
  };

  const getStatusTag = (status: string, outOfControl?: number) => {
    let actualStatus = status;
    if (outOfControl && outOfControl > 0 && status === 'monitoring') {
      actualStatus = 'out_of_control';
    }
    const configs: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
      controlled: { color: 'green', text: '受控', icon: <CheckCircleOutlined /> },
      monitoring: { color: 'blue', text: '监控中', icon: <DashboardOutlined /> },
      out_of_control: { color: 'red', text: '失控', icon: <AlertOutlined /> }
    };
    const cfg = configs[actualStatus] || configs.monitoring;
    return <Tag color={cfg.color} icon={cfg.icon}>{cfg.text}</Tag>;
  };

  const getStatistics = () => {
    const total = characteristics.length;
    const controlled = characteristics.filter(c => c.status === 'controlled').length;
    const monitoring = characteristics.filter(c => c.status === 'monitoring').length;
    const outOfControl = characteristics.filter(c => c.status === 'out_of_control' || (c.out_of_control_points && c.out_of_control_points > 0)).length;
    const avgCpk = total > 0
      ? characteristics.reduce((sum, c) => sum + (c.latest_cpk || 0), 0) / characteristics.filter(c => c.latest_cpk !== undefined && c.latest_cpk !== null).length || 0
      : 0;
    return { total, controlled, monitoring, outOfControl, avgCpk: isNaN(avgCpk) ? 0 : avgCpk };
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
      title: '特性名称',
      dataIndex: 'characteristic_name',
      key: 'characteristic_name',
      width: 160,
      fixed: 'left' as const,
      ellipsis: true
    },
    {
      title: '过程名称',
      dataIndex: 'process_name',
      key: 'process_name',
      width: 140,
      ellipsis: true
    },
    {
      title: '工位',
      dataIndex: 'workstation',
      key: 'workstation',
      width: 100
    },
    {
      title: 'USL/LSL/Target',
      key: 'spec_limits',
      width: 160,
      align: 'center' as const,
      render: (_: any, record: SpcCharacteristic) => (
        <Space size="small" direction="vertical" style={{ width: '100%' }}>
          <span style={{ color: '#ff4d4f' }}>USL: {record.usl ?? '-'}</span>
          <span style={{ color: '#52c41a' }}>T: {record.target ?? '-'}</span>
          <span style={{ color: '#ff4d4f' }}>LSL: {record.lsl ?? '-'}</span>
        </Space>
      )
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 70
    },
    {
      title: '子组大小',
      dataIndex: 'subgroup_size',
      key: 'subgroup_size',
      width: 90,
      align: 'center' as const
    },
    {
      title: '抽样频率',
      dataIndex: 'sampling_frequency',
      key: 'sampling_frequency',
      width: 110,
      ellipsis: true
    },
    {
      title: 'CPK目标',
      dataIndex: 'cpk_target',
      key: 'cpk_target',
      width: 90,
      align: 'center' as const,
      render: (v: number) => v ?? '-'
    },
    {
      title: '最新CPK',
      dataIndex: 'latest_cpk',
      key: 'latest_cpk',
      width: 120,
      align: 'center' as const,
      render: (v: number) => {
        if (v === undefined || v === null) return '-';
        const color = getCpkColor(v);
        return (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <span style={{ color, fontWeight: 'bold', fontSize: 16 }}>{v.toFixed(2)}</span>
            <Tag color={color} style={{ margin: 0 }}>{getCpkRating(v)}</Tag>
          </Space>
        );
      }
    },
    {
      title: '最新PPK',
      dataIndex: 'latest_ppk',
      key: 'latest_ppk',
      width: 90,
      align: 'center' as const,
      render: (v: number) => {
        if (v === undefined || v === null) return '-';
        return <span style={{ color: getCpkColor(v), fontWeight: 'bold' }}>{v.toFixed(2)}</span>;
      }
    },
    {
      title: '失控点数',
      dataIndex: 'out_of_control_points',
      key: 'out_of_control_points',
      width: 90,
      align: 'center' as const,
      render: (v: number) => {
        if (v === undefined || v === null || v === 0) return <Tag color="green">0</Tag>;
        return <Tag color="red" icon={<WarningOutlined />}>{v}</Tag>;
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: SpcCharacteristic) => getStatusTag(status, record.out_of_control_points)
    },
    {
      title: '负责人',
      dataIndex: 'responsible_name',
      key: 'responsible_name',
      width: 100,
      ellipsis: true
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: SpcCharacteristic) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除此特性？" onConfirm={() => handleDelete(record.id)}>
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
            <Statistic title="控制特性总数" value={stats.total} suffix="项" prefix={<LineChartOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="受控" value={stats.controlled} suffix="项" valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="监控中" value={stats.monitoring} suffix="项" valueStyle={{ color: '#1677ff' }} prefix={<DashboardOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="失控" value={stats.outOfControl} suffix="项" valueStyle={{ color: '#ff4d4f' }} prefix={<AlertOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="平均CPK" value={stats.avgCpk} precision={2} valueStyle={{ color: getCpkColor(stats.avgCpk) }} prefix={<LineChartOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="SPC统计过程控制"
        extra={
          <Space wrap>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增控制特性</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_spc"
          columns={columns}
          dataSource={characteristics}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600, y: 'calc(100vh - 430px)' }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
        />
      </Card>

      <Modal title={editingChar ? '编辑控制特性' : '新增控制特性'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="characteristic_name" label="特性名称" rules={[{ required: true, message: '请输入特性名称' }]}>
                <Input placeholder="如：外径/长度/重量等" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="process_name" label="过程名称" rules={[{ required: true, message: '请输入过程名称' }]}>
                <Input placeholder="如：车削/注塑/装配等" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="workstation" label="工位">
                <Input placeholder="工位编号/名称" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label="单位">
                <Input placeholder="如：mm/kg/%" />
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
              <Form.Item name="usl" label="上规格限 (USL)">
                <InputNumber style={{ width: '100%' }} placeholder="上公差限" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="target" label="目标值 (Target)">
                <InputNumber style={{ width: '100%' }} placeholder="目标值" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="lsl" label="下规格限 (LSL)">
                <InputNumber style={{ width: '100%' }} placeholder="下公差限" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="subgroup_size" label="子组大小">
                <InputNumber min={1} max={20} style={{ width: '100%' }} placeholder="通常5件" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sampling_frequency" label="抽样频率">
                <Select placeholder="选择频率">
                  <Select.Option value="每小时">每小时</Select.Option>
                  <Select.Option value="每2小时">每2小时</Select.Option>
                  <Select.Option value="每班">每班</Select.Option>
                  <Select.Option value="每日">每日</Select.Option>
                  <Select.Option value="每批次">每批次</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cpk_target" label="CPK目标">
                <InputNumber min={0} max={3} step={0.01} style={{ width: '100%' }} placeholder="通常1.33" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="latest_cpk" label="最新CPK">
                <InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} placeholder="当前CPK值" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="latest_ppk" label="最新PPK">
                <InputNumber min={0} max={5} step={0.01} style={{ width: '100%' }} placeholder="当前PPK值" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="out_of_control_points" label="失控点数">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="失控点数量" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Select.Option value="monitoring">监控中</Select.Option>
                  <Select.Option value="controlled">受控</Select.Option>
                  <Select.Option value="out_of_control">失控</Select.Option>
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

export default SpcTab;
