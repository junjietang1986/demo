import React, { useEffect, useState } from 'react';
import { Form, Input, Button, App, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Navigate } from 'react-router-dom';
import { authApi } from '@/api';
import { useAppStore } from '@/store';

const Login: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { token, setToken, setUser, setPermissions } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [token, navigate]);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(values);
      if (res.token && res.user) {
        setToken(res.token);
        setUser(res.user);
        if (res.permissions) {
          setPermissions(res.permissions);
        }
        message.success('登录成功');
        navigate('/dashboard', { replace: true });
      } else {
        message.error('登录失败：返回数据异常');
      }
    } catch (err: any) {
      message.error(err.message || '用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-title">
          <h1>TRAC 设备开发管理系统</h1>
          <p>非标自动化项目过程及质量管理 | VDA6.4/6.7</p>
        </div>
        <Form
          form={form}
          onFinish={handleLogin}
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button type="primary" htmlType="submit" block loading={loading}>
                登 录
              </Button>
              <Button block disabled icon={<LockOutlined />}>
                飞书登录
              </Button>
            </Space>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', color: '#999', fontSize: '12px' }}>
          默认账号: admin / admin123
        </div>
      </div>
    </div>
  );
};

export default Login;
