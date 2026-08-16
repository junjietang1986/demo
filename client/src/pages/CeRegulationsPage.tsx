import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Select, Tag, Modal, Form,
  App, Row, Col, Statistic, Typography, Popconfirm, Drawer, Descriptions, Badge, Tooltip, Alert, Upload, DatePicker
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, EyeOutlined, GlobalOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, ApiOutlined, LinkOutlined,
  FilePdfOutlined, FileTextOutlined, FileWordOutlined, FileExcelOutlined,
  FileImageOutlined, FileZipOutlined, DownloadOutlined, UploadOutlined,
  FileOutlined, CloseCircleOutlined, StopOutlined
} from '@ant-design/icons';
import { ceComplianceApi } from '@/api';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const MARKET_MAP: Record<string, string> = {
  EU: '欧盟', NA: '北美(美/加)', CN: '中国', DE: '德国', SEA: '东南亚',
  JP: '日本', KR: '韩国', OTHER: '其他/英国'
};

const MARKET_COLORS: Record<string, string> = {
  EU: 'blue', NA: 'red', CN: 'red', DE: 'gold', SEA: 'green',
  JP: 'purple', KR: 'orange', OTHER: 'default'
};

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  ce: { label: 'CE认证', color: 'blue' },
  'EMC电磁兼容': { label: 'EMC电磁兼容', color: 'geekblue' },
  'LVD低电压': { label: 'LVD低电压', color: 'cyan' },
  'MD机械安全': { label: 'MD机械安全', color: 'processing' },
  safety: { label: '安全标准', color: 'gold' },
  rohs: { label: 'RoHS', color: 'green' },
  reach: { label: 'REACH', color: 'cyan' },
  ul: { label: 'UL/NFPA', color: 'orange' },
  fcc: { label: 'FCC', color: 'purple' },
  ccc: { label: 'CCC', color: 'red' },
  china: { label: '中国国标', color: 'volcano' },
  pse: { label: 'PSE', color: 'magenta' },
  kc: { label: 'KC', color: 'geekblue' }
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '有效', color: 'success' },
  inactive: { label: '失效', color: 'default' },
  draft: { label: '草案', color: 'warning' }
};

const CeRegulationsPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [filters, setFilters] = useState({ market: '', category: '', status: '', keyword: '' });
  const [stats, setStats] = useState<any>({ total: 0, active: 0, inactive: 0, expiring: 0, expired: 0, overdue: 0 });
  const [byMarket, setByMarket] = useState<any[]>([]);
  const [options, setOptions] = useState<any>({ markets: [], categories: [], statuses: [] });
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
      const res: any = await ceComplianceApi.getRegulations({
        ...filters, page: pagination.current, page_size: pagination.pageSize
      });
      setData(res.list || []);
      setTotal(res.total || 0);
      setStats(res.stats || { total: 0, active: 0, inactive: 0, expiring: 0, expired: 0 });
      setByMarket(res.by_market || []);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize, message]);

  useEffect(() => {
    ceComplianceApi.getRegulationOptions().then((res: any) => setOptions(res || {}));
    ceComplianceApi.getComplianceStatus().then((res: any) => {
      setComplianceStatus(res);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ market: 'EU', category: 'ce', status: 'active', sort_order: 0 });
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
      title: '确认删除该法规条目?',
      content: '删除后无法恢复',
      onOk: async () => {
        try {
          await ceComplianceApi.deleteRegulation(id);
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
        await ceComplianceApi.updateRegulation(editingItem.id, payload);
        message.success('更新成功');
      } else {
        await ceComplianceApi.createRegulation(payload);
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
      await ceComplianceApi.checkRegulationUpdates();
      message.success('法规清单核查时间已更新。建议在"法规数据源配置"中启用外部数据源以实现自动联网核查。');
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
      await ceComplianceApi.uploadRegulationAttachment(id, file);
      message.success('文件上传成功');
      const updated = await ceComplianceApi.getRegulation(id);
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
      await ceComplianceApi.deleteRegulationAttachment(id);
      message.success('附件已删除');
      const updated = await ceComplianceApi.getRegulation(id);
      setDetailItem(updated);
      fetchData();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const columns = [
    { title: '市场', dataIndex: 'market', key: 'market', width: 70,
      render: (v: string) => <Tag color={MARKET_COLORS[v] || 'default'}>{MARKET_MAP[v] || v}</Tag>
    },
    { title: '类别', dataIndex: 'category', key: 'category', width: 100,
      render: (v: string) => <Tag color={CATEGORY_MAP[v]?.color || 'default'}>{CATEGORY_MAP[v]?.label || v}</Tag>
    },
    { title: '标准编号', dataIndex: 'regulation_code', key: 'regulation_code', width: 170,
      render: (v: string, r: any) => (
        <Space direction="vertical" size={0}>
          <Text strong copyable={{ text: v }}>{v}</Text>
          {r.directive_no && r.directive_no !== v && <Text type="secondary" style={{ fontSize: 11 }}>属: {r.directive_no}</Text>}
        </Space>
      )
    },
    { title: '法规/标准名称', dataIndex: 'regulation_name', key: 'regulation_name', width: 280, ellipsis: true,
      render: (v: string) => <Text>{v}</Text>
    },
    { title: '有效期', key: 'validity', width: 160, align: 'center' as const,
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
          <Tooltip title={r.expiry_date ? `数据来源标注到期日: ${r.expiry_date}${r.days_to_expiry !== undefined && r.days_to_expiry >= 0 ? `，剩余${r.days_to_expiry}天` : r.days_to_expiry !== undefined ? `，已过期${-r.days_to_expiry}天` : ''}` : '无明确到期日期，标注为长期有效'}>
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
              <Tooltip title={`标准文件: ${r.attachment_name}`}>
                <Button type="link" size="small" icon={getFileIcon(r.attachment_type, r.attachment_name)}
                  onClick={() => openPreview(r.attachment_name, `/uploads/${r.attachment_path}`, 'file')}
                  style={{ padding: '0 2px' }} />
              </Tooltip>
            )}
            {hasUrl && (
              <Tooltip title="官网在线预览">
                <Button type="link" size="small" icon={<GlobalOutlined />}
                  onClick={() => openPreview(`${r.regulation_name} - 官方原文`, r.source_url, 'web')}
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
            <Title level={4} style={{ margin: 0 }}><GlobalOutlined /> 国际项目法律法规核查清单</Title>
            <Text type="secondary">涵盖欧盟CE/RoHS/REACH、北美UL/NFPA/FCC、中国CCC、东南亚及日韩等市场出口法规指令</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} loading={checking} onClick={handleCheckUpdates}>检查更新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增法规</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="法规总数" value={stats.total} prefix={<GlobalOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="状态为有效" value={stats.active} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="即将到期(90天内)" value={stats.expiring || 0} valueStyle={{ color: '#faad14' }} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="已过期待核查" value={stats.overdue || 0} valueStyle={{ color: '#ff4d4f' }} prefix={<CloseCircleOutlined />} /></Card></Col>
      </Row>
      {(stats.overdue > 0) && (
        <Alert
          message={`有 ${stats.overdue} 条法规已过数据源标注的到期日期，但状态仍为"有效"。请联网核查官方数据源确认法规是否已被废止或延期，再手动更新状态`}
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
              {complianceStatus.regulations_last_check && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  法规最近核查: {complianceStatus.regulations_last_check}
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
          <Select placeholder="选择市场" allowClear style={{ width: 140 }} value={filters.market || undefined}
            onChange={v => { setFilters(f => ({ ...f, market: v || '' })); setPagination(p => ({ ...p, current: 1 })); }}
            options={options.markets} />
          <Select placeholder="选择类别" allowClear style={{ width: 140 }} value={filters.category || undefined}
            onChange={v => { setFilters(f => ({ ...f, category: v || '' })); setPagination(p => ({ ...p, current: 1 })); }}
            options={options.categories} />
          <Select placeholder="选择状态" allowClear style={{ width: 120 }} value={filters.status || undefined}
            onChange={v => { setFilters(f => ({ ...f, status: v || '' })); setPagination(p => ({ ...p, current: 1 })); }}
            options={options.statuses} />
          <Input placeholder="搜索法规/指令/编号" allowClear style={{ width: 240 }} prefix={<SearchOutlined />}
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
          scroll={{ x: 1500 }}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total,
            showSizeChanger: true, showQuickJumper: true, showTotal: t => `共 ${t} 条`,
            onChange: (c, ps) => setPagination({ current: c, pageSize: ps })
          }}
        />
      </Card>

      <Modal title={editingItem ? '编辑法规/指令' : '新增法规/指令'} open={modalVisible}
        onOk={handleSave} onCancel={() => setModalVisible(false)} width={720} maskClosable={false}>
        <Form form={form} layout="vertical" initialValues={{ market: 'EU', category: 'ce', status: 'active', sort_order: 0 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="market" label="目标市场" rules={[{ required: true, message: '请选择市场' }]}>
                <Select options={options.markets} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="法规类别" rules={[{ required: true, message: '请选择类别' }]}>
                <Select options={options.categories} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                <Select options={options.statuses} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="regulation_name" label="法规名称(中文)" rules={[{ required: true, message: '请输入法规名称' }]}>
            <Input placeholder="如：机械指令" />
          </Form.Item>
          <Form.Item name="directive_name" label="指令英文名">
            <Input placeholder="如：Machinery Directive" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="directive_no" label="指令编号"><Input placeholder="如：2006/42/EC" /></Form.Item></Col>
            <Col span={8}><Form.Item name="version" label="版本"><Input placeholder="如：2006/42/EC" /></Form.Item></Col>
            <Col span={8}><Form.Item name="regulation_code" label="法规代码"><Input placeholder="可选" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="effective_date" label="生效日期"><DatePicker style={{ width: '100%' }} placeholder="选择生效日期" format="YYYY-MM-DD" /></Form.Item></Col>
            <Col span={8}><Form.Item name="expiry_date" label="失效日期"><DatePicker style={{ width: '100%' }} placeholder="如长期有效可不填" format="YYYY-MM-DD" /></Form.Item></Col>
            <Col span={8}><Form.Item name="sort_order" label="排序号"><Input type="number" /></Form.Item></Col>
          </Row>
          <Form.Item name="scope" label="适用范围"><TextArea rows={2} placeholder="法规适用的产品范围" /></Form.Item>
          <Form.Item name="key_requirements" label="关键合规要求"><TextArea rows={2} placeholder="主要合规要求要点" /></Form.Item>
          <Form.Item name="applicable_products" label="适用产品"><TextArea rows={2} placeholder="适用于哪些产品/设备" /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="source_url" label="来源URL"><Input placeholder="官方来源链接" /></Form.Item></Col>
            <Col span={12}><Form.Item name="remarks" label="备注"><Input placeholder="备注" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Drawer title="法规详情" open={detailVisible} onClose={() => setDetailVisible(false)} width={680}>
        {detailItem && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="目标市场"><Tag color={MARKET_COLORS[detailItem.market]}>{MARKET_MAP[detailItem.market]}</Tag></Descriptions.Item>
              <Descriptions.Item label="法规类别"><Tag color={CATEGORY_MAP[detailItem.category]?.color}>{CATEGORY_MAP[detailItem.category]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="法规名称(中文)"><Text strong>{detailItem.regulation_name}</Text></Descriptions.Item>
              <Descriptions.Item label="指令英文名">{detailItem.directive_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="指令编号">{detailItem.directive_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="版本">{detailItem.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="生效日期">{detailItem.effective_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="失效日期">{detailItem.expiry_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态"><Badge status={STATUS_MAP[detailItem.status]?.color as any} text={STATUS_MAP[detailItem.status]?.label} /></Descriptions.Item>
              <Descriptions.Item label="适用范围">{detailItem.scope || '-'}</Descriptions.Item>
              <Descriptions.Item label="关键要求"><Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detailItem.key_requirements || '-'}</Paragraph></Descriptions.Item>
              <Descriptions.Item label="适用产品">{detailItem.applicable_products || '-'}</Descriptions.Item>
              <Descriptions.Item label="最近核查">{detailItem.last_checked_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注">{detailItem.remarks || '-'}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="标准文件/原文预览" style={{ marginTop: 16 }}
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
                      onClick={() => openPreview(`${detailItem.regulation_name} - 官方原文`, detailItem.source_url, 'web')}>
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
                    上传标准文件
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
                <Text type="secondary">未上传标准文件，也未配置官方来源URL。编辑法规可填写source_url，或在此处上传PDF/文档。</Text>
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

export default CeRegulationsPage;
