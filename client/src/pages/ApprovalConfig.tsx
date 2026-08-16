import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space, Card, Popconfirm, App, Switch, Divider, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, StarOutlined, StarFilled,
  ArrowUpOutlined, ArrowDownOutlined, MinusCircleOutlined
} from '@ant-design/icons';
import api, { approvalApi, permissionApi } from '@/api';
import { ApprovalFlow, ApprovalStep } from '@/types';
import { useAppStore } from '@/store';
import dayjs from 'dayjs';
import { ResizableTable } from '@/components/ResizableTable';

const { TextArea } = Input;

const MODULE_OPTIONS = [
  { value: 'project_plan', label: '项目计划审批' },
  { value: 'acceptance_form', label: '验收单审批' },
  { value: 'acceptance_plan', label: '验收计划审批' },
  { value: 'improvement', label: '持续改进审批' }
];

const BUILTIN_ROLE_OPTIONS = [
  { value: 'creator', label: '提交人（发起人）' },
  { value: 'responsible', label: '负责人' },
  { value: 'verifier', label: '验证人' },
  { value: 'dept_manager', label: '部门经理' },
  { value: 'project_manager', label: '项目经理' }
];

const ApprovalConfig: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ApprovalFlow | null>(null);
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    fetchFlows();
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const res = await permissionApi.getRoles();
      setRoles(res || []);
    } catch (err) {
      // 忽略错误，使用默认选项
    }
  };

  const roleOptions = React.useMemo(() => {
    const opts = [...BUILTIN_ROLE_OPTIONS];
    roles.forEach((r: any) => {
      if (!['super_admin', 'admin', 'user', 'doc_controller'].includes(r.code)) {
        opts.push({ value: `role:${r.code}`, label: `角色: ${r.name}` });
      }
    });
    // 添加系统内置角色
    opts.push({ value: 'admin', label: '系统管理员' });
    opts.push({ value: 'doc_controller', label: '文控' });
    opts.push({ value: 'qa_engineer', label: '质量工程师' });
    return opts;
  }, [roles]);

  const getRoleLabel = (value: string) => {
    const opt = roleOptions.find(o => o.value === value);
    return opt ? opt.label : value;
  };

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const res = await approvalApi.flows();
      setFlows(Array.isArray(res) ? res : (res.list || []));
    } catch (err: any) {
      message.error(err.message || '获取审批流程失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingFlow(null);
    form.resetFields();
    form.setFieldsValue({ is_default: false, steps: [{ step: 1, name: '', role: '', description: '' }] });
    setModalVisible(true);
    setTimeout(() => {
      form.setFieldsValue({ is_default: false, steps: [{ step: 1, name: '', role: '', description: '' }] });
    }, 0);
  };

  const handleEdit = (record: ApprovalFlow) => {
    setEditingFlow(record);
    setModalVisible(true);
    setTimeout(() => {
      form.setFieldsValue({
        flow_name: record.flow_name,
        module: record.module,
        description: record.description,
        is_default: record.is_default === 1,
        steps: record.steps && record.steps.length > 0
          ? record.steps.map((s, i) => ({ ...s, step: i + 1 }))
          : [{ step: 1, name: '', role: '', description: '' }]
      });
    }, 0);
  };

  const handleDelete = async (id: number) => {
    try {
      await approvalApi.deleteFlow(id);
      message.success('删除成功');
      fetchFlows();
    } catch (err: any) {
      message.error(err.message || '删除失败，该流程可能正在被使用');
    }
  };

  const handleSetDefault = async (record: ApprovalFlow) => {
    try {
      await approvalApi.updateFlow(record.id, { ...record, is_default: 1 });
      message.success('已设为默认流程');
      fetchFlows();
    } catch (err: any) {
      message.error(err.message || '设置失败');
    }
  };

  const handleInitSystemApproval = async () => {
    try {
      setSubmitLoading(true);
      // 删除所有现有流程
      for (const flow of flows) {
        try { await approvalApi.deleteFlow(flow.id); } catch {}
      }
      // 为每个模块创建单步管理员审批流程
      for (const mod of MODULE_OPTIONS) {
        await approvalApi.createFlow({
          flow_name: `${mod.label}（系统管理）`,
          module: mod.value,
          description: '默认由系统管理员统一审批',
          is_default: 1,
          steps: [{ step: 1, name: '系统管理员审批', role: 'admin', description: '由系统管理员统一审批' }]
        });
      }
      message.success('已初始化为系统管理审批模式');
      fetchFlows();
    } catch (err: any) {
      message.error(err.message || '初始化失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      const data = {
        ...values,
        is_default: values.is_default ? 1 : 0,
        steps: values.steps.map((s: any, i: number) => ({ ...s, step: i + 1 }))
      };
      if (editingFlow) {
        await approvalApi.updateFlow(editingFlow.id, data);
        message.success('更新成功');
      } else {
        await approvalApi.createFlow(data);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchFlows();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '操作失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    const steps = form.getFieldValue('steps') || [];
    if (toIndex < 0 || toIndex >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, moved);
    const renumbered = newSteps.map((s: any, i: number) => ({ ...s, step: i + 1 }));
    form.setFieldsValue({ steps: renumbered });
  };

  const getModuleLabel = (value: string) => {
    const item = MODULE_OPTIONS.find(o => o.value === value);
    return item ? item.label : value;
  };

  const columns = [
    {
      title: '流程名称',
      dataIndex: 'flow_name',
      key: 'flow_name'
    },
    {
      title: '适用模块',
      dataIndex: 'module',
      key: 'module',
      render: (module: string) => <Tag color="blue">{getModuleLabel(module)}</Tag>
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    },
    {
      title: '审批步骤',
      key: 'steps',
      width: 280,
      render: (_: any, record: ApprovalFlow) => (
        <Space size={[4, 4]} wrap>
          {(record.steps || []).map((s: any, i: number) => (
            <Tag key={i} color={i === 0 ? 'blue' : 'geekblue'}>
              {i + 1}. {s.name} ({getRoleLabel(s.role)})
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: '是否默认',
      dataIndex: 'is_default',
      key: 'is_default',
      render: (isDefault: number) => isDefault === 1
        ? <Tag color="green">是</Tag>
        : <Tag>否</Tag>
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: ApprovalFlow) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm
            title="确定删除此审批流程？"
            description="删除后无法恢复，若流程正在使用中则无法删除"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
          {record.is_default !== 1 && (
            <Tooltip title="设为该模块默认流程">
              <Button
                type="link"
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleSetDefault(record)}
              >
                设为默认
              </Button>
            </Tooltip>
          )}
          {record.is_default === 1 && (
            <Button type="link" size="small" icon={<StarFilled />} disabled style={{ color: '#faad14' }}>
              默认
            </Button>
          )}
        </Space>
      )
    }
  ];

  const canAccess = user && (user.role === 'admin' || user.role === 'doc_controller');

  if (!canAccess) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <h3>无权限访问</h3>
          <p>仅有管理员或文控人员可以访问此页面</p>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card
        title="审批流程配置"
        extra={
          <Space>
            <Popconfirm
              title="确定初始化为系统管理审批？"
              description="将删除所有现有流程，为每个模块创建单步管理员审批流程"
              onConfirm={handleInitSystemApproval}
              okText="确定"
              cancelText="取消"
            >
              <Button loading={submitLoading} icon={<StarFilled />}>
                一键初始化系统管理审批
              </Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新建审批流程
            </Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="approval_config"
          columns={columns}
          dataSource={flows}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal title={editingFlow ? '编辑审批流程' : '新建审批流程'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} confirmLoading={submitLoading} destroyOnHidden
       className="modal-md">
        <Form form={form} layout="vertical">
          <Form.Item
            name="flow_name"
            label="流程名称"
            rules={[{ required: true, message: '请输入流程名称' }]}
          >
            <Input placeholder="请输入流程名称" />
          </Form.Item>

          <Form.Item
            name="module"
            label="适用模块"
            rules={[{ required: true, message: '请选择适用模块' }]}
          >
            <Select
              placeholder="请选择适用模块"
              showSearch
              optionFilterProp="label"
              options={MODULE_OPTIONS}
            />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="请输入流程描述" />
          </Form.Item>

          <Form.Item name="is_default" label="是否设为默认流程" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Divider orientation="left">审批步骤</Divider>

          <Form.List name="steps">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <Card
                    key={`${field.key}-${index}`}
                    size="small"
                    title={`步骤 ${index + 1}`}
                    style={{ marginBottom: 12 }}
                    extra={
                      <Space>
                        <Tooltip title="上移">
                          <Button
                            type="text"
                            size="small"
                            icon={<ArrowUpOutlined />}
                            disabled={index === 0}
                            onClick={() => moveStep(index, index - 1)}
                          />
                        </Tooltip>
                        <Tooltip title="下移">
                          <Button
                            type="text"
                            size="small"
                            icon={<ArrowDownOutlined />}
                            disabled={index === fields.length - 1}
                            onClick={() => moveStep(index, index + 1)}
                          />
                        </Tooltip>
                        {fields.length > 1 && (
                          <Tooltip title="删除步骤">
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => remove(field.name)}
                            />
                          </Tooltip>
                        )}
                      </Space>
                    }
                  >
                    <Form.Item
                      name={[field.name, 'name']}
                      label="步骤名称"
                      rules={[{ required: true, message: '请输入步骤名称' }]}
                    >
                      <Input placeholder="如：部门经理审批" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'role']}
                      label="审批角色"
                      rules={[{ required: true, message: '请选择审批角色' }]}
                    >
                      <Select
                        placeholder="请选择审批角色"
                        showSearch
                        optionFilterProp="label"
                        options={roleOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'description']}
                      label="步骤说明"
                    >
                      <TextArea rows={2} placeholder="请输入步骤说明（可选）" />
                    </Form.Item>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ step: fields.length + 1, name: '', role: '', description: '' })}
                  block
                  icon={<PlusOutlined />}
                >
                  添加步骤
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default ApprovalConfig;
