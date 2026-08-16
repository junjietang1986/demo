import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Select, Tag, Modal, Form,
  App, Row, Col, Statistic, Typography, Popconfirm, Drawer, Descriptions, Badge, Tooltip,
  Alert, Switch, Tabs, Timeline
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, EyeOutlined, ApiOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined, PlayCircleOutlined,
  LinkOutlined, PoweroffOutlined, HistoryOutlined, CloudSyncOutlined,
  GlobalOutlined, StopOutlined
} from '@ant-design/icons';
import { ceComplianceApi } from '@/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const TARGET_TABLE_MAP: Record<string, { label: string; color: string }> = {
  regulations: { label: '国际法规清单', color: 'blue' },
  export_controls: { label: '进出口管控清单', color: 'orange' }
};

const SOURCE_TYPE_MAP: Record<string, string> = {
  http_check: 'HTTP可用性检查',
  rss: 'RSS订阅',
  csv: 'CSV下载',
  json: 'JSON API',
  html: 'HTML页面解析'
};

const PARSER_TYPE_MAP: Record<string, string> = {
  status_check: '状态检查(GET)',
  last_modified: 'Last-Modified头',
  rss_items: 'RSS条目提取',
  csv_rows: 'CSV行解析',
  json_items: 'JSON数组解析'
};

const INTERVAL_OPTIONS = [
  { value: 6, label: '每6小时' },
  { value: 12, label: '每12小时' },
  { value: 24, label: '每天' },
  { value: 72, label: '每3天' },
  { value: 168, label: '每周(推荐)' },
  { value: 720, label: '每月' }
];

const CeDataSourcesPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, enabled: 0, success: 0, failed: 0, never_checked: 0 });
  const [filters, setFilters] = useState({ enabled: '', target_table: '', keyword: '' });
  const [options, setOptions] = useState<any>({ source_types: [], parser_types: [], target_tables: [], intervals: [] });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [detailLogs, setDetailLogs] = useState<any[]>([]);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await ceComplianceApi.getDataSources(filters);
      setData(res.list || []);
      setStats(res.stats || {});
      setOptions(res.options || {});
      setRecentLogs(res.recent_logs || []);
    } catch (e: any) {
      message.error(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCheck = async (id: number) => {
    setCheckingId(id);
    try {
      const res: any = await ceComplianceApi.checkDataSource(id);
      message.success(res?.summary || '检查完成');
    } catch (e: any) {
      message.error(e?.message || '检查失败');
    } finally {
      setCheckingId(null);
      loadData();
    }
  };

  const handleCheckAll = async () => {
    setCheckingAll(true);
    try {
      const res: any = await ceComplianceApi.checkAllDataSources();
      modal.success({
        title: '批量检查完成',
        content: `成功 ${res?.success || 0}/${res?.total || 0}，失败 ${res?.failed || 0}`,
      });
    } catch (e: any) {
      message.error(e?.message || '批量检查失败');
    } finally {
      setCheckingAll(false);
      loadData();
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await ceComplianceApi.toggleDataSource(id);
      message.success('操作成功');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await ceComplianceApi.deleteDataSource(id);
      message.success('已删除');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const openEdit = (item?: any) => {
    setEditingItem(item || null);
    form.resetFields();
    if (item) {
      form.setFieldsValue({
        ...item,
        headers: item.headers ? (typeof item.headers === 'string' ? item.headers : JSON.stringify(item.headers, null, 2)) : '',
        parser_config: item.parser_config ? (typeof item.parser_config === 'string' ? item.parser_config : JSON.stringify(item.parser_config, null, 2)) : ''
      });
    } else {
      form.setFieldsValue({
        source_type: 'http_check', target_table: 'regulations', method: 'GET',
        parser_type: 'status_check', enabled: 1, check_interval_hours: 168, timeout_ms: 15000, sort_order: 0
      });
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (values.headers) {
        try { JSON.parse(values.headers); } catch { throw new Error('请求头必须是合法JSON'); }
      }
      if (values.parser_config) {
        try { JSON.parse(values.parser_config); } catch { throw new Error('解析配置必须是合法JSON'); }
      }
      if (editingItem) {
        await ceComplianceApi.updateDataSource(editingItem.id, values);
      } else {
        await ceComplianceApi.createDataSource(values);
      }
      message.success(editingItem ? '已更新' : '已添加');
      setModalVisible(false);
      loadData();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e?.message || '保存失败');
    }
  };

  const openDetail = async (item: any) => {
    setDetailItem(item);
    setDetailVisible(true);
    try {
      const res: any = await ceComplianceApi.getDataSource(item.id);
      setDetailItem(res.source);
      setDetailLogs(res.logs || []);
    } catch (e: any) {
      message.error(e?.message || '加载详情失败');
    }
  };

  const renderStatus = (record: any) => {
    if (!record.enabled) return <Tag icon={<StopOutlined />} color="default">已禁用</Tag>;
    if (!record.last_check_at) return <Tag icon={<ClockCircleOutlined />} color="default">未检查</Tag>;
    if (record.last_check_status === 'success') return <Tag icon={<CheckCircleOutlined />} color="success">连接正常</Tag>;
    if (record.last_check_status === 'failed') return <Tag icon={<ExclamationCircleOutlined />} color="error">连接失败</Tag>;
    return <Tag color="processing">{record.last_check_status || '检查中'}</Tag>;
  };

  const columns = [
    { title: '#', dataIndex: 'sort_order', key: 'sort_order', width: 50 },
    {
      title: '数据源', key: 'source', width: 280,
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          <Space>
            <Text strong>{r.source_name}</Text>
            {r.enabled ? <Badge status="processing" /> : <Badge status="default" />}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.official_name || r.source_code}
          </Text>
          {r.description && (
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: r.description }}>
              {r.description}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: '类型/目标', key: 'type', width: 160,
      render: (_: any, r: any) => (
        <Space direction="vertical" size={2}>
          <Tag color="geekblue">{SOURCE_TYPE_MAP[r.source_type] || r.source_type}</Tag>
          <Tag color={TARGET_TABLE_MAP[r.target_table]?.color || 'default'}>
            {TARGET_TABLE_MAP[r.target_table]?.label || r.target_table}
          </Tag>
          {r.market && <Tag>{r.market}{r.category ? ` / ${r.category}` : ''}</Tag>}
        </Space>
      )
    },
    {
      title: 'URL', dataIndex: 'url', key: 'url', width: 260, ellipsis: true,
      render: (v: string) => (
        <a href={v} target="_blank" rel="noreferrer" title={v}>
          <LinkOutlined /> {v.length > 50 ? v.slice(0, 50) + '...' : v}
        </a>
      )
    },
    {
      title: '检查间隔', dataIndex: 'check_interval_hours', key: 'interval', width: 90,
      render: (v: number) => {
        const opt = INTERVAL_OPTIONS.find(o => o.value === v);
        return <Text type="secondary">{opt?.label || `${v}小时`}</Text>;
      }
    },
    {
      title: '状态', key: 'status', width: 130, render: (_: any, r: any) => renderStatus(r)
    },
    {
      title: '上次检查', key: 'last_check', width: 200,
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          {r.last_check_at ? (
            <>
              <Text style={{ fontSize: 12 }}>{r.last_check_at}</Text>
              {r.last_http_status && (
                <Text type={r.last_http_status >= 400 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
                  HTTP {r.last_http_status}
                </Text>
              )}
              {r.last_check_result && (
                <Tooltip title={r.last_check_result}>
                  <Text type="secondary" ellipsis style={{ fontSize: 11, maxWidth: 180, display: 'block' }}>
                    {r.last_check_result}
                  </Text>
                </Tooltip>
              )}
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>从未检查</Text>
          )}
        </Space>
      )
    },
    {
      title: '操作', key: 'action', width: 220, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Tooltip title="立即检查">
            <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />}
              loading={checkingId === r.id} onClick={() => handleCheck(r.id)}>
              检查
            </Button>
          </Tooltip>
          <Tooltip title={r.enabled ? '禁用' : '启用'}>
            <Button size="small" icon={<PoweroffOutlined />}
              onClick={() => handleToggle(r.id)} danger={r.enabled}>
              {r.enabled ? '禁用' : '启用'}
            </Button>
          </Tooltip>
          <Tooltip title="详情/历史">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm title="确定删除该数据源？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <ApiOutlined style={{ marginRight: 8 }} />外部法规数据源配置
          </Title>
          <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
            配置国际法规与进出口管制官方数据源，系统将按设定间隔自动联网核查法规最新状态。
            <Text strong style={{ color: '#fa8c16' }}>注意：不同国家/地区官方网站结构各异，系统默认执行"HTTP可达性+最后更新时间检查"，具体新规内容请以官方页面为准，法务/合规人员需复核。</Text>
          </Paragraph>
        </div>
        <Space>
          <Button icon={<CloudSyncOutlined spin={checkingAll} />} onClick={handleCheckAll} loading={checkingAll} type="primary">
            一键检查所有启用源
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => openEdit()}>新增数据源</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6} md={4} lg={4}>
          <Card size="small">
            <Statistic title="数据源总数" value={stats.total} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4} lg={4}>
          <Card size="small">
            <Statistic title="已启用" value={stats.enabled} valueStyle={{ color: '#1890ff' }} prefix={<PlayCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4} lg={4}>
          <Card size="small">
            <Statistic title="连接正常" value={stats.success} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4} lg={4}>
          <Card size="small">
            <Statistic title="连接失败" value={stats.failed} valueStyle={{ color: '#ff4d4f' }} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4} lg={4}>
          <Card size="small">
            <Statistic title="从未检查" value={stats.never_checked} valueStyle={{ color: '#999' }} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Alert
        message="自动检查说明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>系统启动后每小时扫描一次，按各数据源设定的"检查间隔"自动执行联网检查</li>
            <li>默认配置了欧盟(EUR-Lex/ECHA)、美国(BIS/OFAC/Federal Register)、UL/NFPA、中国(认监委/中国RoHS)等权威来源</li>
            <li>数据源检查为"状态可达性验证"：能访问即记录最后核查时间；若HTTP状态码异常/超时会标记为失败</li>
            <li>建议由合规人员定期手动核查关键法规的具体内容更新，系统仅做"可用性+元数据"层面的监测</li>
            <li>小流量官方站点/非英语站点已默认关闭，可手动启用</li>
          </ul>
        }
        type="info" showIcon style={{ marginBottom: 16 }}
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="启用状态" allowClear style={{ width: 130 }}
            value={filters.enabled || undefined}
            onChange={v => setFilters({ ...filters, enabled: v || '' })}
            options={[
              { value: '1', label: '已启用' },
              { value: '0', label: '已禁用' }
            ]}
          />
          <Select
            placeholder="目标清单" allowClear style={{ width: 160 }}
            value={filters.target_table || undefined}
            onChange={v => setFilters({ ...filters, target_table: v || '' })}
            options={options.target_tables}
          />
          <Input.Search
            placeholder="搜索名称/编码/URL" allowClear style={{ width: 280 }}
            defaultValue={filters.keyword}
            onSearch={v => setFilters({ ...filters, keyword: v })}
            enterButton={<SearchOutlined />}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </Card>

      <Card size="small">
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          bordered
          scroll={{ x: 1300 }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: t => `共 ${t} 个数据源` }}
        />
      </Card>

      {recentLogs.length > 0 && (
        <Card size="small" title={<Space><HistoryOutlined />最近检查日志</Space>} style={{ marginTop: 16 }}>
          <Timeline
            items={recentLogs.slice(0, 10).map((log: any) => ({
              color: log.status === 'success' ? 'green' : log.status === 'failed' ? 'red' : 'blue',
              children: (
                <div>
                  <Text strong>{log.source_name}</Text>
                  <Tag color={log.check_type === 'auto' ? 'blue' : 'purple'} style={{ marginLeft: 8 }}>
                    {log.check_type === 'auto' ? '自动' : '手动'}
                  </Tag>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{log.started_at}</Text>
                  {log.duration_ms && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{log.duration_ms}ms</Text>}
                  <div>
                    {log.status === 'success'
                      ? <Text type="success">✓ {log.response_summary || '成功'}</Text>
                      : <Text type="danger">✗ {log.error_message || log.response_summary || '失败'}</Text>}
                  </div>
                </div>
              )
            }))}
          />
        </Card>
      )}

      <Modal
        title={editingItem ? '编辑数据源' : '新增数据源'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={720}
        destroyOnHidden
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="数据源编码(英文唯一)" name="source_code" rules={[{ required: true, message: '请输入编码' }]}>
                <Input placeholder="例如：eu_ech_svhc" disabled={!!editingItem} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="数据源名称" name="source_name" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="如：ECHA SVHC高关注物质清单" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="官方机构名称" name="official_name">
                <Input placeholder="如：European Chemicals Agency" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="源类型" name="source_type">
                <Select options={options.source_types} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="解析方式" name="parser_type">
                <Select options={options.parser_types} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="URL地址" name="url" rules={[{ required: true, message: '请输入URL' }]}>
            <Input placeholder="https://..." prefix={<GlobalOutlined />} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="目标清单" name="target_table">
                <Select options={options.target_tables} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="市场" name="market">
                <Select allowClear placeholder="关联市场"
                  options={[
                    { value: 'EU', label: '欧盟' }, { value: 'NA', label: '北美' },
                    { value: 'US', label: '美国' }, { value: 'CN', label: '中国' },
                    { value: 'SEA', label: '东南亚' }, { value: 'JP', label: '日本' },
                    { value: 'KR', label: '韩国' }, { value: 'GLOBAL', label: '全球' },
                    { value: 'OTHER', label: '其他' }
                  ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="法规类别" name="category">
                <Input placeholder="如：ce/rohs/reach/ul..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="检查间隔" name="check_interval_hours">
                <Select options={INTERVAL_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="超时(ms)" name="timeout_ms">
                <Input type="number" min={3000} max={60000} step={1000} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="HTTP方法" name="method">
                <Select options={[{ value: 'GET', label: 'GET' }, { value: 'HEAD', label: 'HEAD' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="排序" name="sort_order">
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="启用" name="enabled" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="数据源说明，覆盖的法规范围等" />
          </Form.Item>
          <Form.Item label="自定义请求头(JSON，可选)" name="headers">
            <TextArea rows={2} placeholder='{"Authorization": "Bearer xxx"}' />
          </Form.Item>
          <Form.Item label="解析器配置(JSON，可选)" name="parser_config">
            <TextArea rows={2} placeholder='{"selector": "..."}' />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={<Space><ApiOutlined />{detailItem?.source_name}</Space>}
        open={detailVisible}
        width={640}
        onClose={() => setDetailVisible(false)}
      >
        {detailItem && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="编码">{detailItem.source_code}</Descriptions.Item>
              <Descriptions.Item label="官方机构">{detailItem.official_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="目标清单">
                <Tag color={TARGET_TABLE_MAP[detailItem.target_table]?.color}>
                  {TARGET_TABLE_MAP[detailItem.target_table]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="类型/解析">
                {SOURCE_TYPE_MAP[detailItem.source_type]} / {PARSER_TYPE_MAP[detailItem.parser_type]}
              </Descriptions.Item>
              <Descriptions.Item label="URL">
                <a href={detailItem.url} target="_blank" rel="noreferrer"><LinkOutlined /> {detailItem.url}</a>
              </Descriptions.Item>
              <Descriptions.Item label="检查间隔">{INTERVAL_OPTIONS.find(o => o.value === detailItem.check_interval_hours)?.label || `${detailItem.check_interval_hours}小时`}</Descriptions.Item>
              <Descriptions.Item label="状态">{renderStatus(detailItem)}</Descriptions.Item>
              <Descriptions.Item label="上次检查">
                {detailItem.last_check_at || '从未检查'}
                {detailItem.last_http_status && `（HTTP ${detailItem.last_http_status}）`}
              </Descriptions.Item>
              {detailItem.last_check_result && (
                <Descriptions.Item label="上次结果">
                  <Text type="secondary" style={{ fontSize: 12 }}>{detailItem.last_check_result}</Text>
                </Descriptions.Item>
              )}
              {detailItem.description && (
                <Descriptions.Item label="描述">{detailItem.description}</Descriptions.Item>
              )}
            </Descriptions>
            <Title level={5} style={{ marginTop: 24 }}><HistoryOutlined /> 检查历史（最近50条）</Title>
            <Timeline
              items={detailLogs.map((log: any) => ({
                color: log.status === 'success' ? 'green' : log.status === 'failed' ? 'red' : 'blue',
                children: (
                  <div style={{ fontSize: 13 }}>
                    <Tag color={log.check_type === 'auto' ? 'blue' : 'purple'}>
                      {log.check_type === 'auto' ? '自动' : '手动'}
                    </Tag>
                    <Text type="secondary">{log.started_at}</Text>
                    {log.duration_ms && <Text type="secondary"> · {log.duration_ms}ms</Text>}
                    {log.http_status && <Text type="secondary"> · HTTP {log.http_status}</Text>}
                    <div>
                      {log.status === 'success'
                        ? <Text type="success">✓ {log.response_summary}</Text>
                        : <Text type="danger">✗ {log.error_message || log.response_summary}</Text>}
                    </div>
                  </div>
                )
              }))}
            />
          </>
        )}
      </Drawer>
    </div>
  );
};

export default CeDataSourcesPage;
