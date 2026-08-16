import React, { useState, useEffect, useMemo } from 'react';
import {
  Layout,
  Tree,
  Input,
  Button,
  Tag,
  Avatar,
  Breadcrumb,
  Modal,
  Form,
  Select,
  Table,
  Popconfirm,
  Space,
  Empty,
  Spin,
  App,
  Checkbox,
  Tooltip
} from 'antd';
import {
  SyncOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  PhoneOutlined,
  MailOutlined,
  UserSwitchOutlined
} from '@ant-design/icons';
import { userApi, feishuApi } from '@/api';
import type { DataNode } from 'antd/es/tree';
import type { ColumnsType } from 'antd/es/table';
import { ResizableTable } from '../components/ResizableTable';

const { Sider, Content } = Layout;

interface OrgUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  role_label: string;
  job_title: string;
  avatar: string;
  is_leader: boolean;
}

interface RoleItem {
  code: string;
  name: string;
  description?: string;
  is_builtin: number;
  dept_name?: string;
}

interface DeptNode {
  key: string;
  title: string;
  name: string;
  path: string;
  dept_id: string;
  userCount: number;
  leaderName: string | null;
  children?: DeptNode[];
}

const avatarColors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#f5222d', '#1890ff', '#52c41a', '#eb2f96'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitial(name: string): string {
  if (!name) return '?';
  return name.charAt(0);
}

function getRoleColor(roleCode: string): string {
  const map: Record<string, string> = {
    super_admin: 'volcano',
    admin: 'red',
    user: 'default'
  };
  return map[roleCode] || 'blue';
}

export default function UserManagement() {
  const { message } = App.useApp();
  const [treeData, setTreeData] = useState<DeptNode[]>([]);
  const [deptUsersMap, setDeptUsersMap] = useState<Record<string, OrgUser[]>>({});
  const [selectedDeptPath, setSelectedDeptPath] = useState<string>('');
  const [selectedDeptNode, setSelectedDeptNode] = useState<DeptNode | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [form] = Form.useForm();
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null);
  const [passwordForm] = Form.useForm();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchRoleModalVisible, setBatchRoleModalVisible] = useState(false);
  const [batchRoleForm] = Form.useForm();
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  const nodeByKey = useMemo(() => {
    const map = new Map<string, DeptNode>();
    const collect = (nodes: DeptNode[]) => {
      nodes.forEach(n => {
        map.set(n.key, n);
        if (n.children) collect(n.children);
      });
    };
    collect(treeData);
    return map;
  }, [treeData]);

  const nodeByPath = useMemo(() => {
    const map = new Map<string, DeptNode>();
    const collect = (nodes: DeptNode[]) => {
      nodes.forEach(n => {
        map.set(n.path, n);
        if (n.children) collect(n.children);
      });
    };
    collect(treeData);
    return map;
  }, [treeData]);

  const loadRoles = async () => {
    try {
      const data = await userApi.rolesList();
      setRoles(data || []);
    } catch (err: any) {
      message.error(err.message || '加载角色列表失败');
    }
  };

  const loadDeptTree = async () => {
    setLoading(true);
    try {
      const res = await userApi.departmentTree();
      setTreeData(res.tree || []);
      setDeptUsersMap(res.deptUsers || {});
      const keys: string[] = [];
      const collect = (nodes: DeptNode[]) => {
        nodes.forEach(n => {
          keys.push(n.key);
          if (n.children) collect(n.children);
        });
      };
      collect(res.tree || []);
      setExpandedKeys(keys);
      if (res.tree && res.tree.length > 0) {
        const root = res.tree[0];
        if (!selectedDeptPath) {
          setSelectedDeptPath(root.path);
          setSelectedDeptNode(root);
        }
      }
    } catch (err: any) {
      message.error(err.message || '加载组织架构失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeptTree();
    loadRoles();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const hide = message.loading('正在同步飞书用户（工程技术中心），请稍候...', 0);
    try {
      const result = await feishuApi.syncUsers();
      hide();
      message.success(`同步完成！总用户：${result.total}，新增：${result.created}，更新：${result.updated}`);
      loadDeptTree();
    } catch (err: any) {
      hide();
      message.error(err.message || '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const breadcrumbItems = useMemo(() => {
    const items: any[] = [{ title: <span><TeamOutlined /> 组织内联系人</span> }];
    if (selectedDeptPath) {
      const parts = selectedDeptPath.split('/');
      let accumPath = '';
      parts.forEach((p, i) => {
        accumPath = accumPath ? accumPath + '/' + p : p;
        items.push({
          title: i === parts.length - 1
            ? <span style={{ color: 'rgba(0,0,0,0.85)' }}>{p}</span>
            : <a onClick={() => {
                const node = nodeByPath.get(accumPath);
                if (node) { setSelectedDeptPath(accumPath); setSelectedDeptNode(node); }
              }}>{p}</a>
        });
      });
    }
    return items;
  }, [selectedDeptPath, nodeByPath]);

  const currentDeptUsers = useMemo(() => {
    let users: OrgUser[] = [];
    if (searchKeyword.trim()) {
      Object.values(deptUsersMap).forEach(list => { users = users.concat(list); });
      const kw = searchKeyword.toLowerCase();
      users = users.filter(u =>
        (u.name || '').toLowerCase().includes(kw) ||
        (u.email || '').toLowerCase().includes(kw) ||
        (u.phone || '').includes(kw) ||
        (u.job_title || '').toLowerCase().includes(kw) ||
        (u.role_label || '').toLowerCase().includes(kw)
      );
    } else if (selectedDeptPath) {
      const prefix = selectedDeptPath + '/';
      Object.entries(deptUsersMap).forEach(([path, list]) => {
        if (path === selectedDeptPath || path.startsWith(prefix)) {
          users = users.concat(list);
        }
      });
      const seen = new Set<number>();
      users = users.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
    } else {
      Object.values(deptUsersMap).forEach(list => { users = users.concat(list); });
      const seen = new Set<number>();
      users = users.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
    }
    return users;
  }, [selectedDeptPath, deptUsersMap, searchKeyword]);

  const handleTreeSelect = (keys: React.Key[]) => {
    if (keys.length > 0) {
      setSearchKeyword('');
      setSelectedRowKeys([]);
      const node = nodeByKey.get(keys[0] as string);
      if (node) {
        setSelectedDeptPath(node.path);
        setSelectedDeptNode(node);
      }
    }
  };

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user', password: '123456' });
    setModalVisible(true);
  };

  const handleEdit = (user: OrgUser) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue({
      name: user.name,
      email: user.email,
      phone: user.phone,
      department: user.department,
      role: user.role,
      job_title: user.job_title
    });
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingUser) {
        await userApi.update(editingUser.id, values);
        message.success('用户更新成功');
      } else {
        await userApi.create(values);
        message.success('用户创建成功');
      }
      setModalVisible(false);
      loadDeptTree();
      loadRoles();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userApi.delete(id);
      message.success('删除成功');
      loadDeptTree();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleResetPassword = (userId: number) => {
    setPasswordUserId(userId);
    passwordForm.resetFields();
    setPasswordModalVisible(true);
  };

  const handlePasswordModalOk = async () => {
    try {
      const values = await passwordForm.validateFields();
      if (passwordUserId) {
        await userApi.resetPassword(passwordUserId, values.password);
        message.success('密码重置成功');
      }
      setPasswordModalVisible(false);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '操作失败');
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await userApi.updateRole(userId, newRole);
      message.success('角色更新成功');
      loadDeptTree();
    } catch (err: any) {
      message.error(err.message || '角色更新失败');
    }
  };

  const handleBatchRole = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要操作的用户');
      return;
    }
    batchRoleForm.resetFields();
    setBatchRoleModalVisible(true);
  };

  const handleBatchRoleOk = async () => {
    try {
      const values = await batchRoleForm.validateFields();
      await userApi.batchUpdateRole(selectedRowKeys as number[], values.role);
      message.success(`成功更新${selectedRowKeys.length}个用户的角色`);
      setBatchRoleModalVisible(false);
      setSelectedRowKeys([]);
      loadDeptTree();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '批量更新失败');
    }
  };

  const renderTreeTitle = (node: DeptNode) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{node.name}</span>
      {node.userCount > 0 && (
        <span style={{ color: '#999', fontSize: 12 }}>({node.userCount})</span>
      )}
    </span>
  );

  const transformTreeData = (nodes: DeptNode[]): DataNode[] => {
    return nodes.map(n => ({
      key: n.key,
      title: renderTreeTitle(n),
      path: n.path,
      name: n.name,
      dept_id: n.dept_id,
      userCount: n.userCount,
      leaderName: n.leaderName,
      children: n.children ? transformTreeData(n.children) : undefined
    }));
  };

  const columns: ColumnsType<OrgUser> = [
    {
      title: '用户',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (_: any, record: OrgUser) => (
        <Space>
          <Avatar
            size={36}
            src={record.avatar || undefined}
            style={{ backgroundColor: getAvatarColor(record.name || ''), flexShrink: 0 }}
          >
            {getInitial(record.name)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            {record.job_title && <div style={{ fontSize: 12, color: '#999' }}>{record.job_title}</div>}
          </div>
          {record.is_leader && <Tag color="blue" style={{ fontSize: 11 }}>负责人</Tag>}
        </Space>
      )
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 200,
      ellipsis: true,
      render: (dept: string) => {
        const parts = (dept || '').split('/').filter(Boolean);
        const shortName = parts.length > 0 ? parts[parts.length - 1] : dept;
        return <Tooltip title={dept}>{shortName || '-'}</Tooltip>;
      }
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 180,
      render: (_: any, record: OrgUser) => isAdmin ? (
        <Select
          value={record.role}
          style={{ width: '100%' }}
          size="small"
          onChange={(val) => handleRoleChange(record.id, val)}
          optionLabelProp="label"
          showSearch
          filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
          options={roles.map(r => ({
            value: r.code,
            label: r.name,
          }))}
        />
      ) : (
        <Tag color={getRoleColor(record.role)}>{record.role_label}</Tag>
      )
    },
    {
      title: '联系方式',
      key: 'contact',
      width: 220,
      render: (_: any, record: OrgUser) => (
        <div style={{ fontSize: 12 }}>
          {record.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#666' }}>
              <PhoneOutlined /> {record.phone}
            </div>
          )}
          {record.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#666', marginTop: 2 }}>
              <MailOutlined /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{record.email}</span>
            </div>
          )}
        </div>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      align: 'center' as const,
      render: (_: any, record: OrgUser) => isAdmin ? (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="编辑" />
          <Button type="text" size="small" icon={<KeyOutlined />} onClick={() => handleResetPassword(record.id)} title="重置密码" />
          <Popconfirm
            title="确定要删除该用户吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除" />
          </Popconfirm>
        </Space>
      ) : null
    }
  ];

  const rowSelection = isAdmin ? {
    selectedRowKeys,
    onChange: (newSelectedKeys: React.Key[]) => setSelectedRowKeys(newSelectedKeys),
  } : undefined;

  return (
    <Layout style={{ height: 'calc(100vh - 110px)', background: '#fff' }}>
      <Sider
        width={260}
        style={{
          background: '#fafafa',
          borderRight: '1px solid #f0f0f0',
          overflow: 'auto'
        }}
      >
        <div style={{ padding: '16px 12px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TeamOutlined style={{ fontSize: 18, color: '#1890ff' }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>通讯录</span>
          </div>
          <Input
            placeholder="搜索用户"
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={e => {
              setSearchKeyword(e.target.value);
              if (e.target.value) { setSelectedDeptPath(''); setSelectedDeptNode(null); }
            }}
            allowClear
            style={{ marginBottom: 8 }}
          />
          {isAdmin && (
            <Space style={{ width: '100%', marginBottom: 8 }} wrap>
              <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAdd}>
                新增用户
              </Button>
              <Button
                icon={<SyncOutlined spin={syncing} />}
                size="small"
                onClick={handleSync}
                loading={syncing}
                style={{ color: '#52c41a', borderColor: '#b7eb8f' }}
              >
                飞书同步
              </Button>
            </Space>
          )}
        </div>
        <Spin spinning={loading}>
          <div style={{ padding: '0 8px' }}>
            <div
              onClick={() => { setSearchKeyword(''); setSelectedDeptPath(''); setSelectedDeptNode(null); setSelectedRowKeys([]); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: !selectedDeptPath && !searchKeyword ? '#e6f4ff' : 'transparent',
                color: !selectedDeptPath && !searchKeyword ? '#1890ff' : 'inherit'
              }}
            >
              <TeamOutlined />
              <span>全部联系人</span>
            </div>
            {treeData.length > 0 && (
              <Tree
                showLine={false}
                selectedKeys={selectedDeptNode ? [selectedDeptNode.key] : []}
                expandedKeys={expandedKeys}
                onExpand={keys => setExpandedKeys(keys as string[])}
                onSelect={handleTreeSelect}
                treeData={transformTreeData(treeData)}
                blockNode
                defaultExpandAll
                style={{ background: 'transparent', padding: '4px 0' }}
              />
            )}
          </div>
        </Spin>
      </Sider>
      <Content style={{ padding: '0 24px 24px', overflow: 'auto' }}>
        <div style={{ padding: '16px 0 12px', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
          <Breadcrumb items={breadcrumbItems} />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#666' }}>
              共 <span style={{ color: '#1890ff', fontWeight: 600 }}>{currentDeptUsers.length}</span> 位成员
              {selectedDeptNode?.leaderName && (
                <span style={{ marginLeft: 12 }}>部门负责人：{selectedDeptNode.leaderName}</span>
              )}
              {selectedRowKeys.length > 0 && (
                <span style={{ marginLeft: 12, color: '#fa8c16' }}>已选择 {selectedRowKeys.length} 项</span>
              )}
            </div>
            {isAdmin && selectedRowKeys.length > 0 && (
              <Space>
                <Button icon={<UserSwitchOutlined />} size="small" onClick={handleBatchRole}>
                  批量更改角色
                </Button>
                <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
              </Space>
            )}
          </div>
        </div>

        {currentDeptUsers.length === 0 ? (
          <Empty description={loading ? '加载中...' : (searchKeyword ? '未找到匹配用户' : '该部门暂无成员')} />
        ) : (
          <ResizableTable
            tableKey="user_list"
            columns={columns}
            dataSource={currentDeptUsers}
            rowKey="id"
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 人` }}
            loading={loading}
            rowSelection={rowSelection}
            size="middle"
          />
        )}
      </Content>

      <Modal title={editingUser ? '编辑用户' : '新增用户'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
       className="modal-sm">
        <Form form={form} layout="vertical">
          {!editingUser && (
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input placeholder="请输入用户名" />
            </Form.Item>
          )}
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="请输入电话" />
          </Form.Item>
          <Form.Item name="job_title" label="岗位">
            <Input placeholder="请输入岗位" />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="请输入部门路径，如 工程技术中心/质量部" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="请选择角色"
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={roles.map(r => ({ value: r.code, label: r.name }))}
            />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="初始密码" initialValue="123456" rules={[{ required: true, message: '请输入初始密码' }]}>
              <Input.Password placeholder="请输入初始密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal title="重置密码" open={passwordModalVisible} onOk={handlePasswordModalOk} onCancel={() => setPasswordModalVisible(false)} destroyOnHidden
       className="modal-sm">
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码长度至少6位' }
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={`批量更改角色（${selectedRowKeys.length}个用户）`} open={batchRoleModalVisible} onOk={handleBatchRoleOk} onCancel={() => setBatchRoleModalVisible(false)} destroyOnHidden
       className="modal-sm">
        <Form form={batchRoleForm} layout="vertical">
          <Form.Item name="role" label="新角色" rules={[{ required: true, message: '请选择目标角色' }]}>
            <Select
              placeholder="请选择要分配的角色"
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={roles.map(r => ({ value: r.code, label: r.name }))}
              optionLabelProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
