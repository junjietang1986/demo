import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Select, Tag, Modal, Form,
  App, Row, Col, Statistic, Typography, Popconfirm, Drawer, Descriptions, Badge, Tooltip, Alert, Upload, DatePicker
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, EyeOutlined, WarningOutlined, StopOutlined,
  ExclamationCircleOutlined, CheckCircleOutlined, AlertOutlined,
  ApiOutlined, LinkOutlined, GlobalOutlined,
  FilePdfOutlined, FileTextOutlined, FileWordOutlined, FileExcelOutlined,
  FileImageOutlined, FileZipOutlined, DownloadOutlined, UploadOutlined,
  FileOutlined, CloseCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { ceComplianceApi } from '@/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const CONTROL_TYPE_MAP: Record<string, string> = {
  brand: '品牌/企业',
  part: '物料/技术'
};

const CONTROL_TYPE_COLORS: Record<string, string> = {
  brand: 'purple',
  part: 'cyan'
};

const RESTRICTION_LEVEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  prohibited: { label: '禁止', color: 'red', icon: <StopOutlined /> },
  restricted: { label: '限制', color: 'orange', icon: <ExclamationCircleOutlined /> },
  warning: { label: '警示', color: 'gold', icon: <WarningOutlined /> }
};

const REGION_MAP: Record<string, { label: string; color: string }> = {
  US: { label: '美国', color: 'blue' },
  EU: { label: '欧盟', color: 'cyan' },
  CN: { label: '中国', color: 'red' },
  GLOBAL: { label: '全球', color: 'purple' },
  JP: { label: '日本', color: 'magenta' },
  KR: { label: '韩国', color: 'geekblue' },
  'US/EU': { label: '美欧', color: 'volcano' }
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '有效', color: 'success' },
  inactive: { label: '失效', color: 'default' }
};

const CeExportControlPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [filters, setFilters] = useState({ control_type: '', control_region: '', restriction_level: '', keyword: '' });
  const [stats, setStats] = useState<any>({ total: 0, prohibited: 0, restricted: 0, warning: 0, expiring: 0, overdue: 0 });
  const [byRegion, setByRegion] = useState<any[]>([]);
  const [options, setOptions] = useState<any>({ control_types: [], restriction_levels: [], regions: [] });
  const [editingItem, setEditingItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [form] = Form.useForm();
  const [checking, setChecking] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState<'file' | 'web'>('file');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await ceComplianceApi.getExportControls({
        ...filters, page: pagination.current, page_size: pagination.pageSize
      });
      setData(res.list || []);
      setTotal(res.total || 0);
      setStats(res.stats || { total: 0, prohibited: 0, restricted: 0, warning: 0, expiring: 0 });
      setByRegion(res.by_region || []);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize, message]);

  useEffect(() => {
    ceComplianceApi.getControlOptions().then((res: any) => setOptions(res || {}));
    ceComplianceApi.getComplianceStatus().then((res: any) => {
      setComplianceStatus(res);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ control_type: 'brand', control_region: 'US', restriction_level: 'warning', status: 'active', sort_order: 0 });
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingItem(record);
    const values = { ...record };
    if (values.effective_date) values.effective_date = dayjs(values.effective_date);
    if (values.expiry_date) values.expiry_date = dayjs(values.expiry_date);
    form.setFieldsValue(values);
    setModalVisible(true);
  };

  const handleView = (record: any) => {
    setDetailItem(record);
    setDetailVisible(true);
  };

  const handleDelete = (id: number) => {
    modal.confirm({
      title: '确认删除该管控项?',
      content: '删除后无法恢复',
      onOk: async () => {
        try {
          await ceComplianceApi.deleteExportControl(id);
          message.success('删除成功');
          fetchData();
        } catch (e: any) { message.error(e?.message || '删除失败'); }
      }
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = { ...values };
      if (payload.effective_date && dayjs.isDayjs(payload.effective_date)) {
        payload.effective_date = payload.effective_date.format('YYYY-MM-DD');
      }
      if (payload.expiry_date && dayjs.isDayjs(payload.expiry_date)) {
        payload.expiry_date = payload.expiry_date.format('YYYY-MM-DD');
      }
      if (editingItem) {
        await ceComplianceApi.updateExportControl(editingItem.id, payload);
        message.success('更新成功');
      } else {
        await ceComplianceApi.createExportControl(payload);
        message.success('新增成功');
      }
      setModalVisible(false);
      fetchData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    }
  };

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      await ceComplianceApi.checkControlUpdates();
      message.success('管控清单核查时间已更新。注：联网自动更新需配置外部数据源，当前为手动核查标记。建议定期对照BIS Entity List、OFAC SDN List、ECHA SVHC等官方源手动更新。');
      fetchData();
    } catch (e: any) {
      message.error(e?.message || '检查失败');
    } finally { setChecking(false); }
  };

  const getFileIcon = (type?: string, name?: string) => {
    const n = (name || '').toLowerCase();
    if (type?.includes('pdf') || n.endsWith('.pdf')) return <FilePdfOutlined style={{ color: '#f5222d', fontSize: 16 }} />;
    if (type?.includes('word') || /\.(doc|docx)$/.test(n)) return <FileWordOutlined style={{ color: '#1890ff', fontSize: 16 }} />;
    if (type?.includes('excel') || /\.(xls|xlsx)$/.test(n)) return <FileExcelOutlined style={{ color: '#52c41a', fontSize: 16 }} />;
    if (type?.includes('image') || /\.(jpg|jpeg|png|gif|bmp|webp)$/.test(n)) return <FileImageOutlined style={{ color: '#722ed1', fontSize: 16 }} />;
    if (/\.(zip|rar|7z)$/.test(n)) return <FileZipOutlined style={{ color: '#fa8c16', fontSize: 16 }} />;
    if (type?.includes('text') || n.endsWith('.txt')) return <FileTextOutlined style={{ color: '#8c8c8c', fontSize: 16 }} />;
    return <FileOutlined style={{ color: '#595959', fontSize: 16 }} />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const isPreviewable = (type?: string, name?: string) => {
    const n = (name || '').toLowerCase();
    return !!(type?.includes('pdf') || n.endsWith('.pdf') || type?.includes('image') ||
      /\.(jpg|jpeg|png|gif|bmp|webp)$/.test(n));
  };

  const openPreview = (title: string, url: string, type: 'file' | 'web' = 'file') => {
    setPreviewTitle(title);
    setPreviewUrl(url);
    setPreviewType(type);
    setPreviewVisible(true);
  };

  const handleAttachmentUpload = async (id: number, file: File) => {
    setUploading(true);
    try {
      await ceComplianceApi.uploadControlAttachment(id, file);
      message.success('文件上传成功');
      const updated = await ceComplianceApi.getExportControl(id);
      setDetailItem(updated);
      fetchData();
    } catch (e: any) {
      message.error(e?.message || '上传失败');
      throw e;
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (id: number) => {
    try {
      await ceComplianceApi.deleteControlAttachment(id);
      message.success('附件已删除');
      const updated = await ceComplianceApi.getExportControl(id);
      setDetailItem(updated);
      fetchData();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const columns = [
    { title: '级别', dataIndex: 'restriction_level', key: 'restriction_level', width: 90,
      render: (v: string) => {
        const info = RESTRICTION_LEVEL[v];
        return <Tag color={info?.color} icon={info?.icon}>{info?.label || v}</Tag>;
      }
    },
    { title: '类型', dataIndex: 'control_type', key: 'control_type', width: 100,
      render: (v: string) => <Tag color={CONTROL_TYPE_COLORS[v]}>{CONTROL_TYPE_MAP[v] || v}</Tag>
    },
    { title: '管控地区', dataIndex: 'control_region', key: 'control_region', width: 90,
      render: (v: string) => <Tag color={REGION_MAP[v]?.color || 'default'}>{REGION_MAP[v]?.label || v}</Tag>
    },
    { title: '品牌/物料名称', key: 'name', width: 220, ellipsis: true,
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          {r.control_type === 'brand' ? (
            <>
              <Text strong>{r.brand}</Text>
              {r.manufacturer && <Text type="secondary" style={{ fontSize: 12 }}>{r.manufacturer}</Text>}
            </>
          ) : (
            <>
              <Text strong>{r.part_name}</Text>
              {r.part_code && <Text type="secondary" style={{ fontSize: 12 }}>编码: {r.part_code}</Text>}
              {r.brand && <Text type="secondary" style={{ fontSize: 12 }}>品牌: {r.brand}</Text>}
            </>
          )}
        </Space>
      )
    },
    { title: '管控清单/依据', dataIndex: 'control_list', key: 'control_list', ellipsis: true, width: 180 },
    { title: '管控原因', dataIndex: 'reason', key: 'reason', ellipsis: true, width: 220,
      render: (v: string) => <Text type="secondary">{v}</Text>
    },
    { title: '替代建议', dataIndex: 'alternative_suggestion', key: 'alternative_suggestion', ellipsis: true, width: 160 },
    { title: '有效期', key: 'validity', width: 150, align: 'center' as const,
      render: (_: any, r: any) => {
        let label = '长期有效';
        let color = 'default';
        let icon: any = <CheckCircleOutlined />;
        if (r.expiry_date) {
          label = `至 ${r.expiry_date}`;
          if (r.validity_status === 'expired') { color = 'error'; icon = <ExclamationCircleOutlined />; }
          else if (r.validity_status === 'expiring') { color = 'warning'; icon = <ExclamationCircleOutlined />; }
          else { color = 'success'; }
        }
        if (r.validity_status === 'pending') { label = r.validity_label; color = 'processing'; icon = <ClockCircleOutlined />; }
        return (
          <Tooltip title={r.expiry_date ? `数据源标注到期日: ${r.expiry_date}${r.days_to_expiry !== undefined && r.days_to_expiry >= 0 ? `，剩余${r.days_to_expiry}天` : r.days_to_expiry !== undefined ? `，已过期${-r.days_to_expiry}天` : ''}` : '无明确到期日期，标注为长期有效'}>
            <Tag color={color} icon={icon} style={{ margin: 0 }}>{label}</Tag>
          </Tooltip>
        );
      }
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => <Badge status={STATUS_MAP[v]?.color as any} text={STATUS_MAP[v]?.label || v} />
    },
    { title: '数据来源', key: 'source', width: 140,
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          {r.source_code ? (
            <Tooltip title={`数据源编码: ${r.source_code}`}>
              <Tag icon={<ApiOutlined />} color="blue" style={{ margin: 0, fontSize: 11 }}>
                {r.source_code.replace(/_/g, ' ').substring(0, 12)}
              </Tag>
            </Tooltip>
          ) : (
            <Text type="secondary" style={{ fontSize: 11 }}>手动录入</Text>
          )}
          {r.source_updated_at && (
            <Text type="secondary" style={{ fontSize: 10 }}>核查: {r.source_updated_at.split(' ')[0]}</Text>
          )}
          {!r.source_updated_at && r.last_checked_at && (
            <Text type="secondary" style={{ fontSize: 10 }}>核查: {r.last_checked_at.split(' ')[0]}</Text>
          )}
        </Space>
      )
    },
    { title: '附件', key: 'attachment', width: 65, align: 'center' as const,
      render: (_: any, r: any) => {
        const hasFile = r.attachment_path && r.attachment_name;
        const hasUrl = !!r.source_url;
        if (!hasFile && !hasUrl) return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
        return (
          <Space size={2}>
            {hasFile && (
              <Tooltip title={`依据文件: ${r.attachment_name}`}>
                <Button type="link" size="small" icon={getFileIcon(r.attachment_type, r.attachment_name)}
                  onClick={() => openPreview(r.attachment_name, `/uploads/${r.attachment_path}`, 'file')}
                  style={{ padding: '0 2px' }} />
              </Tooltip>
            )}
            {hasUrl && (
              <Tooltip title="官网在线预览">
                <Button type="link" size="small" icon={<GlobalOutlined />}
                  onClick={() => openPreview(`${r.control_list || '管控依据'} - 官方原文`, r.source_url, 'web')}
                  style={{ padding: '0 2px' }} />
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Tooltip title="查看详情"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(r)} /></Tooltip>
          <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} /></Tooltip>
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 'var(--page-padding)' }}>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}><AlertOutlined /> 进出口物料/品牌管控核查清单</Title>
            <Text type="secondary">涉及物料进出口管制的品牌（实体清单）、敏感物料/技术（EAR/REACH/RoHS/冲突矿产/制裁等）核查清单</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} loading={checking} onClick={handleCheckUpdates}>检查更新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增管控项</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Alert
        message="使用说明"
        description="本清单用于出口设备物料合规核查：① 美国BIS实体清单品牌（如华为/海康等）对美出口受限；② REACH/RoHS限制物质超标物料不得进入欧盟/中国市场；③ 受制裁国家来源物料全面禁止；④ 锂电池/无线模块/压力容器等需符合目标市场认证要求。建议结合项目BOM逐项核查。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="管控项总数" value={stats.total} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="禁止类(红)" value={stats.prohibited} valueStyle={{ color: '#f5222d' }} prefix={<StopOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="限制/警示类" value={(stats.restricted || 0) + (stats.warning || 0)} valueStyle={{ color: '#fa8c16' }} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="已过期待核查" value={stats.overdue || 0} valueStyle={{ color: '#ff4d4f' }} prefix={<CloseCircleOutlined />} /></Card></Col>
      </Row>
      {(stats.overdue > 0) && (
        <Alert
          message={`有 ${stats.overdue} 项管控已过数据源标注的到期日期，但状态仍为"有效"。请联网核查BIS/OFAC/ECHA等官方数据源确认管控状态是否变化，再手动更新`}
          type="warning" showIcon closable style={{ marginBottom: 16 }}
        />
      )}

      {complianceStatus && (
        <Alert
          style={{ marginBottom: 16 }}
          type={complianceStatus.sources?.failed > 0 ? 'warning' : 'info'}
          showIcon
          message={
            <Space wrap>
              <ApiOutlined />
              <Text strong>外部数据源状态</Text>
              <Tag color="blue">已配置 {complianceStatus.sources?.total || 0}</Tag>
              <Tag color="processing">已启用 {complianceStatus.sources?.enabled || 0}</Tag>
              <Tag color="success">正常 {complianceStatus.sources?.success || 0}</Tag>
              {complianceStatus.sources?.failed > 0 && <Tag color="error">失败 {complianceStatus.sources.failed}</Tag>}
              {complianceStatus.controls_last_check && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  管控清单最近核查: {complianceStatus.controls_last_check}
                </Text>
              )}
              {complianceStatus.last_run?.started_at && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  · 最近联网检查: {complianceStatus.last_run.started_at} ({complianceStatus.last_run.status === 'success' ? '成功' : complianceStatus.last_run.status})
                </Text>
              )}
              <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => navigate('/ce-data-sources')}>
                管理数据源 →
              </Button>
            </Space>
          }
        />
      )}

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select placeholder="管控类型" allowClear style={{ width: 130 }} value={filters.control_type || undefined}
            onChange={v => { setFilters(f => ({ ...f, control_type: v || '' })); setPagination(p => ({ ...p, current: 1 })); }}
            options={options.control_types} />
          <Select placeholder="管控地区" allowClear style={{ width: 130 }} value={filters.control_region || undefined}
            onChange={v => { setFilters(f => ({ ...f, control_region: v || '' })); setPagination(p => ({ ...p, current: 1 })); }}
            options={options.regions} />
          <Select placeholder="限制级别" allowClear style={{ width: 130 }} value={filters.restriction_level || undefined}
            onChange={v => { setFilters(f => ({ ...f, restriction_level: v || '' })); setPagination(p => ({ ...p, current: 1 })); }}
            options={options.restriction_levels?.map((r: any) => ({ value: r.value, label: <Tag color={r.color}>{r.label}</Tag> }))} />
          <Input placeholder="搜索品牌/物料/原因" allowClear style={{ width: 260 }} prefix={<SearchOutlined />}
            value={filters.keyword} onChange={e => { setFilters(f => ({ ...f, keyword: e.target.value })); setPagination(p => ({ ...p, current: 1 })); }} />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          bordered
          scroll={{ x: 1700 }}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total,
            showSizeChanger: true, showQuickJumper: true, showTotal: t => `共 ${t} 条`,
            onChange: (c, ps) => setPagination({ current: c, pageSize: ps })
          }}
          rowClassName={(r) => r.restriction_level === 'prohibited' ? 'table-row-danger' : ''}
        />
      </Card>

      <Modal title={editingItem ? '编辑管控项' : '新增管控项'} open={modalVisible}
        onOk={handleSave} onCancel={() => setModalVisible(false)} width={720} maskClosable={false}>
        <Form form={form} layout="vertical" initialValues={{ control_type: 'brand', control_region: 'US', restriction_level: 'warning', status: 'active', sort_order: 0 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="control_type" label="管控类型" rules={[{ required: true, message: '请选择类型' }]}>
                <Select options={options.control_types} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="control_region" label="管控地区" rules={[{ required: true }]}>
                <Select options={options.regions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="restriction_level" label="限制级别" rules={[{ required: true }]}>
                <Select options={options.restriction_levels?.map((r: any) => ({ value: r.value, label: <Tag color={r.color}>{r.label}</Tag> }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="brand" label="品牌"><Input placeholder="品牌名称（品牌管控时必填）" /></Form.Item></Col>
            <Col span={12}><Form.Item name="manufacturer" label="制造商/企业全称"><Input placeholder="企业全称" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="part_name" label="物料/技术名称"><Input placeholder="物料名称（物料管控时必填）" /></Form.Item></Col>
            <Col span={12}><Form.Item name="part_code" label="物料编码/HS编码"><Input placeholder="可选" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="control_list" label="管控清单/法规依据"><Input placeholder="如：BIS Entity List / REACH SVHC" /></Form.Item></Col>
            <Col span={12}><Form.Item name="eccn_code" label="ECCN编码"><Input placeholder="如适用" /></Form.Item></Col>
          </Row>
          <Form.Item name="reason" label="管控原因" rules={[{ required: true, message: '请输入管控原因' }]}>
            <TextArea rows={2} placeholder="详细说明管控原因、风险" />
          </Form.Item>
          <Form.Item name="alternative_suggestion" label="替代建议">
            <TextArea rows={2} placeholder="推荐的替代品牌/物料/合规建议" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="version" label="版本/版本号"><Input placeholder="如：2024年版" /></Form.Item></Col>
            <Col span={8}><Form.Item name="effective_date" label="生效日期"><DatePicker style={{ width: '100%' }} placeholder="选择生效日期" format="YYYY-MM-DD" /></Form.Item></Col>
            <Col span={8}><Form.Item name="expiry_date" label="失效日期"><DatePicker style={{ width: '100%' }} placeholder="如长期有效可不填" format="YYYY-MM-DD" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="source" label="信息来源"><Input placeholder="如：美国商务部BIS" /></Form.Item></Col>
            <Col span={8}><Form.Item name="source_url" label="来源URL"><Input placeholder="官方链接" /></Form.Item></Col>
            <Col span={8}><Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={[{ value: 'active', label: '有效' }, { value: 'inactive', label: '失效' }]} />
            </Form.Item></Col>
          </Row>
          <Form.Item name="remarks" label="备注"><Input placeholder="备注" /></Form.Item>
        </Form>
      </Modal>

      <Drawer title="管控项详情" open={detailVisible} onClose={() => setDetailVisible(false)} width={680}>
        {detailItem && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Tag color={RESTRICTION_LEVEL[detailItem.restriction_level]?.color} icon={RESTRICTION_LEVEL[detailItem.restriction_level]?.icon} style={{ fontSize: 14, padding: '4px 12px' }}>
                {RESTRICTION_LEVEL[detailItem.restriction_level]?.label}级管控
              </Tag>
            </div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="管控类型"><Tag color={CONTROL_TYPE_COLORS[detailItem.control_type]}>{CONTROL_TYPE_MAP[detailItem.control_type]}</Tag></Descriptions.Item>
              <Descriptions.Item label="管控地区"><Tag color={REGION_MAP[detailItem.control_region]?.color}>{REGION_MAP[detailItem.control_region]?.label || detailItem.control_region}</Tag></Descriptions.Item>
              {detailItem.brand && <Descriptions.Item label="品牌">{detailItem.brand}</Descriptions.Item>}
              {detailItem.manufacturer && <Descriptions.Item label="制造商">{detailItem.manufacturer}</Descriptions.Item>}
              {detailItem.part_name && <Descriptions.Item label="物料名称">{detailItem.part_name}</Descriptions.Item>}
              {detailItem.part_code && <Descriptions.Item label="物料/HS编码">{detailItem.part_code}</Descriptions.Item>}
              {detailItem.eccn_code && <Descriptions.Item label="ECCN编码">{detailItem.eccn_code}</Descriptions.Item>}
              <Descriptions.Item label="管控清单/依据">{detailItem.control_list || '-'}</Descriptions.Item>
              <Descriptions.Item label="管控原因"><Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detailItem.reason || '-'}</Paragraph></Descriptions.Item>
              <Descriptions.Item label="替代建议"><Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#52c41a' }}>{detailItem.alternative_suggestion || '-'}</Paragraph></Descriptions.Item>
              <Descriptions.Item label="信息来源">{detailItem.source || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态"><Badge status={STATUS_MAP[detailItem.status]?.color as any} text={STATUS_MAP[detailItem.status]?.label} /></Descriptions.Item>
              <Descriptions.Item label="最近核查">{detailItem.last_checked_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注">{detailItem.remarks || '-'}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="依据文件/原文预览" style={{ marginTop: 16 }}
              extra={
                <Space>
                  {detailItem.attachment_path && isPreviewable(detailItem.attachment_type, detailItem.attachment_name) && (
                    <Button type="link" size="small" icon={<EyeOutlined />}
                      onClick={() => openPreview(detailItem.attachment_name, `/uploads/${detailItem.attachment_path}`, 'file')}>
                      在线预览
                    </Button>
                  )}
                  {detailItem.attachment_path && (
                    <Button type="link" size="small" icon={<DownloadOutlined />}
                      href={`/uploads/${detailItem.attachment_path}`} target="_blank">下载</Button>
                  )}
                  {detailItem.source_url && (
                    <Button type="link" size="small" icon={<GlobalOutlined />}
                      onClick={() => openPreview(`${detailItem.control_list || '管控依据'} - 官方原文`, detailItem.source_url, 'web')}>
                      官网预览
                    </Button>
                  )}
                </Space>
              }>
              {detailItem.attachment_path ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                  {getFileIcon(detailItem.attachment_type, detailItem.attachment_name)}
                  <div style={{ flex: 1 }}>
                    <div><Text strong>{detailItem.attachment_name}</Text></div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatFileSize(detailItem.attachment_size)} · 上传于 {detailItem.updated_at || detailItem.created_at}
                    </Text>
                  </div>
                  <Popconfirm title="确认删除该附件?" onConfirm={() => handleDeleteAttachment(detailItem.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              ) : (
                <Upload
                  showUploadList={false}
                  beforeUpload={(file) => {
                    handleAttachmentUpload(detailItem.id, file);
                    return false;
                  }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar,.7z"
                >
                  <Button icon={<UploadOutlined />} loading={uploading} size="small">
                    上传依据文件
                  </Button>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    支持 PDF/Word/Excel/PPT/图片/压缩包，最大 50MB
                  </Text>
                </Upload>
              )}
              {detailItem.source_url && (
                <div style={{ marginTop: detailItem.attachment_path ? 12 : 0, paddingTop: detailItem.attachment_path ? 12 : 0, borderTop: detailItem.attachment_path ? '1px solid #f0f0f0' : 'none' }}>
                  <Space>
                    <GlobalOutlined style={{ color: '#1890ff' }} />
                    <a href={detailItem.source_url} target="_blank" rel="noreferrer">{detailItem.source_url}</a>
                  </Space>
                </div>
              )}
              {!detailItem.attachment_path && !detailItem.source_url && (
                <Text type="secondary">未上传依据文件，也未配置官方来源URL。编辑管控项可填写source_url，或在此处上传PDF/文档作为依据。</Text>
              )}
            </Card>
          </>
        )}
      </Drawer>

      <Modal
        title={previewTitle}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width="80%"
        style={{ top: 20, maxWidth: 1200 }}
        styles={{ body: { height: 'calc(100vh - 160px)', padding: 0 } }}
        footer={[
          previewType === 'web' && previewUrl && (
            <Button key="open" type="primary" icon={<LinkOutlined />}
              onClick={() => window.open(previewUrl, '_blank')}>
              新窗口打开
            </Button>
          ),
          previewType === 'file' && previewUrl && (
            <Button key="dl" icon={<DownloadOutlined />}
              onClick={() => window.open(previewUrl, '_blank')}>
              下载
            </Button>
          ),
          <Button key="close" onClick={() => setPreviewVisible(false)}>关闭</Button>
        ]}
      >
        {previewUrl && (
          previewType === 'file' ? (
            isPreviewable(detailItem?.attachment_type, previewUrl) || previewUrl.toLowerCase().includes('.pdf') || /\.(jpg|jpeg|png|gif|bmp|webp)(\?|$)/i.test(previewUrl) ? (
              <iframe
                src={previewUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={previewTitle}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 60 }}>
                {getFileIcon(detailItem?.attachment_type, previewUrl)}
                <div style={{ marginTop: 16 }}><Text strong>该文件类型不支持在线预览</Text></div>
                <div style={{ marginTop: 8 }}>
                  <Button type="primary" icon={<DownloadOutlined />}
                    onClick={() => window.open(previewUrl, '_blank')}>下载文件查看</Button>
                </div>
              </div>
            )
          ) : (
            <iframe
              src={previewUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={previewTitle}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          )
        )}
      </Modal>
    </div>
  );
};

export default CeExportControlPage;
