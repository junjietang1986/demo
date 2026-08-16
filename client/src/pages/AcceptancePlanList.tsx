import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Tag, Space, Card, Row, Col,
  Popconfirm, App, Checkbox, Divider
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined
} from '@ant-design/icons';
import { acceptanceApi, projectApi } from '@/api';
import { AcceptancePlan, Project, STATUS_MAP } from '@/types';
import FeishuUserSelect from '@/components/FeishuUserSelect';
import { ResizableTable } from '../components/ResizableTable';
import dayjs from 'dayjs';

const ITEM_TYPE_OPTIONS = [
  { value: 'MSA', label: 'MSA', color: 'blue' },
  { value: 'MFU', label: 'MFU', color: 'green' },
  { value: 'ESD', label: 'ESD', color: 'purple' },
  { value: 'stress', label: '应力测试', color: 'magenta' },
  { value: 'EHS', label: 'EHS', color: 'red' },
  { value: 'error_proofing', label: '防错防呆', color: 'orange' },
  { value: 'pre_acceptance', label: '预验收', color: 'cyan' },
  { value: 'custom', label: '自定义', color: 'default' }
];

const AcceptancePlanList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AcceptancePlan[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [noPlanModalVisible, setNoPlanModalVisible] = useState(false);
  const [projectsWithoutPlan, setProjectsWithoutPlan] = useState<Project[]>([]);
  const [createForm] = Form.useForm();
  const [filters, setFilters] = useState<{
    project_id?: number;
    status?: string;
  }>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.project_id) params.project_id = filters.project_id;
      if (filters.status) params.status = filters.status;
      const res = await acceptanceApi.plans(params);
      setData(Array.isArray(res) ? res : (res.list || []));
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await projectApi.list();
      setProjects(Array.isArray(res) ? res : (res.list || []));
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const fetchProjectsWithoutPlan = async () => {
    try {
      const allProjects = await projectApi.list();
      const plans = await acceptanceApi.plans();
      const planProjectIds = new Set((Array.isArray(plans) ? plans : (plans.list || [])).map((p: AcceptancePlan) => p.project_id));
      const without = (Array.isArray(allProjects) ? allProjects : (allProjects.list || [])).filter(
        (p: Project) => !planProjectIds.has(p.id)
      );
      setProjectsWithoutPlan(without);
      setNoPlanModalVisible(true);
    } catch (err: any) {
      message.error(err?.message || '加载项目失败');
    }
  };

  useEffect(() => {
    fetchData();
    fetchProjects();
  }, []);

  const handleReset = () => {
    setFilters({});
  };

  const handleSearch = () => {
    fetchData();
  };

  const handleDelete = async (id: number) => {
    try {
      await acceptanceApi.deletePlan(id);
      message.success('删除成功');
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '删除失败');
    }
  };

  const handleCreatePlan = async (projectId?: number) => {
    try {
      const values = await createForm.validateFields();
      const payload: any = {
        project_id: projectId || values.project_id,
        plan_name: values.plan_name,
        start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
        items: (values.items || []).map((item: any, idx: number) => ({
          item_name: item.item_name,
          item_type: item.item_type,
          assignee_id: item.assignee_id,
          planned_date: item.planned_date ? item.planned_date.format('YYYY-MM-DD') : null,
          deliverable_required: item.deliverable_required ? 1 : 0,
          sort_order: idx
        }))
      };
      const res = await acceptanceApi.createPlan(payload);
      message.success('创建成功');
      setCreateModalVisible(false);
      setNoPlanModalVisible(false);
      createForm.resetFields();
      if (res?.id) {
        navigate(`/acceptance/plans/${res.id}`);
      } else {
        fetchData();
      }
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '创建失败');
    }
  };

  const openCreateModal = (projectId?: number) => {
    createForm.resetFields();
    createForm.setFieldsValue({
      project_id: projectId,
      items: [{}]
    });
    setCreateModalVisible(true);
    setNoPlanModalVisible(false);
  };

  const columns = [
    {
      title: '计划名称',
      dataIndex: 'plan_name',
      key: 'plan_name',
      width: 200
    },
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 130
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true
    },
    {
      title: '开始日期',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 120,
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD') : '-'
    },
    {
      title: '结束日期',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 120,
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD') : '-'
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (v: number) => `V${v}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right' as const,
      render: (_: any, record: AcceptancePlan) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/acceptance/plans/${record.id}`)}
          >
            查看
          </Button>
          {record.status === 'draft' && (
            <Popconfirm
              title="确认删除此验收计划？"
              onConfirm={() => handleDelete(record.id)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Select
              placeholder="选择项目"
              style={{ width: 220 }}
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.project_id}
              onChange={v => setFilters({ ...filters, project_id: v })}
              options={projects.map(p => ({
                value: p.id,
                label: `${p.project_code} - ${p.project_name}`
              }))}
            />
          </Col>
          <Col>
            <Select
              placeholder="选择状态"
              style={{ width: 140 }}
              allowClear
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              value={filters.status}
              onChange={v => setFilters({ ...filters, status: v })}
              options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </Col>
          <Col>
            <Space>
              <Button type="primary" onClick={handleSearch}>查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title="验收计划管理"
        extra={
          <Space>
            <Button onClick={fetchProjectsWithoutPlan}>
              未创建验收计划的项目
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal()}>
              新建验收计划
            </Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="acceptance_plan_list"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal title="新建验收计划" open={createModalVisible} onOk={() => handleCreatePlan()} onCancel={() => { setCreateModalVisible(false); createForm.resetFields(); }} destroyOnHidden
         okText="创建" cancelText="取消" className="modal-lg">
        <Form form={createForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_id"
                label="选择项目"
                rules={[{ required: true, message: '请选择项目' }]}
              >
                <Select
                  placeholder="请选择项目"
                  showSearch
                  filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                  options={projects.map(p => ({
                    value: p.id,
                    label: `${p.project_code} - ${p.project_name} (${p.project_type})`
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="plan_name"
                label="计划名称"
                rules={[{ required: true, message: '请输入计划名称' }]}
              >
                <Input placeholder="请输入计划名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="start_date" label="开始日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="end_date" label="结束日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">验收项目</Divider>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }, idx) => (
                  <Card
                    key={key}
                    size="small"
                    title={`验收项 ${idx + 1}`}
                    extra={
                      fields.length > 1 && (
                        <Button type="link" danger size="small" onClick={() => remove(name)}>
                          删除
                        </Button>
                      )
                    }
                    style={{ marginBottom: 12 }}
                  >
                    <Row gutter={12}>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'item_type']}
                          label="项目类型"
                          rules={[{ required: true, message: '请选择类型' }]}
                        >
                          <Select
                            placeholder="选择类型"
                            showSearch
                            filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                            options={ITEM_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'item_name']}
                          label="项目名称"
                          rules={[{ required: true, message: '请输入名称' }]}
                        >
                          <Input placeholder="项目名称" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'assignee_id']}
                          label="负责人"
                        >
                          <FeishuUserSelect
                            placeholder="选择负责人"
                            allowClear
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={12}>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'planned_date']}
                          label="计划日期"
                        >
                          <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, 'deliverable_required']}
                          label="需要交付物"
                          valuePropName="checked"
                          initialValue={true}
                        >
                          <Checkbox>是</Checkbox>
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ deliverable_required: true })}
                  block
                  icon={<PlusOutlined />}
                >
                  添加验收项
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal title="未创建验收计划的项目" open={noPlanModalVisible} onCancel={() => setNoPlanModalVisible(false)} footer={null} className="modal-md">
        {projectsWithoutPlan.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>所有项目均已创建验收计划</div>
        ) : (
          <ResizableTable
            tableKey="acceptance_plan_projects_without_plan"
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { title: '项目编号', dataIndex: 'project_code', key: 'project_code', width: 130 },
              { title: '项目名称', dataIndex: 'project_name', key: 'project_name' },
              { title: '项目类型', dataIndex: 'project_type', key: 'project_type', width: 140 },
              {
                title: '操作',
                key: 'actions',
                width: 100,
                render: (_: any, record: Project) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => openCreateModal(record.id)}
                  >
                    创建计划
                  </Button>
                )
              }
            ]}
            dataSource={projectsWithoutPlan}
          />
        )}
      </Modal>
    </div>
  );
};

export default AcceptancePlanList;
