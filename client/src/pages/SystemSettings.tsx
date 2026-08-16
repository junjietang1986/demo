import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Descriptions, Tag, Typography, Space, Spin, Button, App, Statistic, Alert,
  Table, Input, Form, Popconfirm, Tabs, Badge
} from 'antd';
import {
  DatabaseOutlined, CloudServerOutlined, HddOutlined, ReloadOutlined, CheckCircleOutlined,
  CloseCircleOutlined, TableOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined,
  CloseOutlined, SearchOutlined, KeyOutlined
} from '@ant-design/icons';
import { settingsApi } from '@/api';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

interface DatabaseConfig {
  database: {
    type: string;
    path: string;
    filename: string;
    size_bytes: number;
    size_mb: string;
    created_at: string | null;
    modified_at: string | null;
    exists: boolean;
  };
  connection: {
    client: string;
    mode: string;
    journal_mode: string;
    foreign_keys: string;
    busy_timeout: number;
  };
  server: {
    platform: string;
    arch: string;
    node_version: string;
    uptime_hours: string;
    memory_usage_mb: string;
    total_memory_gb: string;
    free_memory_gb: string;
    cpus: number;
    hostname: string;
  };
  storage: {
    uploads_dir: string;
    data_dir: string;
  };
  tables: {
    count: number;
    list: string[];
  };
}

interface TableStats {
  table_stats: Array<{ name: string; count: number }>;
  total_records: number;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface TableSchema {
  columns: ColumnInfo[];
  foreign_keys: any[];
}

interface TableData {
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const SystemSettingsPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dbConfig, setDbConfig] = useState<DatabaseConfig | null>(null);
  const [tableStats, setTableStats] = useState<TableStats | null>(null);

  const [activeTab, setActiveTab] = useState('info');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize, setDataPageSize] = useState(50);
  const [dataSearch, setDataSearch] = useState('');
  const [editingRow, setEditingRow] = useState<any>(null);
  const [editingKey, setEditingKey] = useState<string | number | null>(null);
  const [isNewRow, setIsNewRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, statsRes] = await Promise.all([
        settingsApi.getDatabaseConfig(),
        settingsApi.getTableStats().catch(() => null)
      ]);
      setDbConfig(configRes as unknown as DatabaseConfig);
      if (statsRes) setTableStats(statsRes as unknown as TableStats);
    } catch (err: any) {
      message.error(err.message || '获取系统配置失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
      if (selectedTable) {
        await loadTableData(selectedTable, dataPage, dataPageSize, dataSearch);
      }
      message.success('配置信息已刷新');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const getPlatformIcon = (platform: string) => {
    if (platform.includes('win')) return '🪟';
    if (platform.includes('linux')) return '🐧';
    if (platform.includes('darwin')) return '🍎';
    return '💻';
  };

  const loadTableSchema = useCallback(async (tableName: string) => {
    try {
      const schema = await settingsApi.getTableSchema(tableName) as unknown as TableSchema;
      setTableSchema(schema);
      return schema;
    } catch (err: any) {
      message.error(err.message || '获取表结构失败');
      return null;
    }
  }, [message]);

  const loadTableData = useCallback(async (tableName: string, page = 1, pageSize = 50, search = '') => {
    setDataLoading(true);
    try {
      const data = await settingsApi.getTableData(tableName, { page, pageSize, search }) as unknown as TableData;
      setTableData(data);
      setDataPage(page);
      setDataPageSize(pageSize);
      setDataSearch(search);
    } catch (err: any) {
      message.error(err.message || '获取表数据失败');
    } finally {
      setDataLoading(false);
    }
  }, [message]);

  const handleSelectTable = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setEditingRow(null);
    setEditingKey(null);
    setIsNewRow(false);
    setTableData(null);
    setTableSchema(null);
    setDataPage(1);
    setDataSearch('');
    await loadTableSchema(tableName);
    await loadTableData(tableName, 1, 50, '');
  }, [loadTableSchema, loadTableData]);

  const handleEditRow = (record: any) => {
    if (!tableSchema) return;
    const pkCol = tableSchema.columns.find(c => c.pk === 1);
    if (!pkCol) {
      message.warning('该表没有主键，无法编辑');
      return;
    }
    setEditingRow({ ...record });
    setEditingKey(record[pkCol.name]);
    setIsNewRow(false);
    const formValues: any = {};
    tableSchema.columns.forEach(col => {
      formValues[col.name] = record[col.name];
    });
    form.setFieldsValue(formValues);
  };

  const handleAddRow = () => {
    if (!tableSchema) return;
    const newRow: any = {};
    tableSchema.columns.forEach(col => {
      if (col.pk !== 1) {
        newRow[col.name] = col.dflt_value !== null ? col.dflt_value : '';
      }
    });
    setEditingRow(newRow);
    setEditingKey('new');
    setIsNewRow(true);
    form.setFieldsValue(newRow);
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditingKey(null);
    setIsNewRow(false);
    form.resetFields();
  };

  const handleSaveRow = async () => {
    if (!tableSchema || !selectedTable) return;
    const pkCol = tableSchema.columns.find(c => c.pk === 1);
    if (!pkCol && !isNewRow) {
      message.warning('该表没有主键，无法保存');
      return;
    }

    try {
      const values = await form.validateFields();
      setSaving(true);

      const processedValues: any = {};
      tableSchema.columns.forEach(col => {
        if (values.hasOwnProperty(col.name)) {
          let v = values[col.name];
          if (v === '' || v === undefined || v === null) {
            if (col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('real') || col.type.toLowerCase().includes('float') || col.type.toLowerCase().includes('numeric')) {
              v = null;
            } else {
              v = null;
            }
          }
          processedValues[col.name] = v;
        }
      });

      if (isNewRow) {
        await settingsApi.insertTableData(selectedTable, processedValues);
        message.success('新增成功');
      } else {
        await settingsApi.updateTableData(selectedTable, editingKey!, processedValues);
        message.success('保存成功');
      }

      handleCancelEdit();
      await loadTableData(selectedTable, dataPage, dataPageSize, dataSearch);
    } catch (err: any) {
      if (err.errorFields) {
        return;
      }
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRow = async (record: any) => {
    if (!tableSchema || !selectedTable) return;
    const pkCol = tableSchema.columns.find(c => c.pk === 1);
    if (!pkCol) {
      message.warning('该表没有主键，无法删除');
      return;
    }
    try {
      await settingsApi.deleteTableData(selectedTable, record[pkCol.name]);
      message.success('删除成功');
      await loadTableData(selectedTable, dataPage, dataPageSize, dataSearch);
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleSearch = (value: string) => {
    if (selectedTable) {
      loadTableData(selectedTable, 1, dataPageSize, value);
    }
  };

  const renderValue = (value: any) => {
    if (value === null || value === undefined) {
      return <Text type="secondary" italic>NULL</Text>;
    }
    if (typeof value === 'boolean') {
      return <Tag color={value ? 'green' : 'red'}>{value ? 'true' : 'false'}</Tag>;
    }
    const strValue = String(value);
    if (strValue.length > 100) {
      return (
        <Text ellipsis={{ tooltip: strValue }} style={{ maxWidth: 200 }}>
          {strValue}
        </Text>
      );
    }
    if (strValue.includes('datetime') || /^\d{4}-\d{2}-\d{2}/.test(strValue)) {
      return strValue;
    }
    return strValue;
  };

  const getFormInputType = (col: ColumnInfo) => {
    const typeLower = col.type.toLowerCase();
    if (typeLower.includes('int') || typeLower.includes('real') || typeLower.includes('float') || typeLower.includes('numeric') || typeLower.includes('double')) {
      return 'number';
    }
    return 'text';
  };

  const tableColumns = tableSchema ? [
    ...tableSchema.columns.map(col => ({
      title: (
        <Space size={4}>
          {col.pk === 1 && <KeyOutlined style={{ color: '#faad14' }} />}
          <span>{col.name}</span>
          <Tag color="blue" style={{ fontSize: 10 }}>{col.type}</Tag>
          {col.notnull === 1 && <Tag color="red" style={{ fontSize: 10 }}>NOT NULL</Tag>}
        </Space>
      ),
      dataIndex: col.name,
      key: col.name,
      width: Math.max(120, Math.min(300, col.name.length * 12 + 80)),
      render: (text: any, record: any) => {
        const isEditing = (isNewRow && editingKey === 'new') || (!isNewRow && editingKey !== null && tableSchema.columns.find(c => c.pk === 1) && record[tableSchema.columns.find(c => c.pk === 1)!.name] === editingKey);
        if (isEditing) {
          return (
            <Form.Item
              name={col.name}
              style={{ margin: 0 }}
              rules={col.notnull === 1 && !isNewRow ? [{ required: true, message: `${col.name}不能为空` }] : []}
            >
              <Input
                type={getFormInputType(col)}
                placeholder={col.pk === 1 && isNewRow ? '自动生成' : col.name}
                disabled={col.pk === 1 && !isNewRow}
              />
            </Form.Item>
          );
        }
        return renderValue(text);
      }
    })),
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: any) => {
        const isEditing = (isNewRow && editingKey === 'new') || (!isNewRow && editingKey !== null && tableSchema.columns.find(c => c.pk === 1) && record[tableSchema.columns.find(c => c.pk === 1)!.name] === editingKey);
        if (isEditing) {
          return (
            <Space>
              <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving} onClick={handleSaveRow}>
                保存
              </Button>
              <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>
                取消
              </Button>
            </Space>
          );
        }
        const pkCol = tableSchema.columns.find(c => c.pk === 1);
        return (
          <Space>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRow(record)}>
              编辑
            </Button>
            {pkCol && (
              <Popconfirm
                title="确定删除这条记录？"
                description="删除后无法恢复"
                onConfirm={() => handleDeleteRow(record)}
                okText="确定"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      }
    }
  ] : [];

  if (loading && !dbConfig) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#999' }}>加载系统配置...</div>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'info',
      label: (
        <Space>
          <CloudServerOutlined />
          系统信息
        </Space>
      ),
      children: (
        <>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Alert
                message="本页面仅管理员可访问，展示系统数据库及服务器运行状态信息"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="数据库文件大小"
                  value={dbConfig?.database.size_mb || '0'}
                  suffix="MB"
                  prefix={<DatabaseOutlined />}
                  valueStyle={{ color: dbConfig?.database.exists ? '#3f8600' : '#cf1322' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="数据表数量"
                  value={dbConfig?.tables.count || 0}
                  suffix="张"
                  prefix={<TableOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="服务运行时长"
                  value={dbConfig?.server.uptime_hours || '0'}
                  suffix="小时"
                  prefix={<ReloadOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="内存使用"
                  value={dbConfig?.server.memory_usage_mb || '0'}
                  suffix="MB"
                  prefix={<HddOutlined />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <DatabaseOutlined />
                    数据库信息
                    {dbConfig?.database.exists ? (
                      <Tag icon={<CheckCircleOutlined />} color="success">正常</Tag>
                    ) : (
                      <Tag icon={<CloseCircleOutlined />} color="error">文件丢失</Tag>
                    )}
                  </Space>
                }
              >
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="数据库类型">
                    <Tag color="blue">{dbConfig?.database.type}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="数据库客户端">
                    <Text code>{dbConfig?.connection.client}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="文件名">
                    <Text copyable>{dbConfig?.database.filename}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="文件路径">
                    <Text copyable ellipsis style={{ maxWidth: 300 }}>{dbConfig?.database.path}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="文件大小">
                    {dbConfig?.database.size_mb} MB（{((dbConfig?.database.size_bytes || 0) / 1024).toFixed(1)} KB）
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">{formatDate(dbConfig?.database.created_at)}</Descriptions.Item>
                  <Descriptions.Item label="最后修改">{formatDate(dbConfig?.database.modified_at)}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <CloudServerOutlined />
                    连接配置
                  </Space>
                }
              >
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="运行模式">
                    <Tag color="green">{dbConfig?.connection.mode}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="日志模式">
                    <Tag color="purple">{dbConfig?.connection.journal_mode}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="外键约束">
                    <Tag color={dbConfig?.connection.foreign_keys === 'ON' ? 'success' : 'warning'}>
                      {dbConfig?.connection.foreign_keys}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="繁忙超时">{dbConfig?.connection.busy_timeout}ms</Descriptions.Item>
                  <Descriptions.Item label="上传文件目录">
                    <Text copyable ellipsis style={{ maxWidth: 280 }}>{dbConfig?.storage.uploads_dir}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="数据目录">
                    <Text copyable ellipsis style={{ maxWidth: 280 }}>{dbConfig?.storage.data_dir}</Text>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    {getPlatformIcon(dbConfig?.server.platform || '')}
                    服务器环境
                  </Space>
                }
              >
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="主机名">
                    <Text code>{dbConfig?.server.hostname}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="操作系统">
                    {dbConfig?.server.platform} / {dbConfig?.server.arch}
                  </Descriptions.Item>
                  <Descriptions.Item label="Node版本">
                    <Tag color="green">{dbConfig?.server.node_version}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="CPU核心数">{dbConfig?.server.cpus} 核</Descriptions.Item>
                  <Descriptions.Item label="总内存">{dbConfig?.server.total_memory_gb} GB</Descriptions.Item>
                  <Descriptions.Item label="可用内存">{dbConfig?.server.free_memory_gb} GB</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <TableOutlined />
                    数据表统计
                    {tableStats && (
                      <Tag color="blue">共 {tableStats.total_records} 条记录</Tag>
                    )}
                  </Space>
                }
              >
                {tableStats ? (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <Row gutter={[8, 8]}>
                      {tableStats.table_stats
                        .sort((a, b) => b.count - a.count)
                        .map(tbl => (
                          <Col span={12} key={tbl.name}>
                            <Card
                              size="small"
                              hoverable
                              styles={{ body: { padding: '8px 12px', cursor: 'pointer' } }}
                              onClick={() => { setActiveTab('browser'); handleSelectTable(tbl.name); }}
                            >
                              <Text ellipsis style={{ maxWidth: '100%', display: 'block' }}>{tbl.name}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>{tbl.count} 条记录</Text>
                            </Card>
                          </Col>
                        ))}
                    </Row>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
                    统计表加载失败或无权限
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col span={24}>
              <Card
                title={
                  <Space>
                    <TableOutlined />
                    所有数据表列表（{dbConfig?.tables.list.length || 0}）
                  </Space>
                }
                extra={
                  <Button type="primary" onClick={() => setActiveTab('browser')}>
                    打开数据浏览器
                  </Button>
                }
              >
                <Space wrap size={[8, 8]}>
                  {dbConfig?.tables.list.map(name => (
                    <Tag
                      key={name}
                      color="geekblue"
                      style={{ margin: 0, cursor: 'pointer' }}
                      onClick={() => { setActiveTab('browser'); handleSelectTable(name); }}
                    >
                      {name}
                    </Tag>
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>
        </>
      )
    },
    {
      key: 'browser',
      label: (
        <Space>
          <TableOutlined />
          数据浏览器
          {selectedTable && <Badge count={selectedTable} style={{ backgroundColor: '#1890ff' }} />}
        </Space>
      ),
      children: (
        <Row gutter={16}>
          <Col span={6}>
            <Card
              title="数据表"
              size="small"
              styles={{ body: { padding: '8px' } }}
            >
              <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  {dbConfig?.tables.list.map(name => {
                    const stats = tableStats?.table_stats.find(t => t.name === name);
                    return (
                      <Card
                        key={name}
                        size="small"
                        hoverable
                        onClick={() => handleSelectTable(name)}
                        styles={{
                          body: {
                            padding: '8px 12px',
                            backgroundColor: selectedTable === name ? '#e6f7ff' : undefined,
                            borderLeft: selectedTable === name ? '3px solid #1890ff' : '3px solid transparent'
                          }
                        }}
                      >
                        <Text strong={selectedTable === name} ellipsis style={{ maxWidth: '100%', display: 'block' }}>
                          {name}
                        </Text>
                        {stats && (
                          <Text type="secondary" style={{ fontSize: 12 }}>{stats.count} 条</Text>
                        )}
                      </Card>
                    );
                  })}
                </Space>
              </div>
            </Card>
          </Col>
          <Col span={18}>
            {selectedTable ? (
              <Card
                title={
                  <Space>
                    <DatabaseOutlined />
                    表：{selectedTable}
                    {tableSchema && (
                      <Tag color="purple">{tableSchema.columns.length} 个字段</Tag>
                    )}
                    {tableData && (
                      <Tag color="blue">共 {tableData.total} 条记录</Tag>
                    )}
                  </Space>
                }
                size="small"
                extra={
                  <Space>
                    <Search
                      placeholder="搜索文本字段..."
                      allowClear
                      enterButton={<SearchOutlined />}
                      style={{ width: 250 }}
                      onSearch={handleSearch}
                      defaultValue={dataSearch}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleAddRow}
                      disabled={editingKey !== null}
                    >
                      新增
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => loadTableData(selectedTable, dataPage, dataPageSize, dataSearch)}
                    >
                      刷新
                    </Button>
                  </Space>
                }
              >
                {tableSchema && (
                  <Alert
                    message={
                      <Space wrap>
                        <Text strong>字段说明：</Text>
                        {tableSchema.columns.map(col => (
                          <Tag key={col.name} color={col.pk === 1 ? 'gold' : col.notnull === 1 ? 'red' : 'default'}>
                            {col.pk === 1 && <KeyOutlined />} {col.name} ({col.type})
                          </Tag>
                        ))}
                      </Space>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                  />
                )}
                <Form form={form} component={false}>
                  <Table
                    columns={tableColumns}
                    dataSource={tableData?.rows || []}
                    rowKey={(record) => {
                      if (!tableSchema) return Math.random().toString();
                      const pkCol = tableSchema.columns.find(c => c.pk === 1);
                      return pkCol ? String(record[pkCol.name]) : Math.random().toString();
                    }}
                    loading={dataLoading}
                    scroll={{ x: 'max-content', y: 'calc(100vh - 460px)' }}
                    size="small"
                    bordered
                    pagination={tableData ? {
                      current: tableData.page,
                      pageSize: tableData.pageSize,
                      total: tableData.total,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                      pageSizeOptions: ['20', '50', '100', '200'],
                      onChange: (page, pageSize) => {
                        loadTableData(selectedTable, page, pageSize, dataSearch);
                      }
                    } : false}
                  />
                </Form>
              </Card>
            ) : (
              <Card>
                <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                  <TableOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                  <div>请从左侧选择一个数据表查看内容</div>
                </div>
              </Card>
            )}
          </Col>
        </Row>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <CloudServerOutlined style={{ marginRight: 8 }} />
            系统设置
          </Title>
          <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
            数据库配置、服务器状态、数据表浏览与直接编辑
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<ReloadOutlined spin={refreshing} />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          刷新
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </div>
  );
};

export default SystemSettingsPage;
