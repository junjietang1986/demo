import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Select,
  Button,
  Table,
  Checkbox,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Tag,
  Tooltip,
  Popconfirm,
  Dropdown,
  MenuProps,
  Typography,
  App
} from 'antd';
import {
  SafetyOutlined,
  ReloadOutlined,
  SaveOutlined,
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  DeleteOutlined,
  SyncOutlined,
  DownOutlined,
  EditOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { permissionApi } from '@/api';
import type { PermissionModule, Role, RoleWithPermissions } from '@/types';
import { ResizableTable } from '@/components/ResizableTable';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface PermissionRow {
  key: string;
  code: string;
  name: string;
  parent_code: string | null;
  icon: string | null;
  path: string | null;
  sort_order: number;
  is_menu: number;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  children?: PermissionRow[];
}

const PermissionConfig: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [permissionData, setPermissionData] = useState<PermissionRow[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm] = Form.useForm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await permissionApi.getAll();
      setModules(data.modules);
      setRoles(data.roles.map((r: any) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        is_system: r.is_system,
        is_builtin: r.is_builtin,
        dept_id: r.dept_id,
        dept_name: r.dept_name,
        sort_order: r.sort_order,
        created_at: r.created_at,
        updated_at: r.updated_at
      })));
      if (!selectedRole && data.roles.length > 0) {
        setSelectedRole(data.roles[0].code);
        buildPermissionRows(data.modules, data.roles[0]);
      } else if (selectedRole) {
        const roleData = data.roles.find((r: any) => r.code === selectedRole);
        if (roleData) buildPermissionRows(data.modules, roleData);
      }
    } catch (err: any) {
      message.error(err.message || '获取权限数据失败');
    } finally {
      setLoading(false);
    }
  }, [selectedRole]);

  const buildPermissionRows = useCallback((mods: PermissionModule[], roleData: RoleWithPermissions) => {
    const permMap = new Map<string, { can_view: number; can_edit: number; can_delete: number; can_approve: number }>();
    roleData.permissions.forEach(p => {
      permMap.set(p.module_code, {
        can_view: p.can_view,
        can_edit: p.can_edit,
        can_delete: p.can_delete,
        can_approve: p.can_approve
      });
    });

    const buildTree = (parentCode: string | null): PermissionRow[] => {
      return mods
        .filter(m => m.parent_code === parentCode)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(m => {
          const p = permMap.get(m.code);
          const isAdmin = selectedRole === 'super_admin' || selectedRole === 'admin';
          const children = buildTree(m.code);
          return {
            key: m.code,
            code: m.code,
            name: m.name,
            parent_code: m.parent_code,
            icon: m.icon,
            path: m.path,
            sort_order: m.sort_order,
            is_menu: m.is_menu,
            can_view: isAdmin ? true : !!p?.can_view,
            can_edit: isAdmin ? true : !!p?.can_edit,
            can_delete: isAdmin ? true : !!p?.can_delete,
            can_approve: isAdmin ? true : !!p?.can_approve,
            children: children.length > 0 ? children : undefined
          };
        });
    };

    const tree = buildTree(null);
    setPermissionData(tree);

    const expandKeys: string[] = [];
    mods.forEach(m => {
      if (m.parent_code !== null) {
        const parent = mods.find(pm => pm.code === m.parent_code);
        if (parent && !expandKeys.includes(parent.code)) {
          expandKeys.push(parent.code);
        }
      }
    });
    setExpandedKeys(expandKeys);
  }, [selectedRole]);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (modules.length > 0 && roles.length > 0 && selectedRole) {
      const roleData = roles.find(r => r.code === selectedRole);
      if (roleData) {
        const fullRoleData = {
          code: roleData.code,
          name: roleData.name,
          description: roleData.description,
          is_builtin: roleData.is_builtin,
          is_system: roleData.is_system,
          permissions: [] as any[]
        };
        const refreshPermData = async () => {
          try {
            const data = await permissionApi.getAll();
            const rd = data.roles.find((r: any) => r.code === selectedRole);
            if (rd) buildPermissionRows(data.modules, rd);
          } catch (e) {}
        };
        refreshPermData();
      }
    }
  }, [selectedRole]);

  const handleRoleChange = (roleCode: string) => {
    setSelectedRole(roleCode);
  };

  const updatePermission = (key: string, field: 'can_view' | 'can_edit' | 'can_delete' | 'can_approve', value: boolean) => {
    const updateInTree = (rows: PermissionRow[]): PermissionRow[] => {
      return rows.map(row => {
        if (row.key === key) {
          const updated = { ...row, [field]: value };
          if (field === 'can_view' && !value) {
            updated.can_edit = false;
            updated.can_delete = false;
            updated.can_approve = false;
          }
          if ((field === 'can_edit' || field === 'can_delete' || field === 'can_approve') && value) {
            updated.can_view = true;
          }
          if (updated.children) {
            updated.children = updateChildren(updated.children, field, updated.can_view, value);
          }
          return updated;
        }
        if (row.children) {
          return { ...row, children: updateInTree(row.children) };
        }
        return row;
      });
    };

    const updateChildren = (children: PermissionRow[], f: string, parentView: boolean, val: boolean): PermissionRow[] => {
      return children.map(child => {
        const updated = { ...child };
        if (f === 'can_view') {
          updated.can_view = parentView ? updated.can_view : false;
          if (!parentView) {
            updated.can_edit = false;
            updated.can_delete = false;
            updated.can_approve = false;
          }
        } else if (val && parentView) {
          (updated as any)[f] = val;
        }
        if (updated.children) {
          updated.children = updateChildren(updated.children, f, updated.can_view, val);
        }
        return updated;
      });
    };

    setPermissionData(updateInTree(permissionData));
  };

  const collectPermissions = (rows: PermissionRow[]): any[] => {
    const result: any[] = [];
    rows.forEach(row => {
      result.push({
        module_code: row.code,
        can_view: row.can_view,
        can_edit: row.can_edit,
        can_delete: row.can_delete,
        can_approve: row.can_approve
      });
      if (row.children) {
        result.push(...collectPermissions(row.children));
      }
    });
    return result;
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    const role = roles.find(r => r.code === selectedRole);
    if (role?.is_builtin && (selectedRole === 'super_admin' || selectedRole === 'admin')) {
      message.info('管理员角色默认拥有全部权限，无需配置');
      return;
    }
    setLoading(true);
    try {
      const permissions = collectPermissions(permissionData);
      await permissionApi.saveRolePermissions(selectedRole, permissions);
      message.success('权限保存成功');
      fetchAll();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = () => {
    setEditingRole(null);
    roleForm.resetFields();
    setRoleModalVisible(true);
  };

  const handleEditRole = (role: Role) => {
    setEditingRole(role);
    roleForm.setFieldsValue({
      code: role.code,
      name: role.name,
      description: role.description,
      dept_name: role.dept_name,
      sort_order: role.sort_order
    });
    setRoleModalVisible(true);
  };

  const handleRoleModalOk = async () => {
    try {
      const values = await roleForm.validateFields();
      if (editingRole) {
        await permissionApi.updateRole(editingRole.code, values);
        message.success('角色更新成功');
      } else {
        await permissionApi.createRole(values);
        message.success('角色创建成功');
      }
      setRoleModalVisible(false);
      fetchAll();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '操作失败');
    }
  };

  const handleDeleteRole = async (role: Role) => {
    try {
      await permissionApi.deleteRole(role.code);
      message.success('角色删除成功');
      if (selectedRole === role.code) {
        setSelectedRole('super_admin');
      }
      fetchAll();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleDownloadTemplate = () => {
    permissionApi.downloadTemplate();
  };

  const handleExport = () => {
    permissionApi.exportPermissions();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await permissionApi.importPermissions(file);
      message.success(`导入成功：${result.imported}条权限，新建${result.roles_created.length}个角色`);
      fetchAll();
    } catch (err: any) {
      message.error(err.message || '导入失败');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const currentRole = roles.find(r => r.code === selectedRole);
  const isAdminRole = selectedRole === 'super_admin' || selectedRole === 'admin';

  const columns = [
    {
      title: '功能模块',
      dataIndex: 'name',
      key: 'name',
      width: 320,
      render: (text: string, record: PermissionRow) => (
        <Space>
          {record.is_menu === 1 && !record.path && <Tag color="blue" style={{ fontSize: 11 }}>分组</Tag>}
          {record.path && <Tag color="green" style={{ fontSize: 11 }}>菜单</Tag>}
          <span>{text}</span>
          {record.code && <Text type="secondary" style={{ fontSize: 11 }}>({record.code})</Text>}
        </Space>
      )
    },
    {
      title: '查看',
      dataIndex: 'can_view',
      key: 'can_view',
      width: 100,
      align: 'center' as const,
      render: (val: boolean, record: PermissionRow) => (
        <Checkbox
          checked={val}
          disabled={isAdminRole}
          onChange={e => updatePermission(record.key, 'can_view', e.target.checked)}
        />
      )
    },
    {
      title: '编辑',
      dataIndex: 'can_edit',
      key: 'can_edit',
      width: 100,
      align: 'center' as const,
      render: (val: boolean, record: PermissionRow) => (
        <Checkbox
          checked={val}
          disabled={isAdminRole || !record.can_view}
          onChange={e => updatePermission(record.key, 'can_edit', e.target.checked)}
        />
      )
    },
    {
      title: '删除',
      dataIndex: 'can_delete',
      key: 'can_delete',
      width: 100,
      align: 'center' as const,
      render: (val: boolean, record: PermissionRow) => (
        <Checkbox
          checked={val}
          disabled={isAdminRole || !record.can_view}
          onChange={e => updatePermission(record.key, 'can_delete', e.target.checked)}
        />
      )
    },
    {
      title: '审批',
      dataIndex: 'can_approve',
      key: 'can_approve',
      width: 100,
      align: 'center' as const,
      render: (val: boolean, record: PermissionRow) => (
        <Checkbox
          checked={val}
          disabled={isAdminRole || !record.can_view}
          onChange={e => updatePermission(record.key, 'can_approve', e.target.checked)}
        />
      )
    }
  ];

  const importMenuItems: MenuProps['items'] = [
    { key: 'template', icon: <DownloadOutlined />, label: '下载导入模板', onClick: handleDownloadTemplate },
    { key: 'export', icon: <DownloadOutlined />, label: '导出当前权限配置', onClick: handleExport },
    { key: 'import', icon: <UploadOutlined />, label: '批量导入权限', onClick: () => fileInputRef.current?.click() }
  ];

  return (
    <div style={{ padding: '20px' }}>
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SafetyOutlined style={{ fontSize: 28, color: '#1890ff' }} />
            <div>
              <Title level={4} style={{ margin: 0 }}>权限配置</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>根据角色配置各功能模块的访问和操作权限</Text>
            </div>
          </div>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>刷新</Button>
            <Dropdown menu={{ items: importMenuItems }}>
              <Button icon={<DownloadOutlined />}>导入/导出 <DownOutlined /></Button>
            </Dropdown>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRole}>新增角色</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={loading}
              disabled={isAdminRole}
            >
              保存当前角色权限
            </Button>
          </Space>
        </div>

        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <Space size="large" wrap>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong>选择角色：</Text>
              <Select
                value={selectedRole}
                onChange={handleRoleChange}
                style={{ width: 280 }}
                placeholder="请选择角色"
                optionLabelProp="label"
                showSearch
                filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                options={roles.map(r => ({
                  value: r.code,
                  label: (
                    <Space>
                      <span>{r.name}</span>
                      {r.is_builtin === 1 && <Tag color="blue" style={{ fontSize: 10 }}>内置</Tag>}
                      {r.dept_name && <Tag color="purple" style={{ fontSize: 10 }}>{r.dept_name}</Tag>}
                    </Space>
                  )
                }))}
              />
            </div>
            {currentRole && (
              <>
                {currentRole.description && (
                  <Tooltip title={currentRole.description}>
                    <Space size={4}>
                      <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                      <Text type="secondary">{currentRole.description}</Text>
                    </Space>
                  </Tooltip>
                )}
                {!currentRole.is_builtin && (
                  <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEditRole(currentRole)}>编辑</Button>
                    <Popconfirm title="确定删除该角色？" onConfirm={() => handleDeleteRole(currentRole)}>
                      <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                )}
                {isAdminRole && (
                  <Tag color="red" style={{ fontSize: 12 }}>管理员角色 - 默认拥有全部权限</Tag>
                )}
              </>
            )}
          </Space>
        </div>

        <ResizableTable
          tableKey="permission_config"
          columns={columns}
          dataSource={permissionData}
          pagination={false}
          loading={loading}
          rowKey="key"
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[])
          }}
          size="middle"
          bordered
        />
      </Card>

      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={roleModalVisible}
        onOk={handleRoleModalOk}
        onCancel={() => setRoleModalVisible(false)}
        destroyOnHidden
        className="modal-md"
      >
        <Form form={roleForm} layout="vertical">
          <Form.Item
            name="code"
            label="角色编码"
            rules={[
              { required: true, message: '请输入角色编码' },
              { pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: '编码需以字母开头，只能包含字母、数字和下划线' }
            ]}
          >
            <Input placeholder="例如：mech_engineer" disabled={!!editingRole} maxLength={50} />
          </Form.Item>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：机械工程师" maxLength={50} />
          </Form.Item>
          <Form.Item name="dept_name" label="所属部门">
            <Input placeholder="可选，例如：机械设计部" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="角色描述">
            <TextArea rows={3} placeholder="请输入角色描述" maxLength={500} />
          </Form.Item>
          <Form.Item name="sort_order" label="排序序号" initialValue={50}>
            <InputNumber min={0} max={999} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PermissionConfig;
