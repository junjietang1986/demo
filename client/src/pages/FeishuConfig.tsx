import React, { useEffect, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Alert, Space, Spin, Tag, Divider, Typography, App, InputNumber, Switch, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, SettingOutlined, InfoCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { feishuApi } from '@/api';
import { useAppStore } from '@/store';
import { clearUserCache } from '@/components/FeishuUserSelect';

const { Title, Text, Paragraph } = Typography;

const FeishuConfigPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const user = useAppStore(s => s.user);

  const isAdmin = user?.role === 'admin';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await feishuApi.getStatus();
      setStatus(data);
      form.setFieldsValue({
        app_id: '',
        app_secret: '',
        auto_sync_interval: data.auto_sync_interval || 30
      });
    } catch (err: any) {
      message.error(err.message || '获取配置状态失败');
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(() => {
      feishuApi.getStatus().then(data => {
        setStatus(prev => ({ ...prev, ...data, is_syncing: data.is_syncing, last_sync: data.last_sync }));
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await feishuApi.saveConfig({
        app_id: values.app_id || undefined,
        app_secret: values.app_secret || undefined,
        auto_sync_interval: values.auto_sync_enabled ? (values.auto_sync_interval || 30) : 0
      });
      message.success('飞书配置已保存');
      clearUserCache();
      setTestResult(null);
      setSyncResult(null);
      await loadStatus();
      form.resetFields(['app_secret']);
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await feishuApi.getUsers();
      setTestResult({
        ok: true,
        msg: `连接成功！${data.configured ? `已从飞书获取 ${data.users?.length || 0} 位用户` : '飞书未配置，当前使用本地用户'}`
      });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message || '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const data = await feishuApi.syncUsers();
      setSyncResult(data);
      message.success(data.message || '同步完成');
      clearUserCache();
      await loadStatus();
    } catch (err: any) {
      message.error(err.message || '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = () => {
    if (!status?.last_sync) return '从未同步';
    const ls = status.last_sync;
    const r = ls.result;
    return (
      <span>
        <ClockCircleOutlined /> {ls.time}
        {r && (
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            (共{r.total}人，新增{r.created}，更新{r.updated}{r.deactivated ? `，停用${r.deactivated}` : ''})
          </Text>
        )}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div className="page-header">
          <h2><SettingOutlined /> 飞书集成配置</h2>
        </div>

        {!isAdmin && (
          <Alert
            type="warning"
            showIcon
            message="仅管理员可修改飞书配置"
            style={{ marginBottom: 16 }}
          />
        )}

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="飞书组织架构集成说明"
            description={
              <div>
                <Paragraph style={{ marginBottom: 8 }}>
                  配置飞书应用后，所有人员选择将直接从飞书通讯录中读取，系统将自动定时同步企业组织架构、人员信息（姓名、部门、职位、邮箱等）到本地数据库。
                </Paragraph>
                <Paragraph style={{ marginBottom: 8 }}>
                  <Text strong>操作步骤：</Text>
                </Paragraph>
                <Paragraph style={{ marginBottom: 4, paddingLeft: 16 }}>
                  1. 在 <a href="https://open.feishu.cn/" target="_blank" rel="noreferrer">飞书开放平台</a> 创建<Text strong>企业自建应用</Text>
                </Paragraph>
                <Paragraph style={{ marginBottom: 4, paddingLeft: 16 }}>
                  2. 进入「<Text strong>权限管理</Text>」，搜索并开通以下<Text strong>全部</Text>权限：
                </Paragraph>
                <div style={{ paddingLeft: 32, marginBottom: 8 }}>
                  <Tag color="blue">contact:contact.base:readonly</Tag>
                  <span>（获取通讯录基本信息）</span><br />
                  <Tag color="blue">contact:department.base:readonly</Tag>
                  <span>（获取部门基本信息）</span><br />
                  <Tag color="blue" style={{ background: '#fff2e8', borderColor: '#ffbb96', color: '#d4380d' }}>contact:user.base:readonly</Tag>
                  <span style={{ color: '#d4380d' }}>（获取用户基本信息 - 必须开通，否则无法获取用户姓名）</span><br />
                  <Tag color="blue">contact:user.email:readonly</Tag>
                  <span>（获取用户邮箱）</span><br />
                  <Tag color="blue">contact:user.phone:readonly</Tag>
                  <span>（获取用户手机号）</span>
                </div>
                <Paragraph style={{ marginBottom: 4, paddingLeft: 16 }}>
                  3. 进入「<Text strong>权限管理 → 权限配置 → 通讯录权限范围</Text>」，设置为<Text strong>"全部成员"</Text>
                </Paragraph>
                <Paragraph style={{ marginBottom: 4, paddingLeft: 16 }}>
                  4. <Text strong type="warning">重要：</Text>进入「<Text strong>版本管理与发布</Text>」，创建新版本并<Text strong>发布</Text>，等待管理员审批通过
                </Paragraph>
                <Paragraph type="warning" style={{ marginBottom: 0, paddingLeft: 16 }}>
                  <Text strong>注意：</Text>仅开通权限不发布新版本是不生效的！发布后可能需要等待几分钟权限才会生效。
                </Paragraph>
              </div>
            }
          />

          <div>
            <Title level={5}>当前状态</Title>
            <Space wrap>
              {status?.configured ? (
                <Tag icon={<CheckCircleOutlined />} color="success">飞书已配置并可用</Tag>
              ) : (
                <Tag icon={<CloseCircleOutlined />} color="default">飞书未配置</Tag>
              )}
              {status?.app_id_configured && <Tag color="blue">App ID 已设置</Tag>}
              {status?.app_secret_configured && <Tag color="blue">App Secret 已设置</Tag>}
              {status?.is_syncing && <Tag icon={<SyncOutlined spin />} color="processing">正在同步中...</Tag>}
              {status?.auto_sync_enabled ? (
                <Tag icon={<CheckCircleOutlined />} color="green">自动同步已开启（每{status.auto_sync_interval}分钟）</Tag>
              ) : (
                <Tag color="default">自动同步已关闭</Tag>
              )}
            </Space>
            {status?.app_id_masked && (
              <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
                当前 App ID：{status.app_id_masked}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <Text type="secondary">最后同步时间：</Text>
              {formatLastSync()}
            </div>
          </div>

          <Divider />

          <Form
            form={form}
            layout="vertical"
            disabled={!isAdmin}
            style={{ maxWidth: 560 }}
            initialValues={{ auto_sync_enabled: status?.auto_sync_enabled, auto_sync_interval: status?.auto_sync_interval || 30 }}
          >
            <Form.Item
              label="App ID（应用 ID）"
              name="app_id"
            >
              <Input placeholder="输入飞书应用的 App ID（cli_开头）" allowClear />
            </Form.Item>
            <Form.Item
              label="App Secret（应用密钥）"
              name="app_secret"
            >
              <Input.Password placeholder="输入飞书应用的 App Secret（留空则不修改）" allowClear />
            </Form.Item>

            <Form.Item
              label={
                <span>
                  自动定时同步
                  <Tooltip title="开启后系统将按设定间隔自动从飞书同步用户信息到本地，确保人员信息实时更新">
                    <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                  </Tooltip>
                </span>
              }
              name="auto_sync_enabled"
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" defaultChecked={status?.auto_sync_enabled} />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.auto_sync_enabled !== cur.auto_sync_enabled}
            >
              {({ getFieldValue }) =>
                getFieldValue('auto_sync_enabled') ? (
                  <Form.Item
                    label="自动同步间隔（分钟）"
                    name="auto_sync_interval"
                    rules={[{ required: true, message: '请输入同步间隔' }]}
                  >
                    <Space.Compact style={{ width: 200 }}>
                      <InputNumber min={5} max={1440} step={5} style={{ width: '100%' }} />
                      <Button disabled>分钟</Button>
                    </Space.Compact>
                  </Form.Item>
                ) : null
              }
            </Form.Item>

            <Form.Item>
              <Space wrap>
                <Button type="primary" onClick={handleSave} loading={saving} disabled={!isAdmin}>
                  保存配置
                </Button>
                <Button onClick={handleTest} loading={testing} icon={<SyncOutlined spin={testing} />}>
                  测试连接
                </Button>
                {status?.configured && isAdmin && (
                  <Button onClick={handleSync} loading={syncing || status?.is_syncing} type="default">
                    立即同步飞书用户到本地
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>

          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              showIcon
              message={testResult.ok ? '连接测试成功' : '连接测试失败'}
              description={testResult.msg}
            />
          )}

          {syncResult && (
            <Alert
              type="success"
              showIcon
              message="同步结果"
              description={
                <div>
                  <div>{syncResult.message}</div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    总用户数：{syncResult.total}，新增：{syncResult.created}，更新：{syncResult.updated}
                  </div>
                </div>
              }
            />
          )}
        </Space>
      </Card>
    </div>
  );
};

export default FeishuConfigPage;
