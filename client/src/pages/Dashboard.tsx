import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Spin, Button, Typography, Space, List } from 'antd';
import { ProjectOutlined, AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { projectApi, qmsApi, approvalApi } from '@/api';
import { Project, OPLRecord, ApprovalRecord, STATUS_MAP } from '@/types';
import { useAppStore } from '@/store';
import { ResizableTable } from '../components/ResizableTable';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

const { Text } = Typography;

const MODULE_ROUTE_MAP: Record<string, string> = {
  project_plan: '/plans/',
  acceptance_form: '/acceptance/forms/',
  acceptance_plan: '/acceptance/plans/',
  improvement: '/improvement/',
};

const MODULE_NAME_MAP: Record<string, string> = {
  project_plan: '项目计划',
  acceptance_form: '验收单',
  acceptance_plan: '验收计划',
  improvement: '持续改进',
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [openOpls, setOpenOpls] = useState<OPLRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRecord[]>([]);
  const [totalOplCount, setTotalOplCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const extractList = (res: any): { list: any[]; total: number } => {
    if (Array.isArray(res)) {
      return { list: res, total: res.length };
    }
    if (res && typeof res === 'object') {
      const list = res.list || res.items || res.records || res.rows || [];
      const total = typeof res.total === 'number' ? res.total : list.length;
      return { list, total };
    }
    return { list: [], total: 0 };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectRes, oplRes, approvalRes] = await Promise.allSettled([
        projectApi.list({ page_size: 1000 }),
        qmsApi.oplList({ status: 'open', page_size: 5 }),
        approvalApi.myPending(),
      ]);

      if (projectRes.status === 'fulfilled') {
        const { list } = extractList(projectRes.value);
        setProjects(list);
      }

      if (oplRes.status === 'fulfilled') {
        const { list, total } = extractList(oplRes.value);
        setOpenOpls(list.slice(0, 5));
        setTotalOplCount(total);
      }

      if (approvalRes.status === 'fulfilled') {
        const { list } = extractList(approvalRes.value);
        setPendingApprovals(list);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const totalProjects = projects.length;
  const inProgressProjects = projects.filter(p => p.status === 'in_progress').length;
  const openOplCount = totalOplCount;
  const pendingApprovalCount = pendingApprovals.length;

  const recentProjects = [...projects]
    .sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf())
    .slice(0, 5);

  const projectColumns = [
    {
      title: '项目编号',
      dataIndex: 'project_code',
      key: 'project_code',
      width: 130,
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      render: (text: string, record: Project) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/projects/${record.id}`)}>
          {text}
        </Button>
      ),
    },
    {
      title: '项目类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 140,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const s = STATUS_MAP[status];
        return <Tag color={s?.color || 'default'}>{s?.label || status}</Tag>;
      },
    },
    {
      title: '项目经理',
      dataIndex: 'project_manager_name',
      key: 'project_manager_name',
      width: 100,
    },
  ];

  const oplColumns = [
    {
      title: '发生日期',
      dataIndex: 'occurrence_date',
      key: 'occurrence_date',
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '所属项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      ellipsis: true,
    },
    {
      title: '问题描述',
      dataIndex: 'problem_description',
      key: 'problem_description',
      ellipsis: true,
      render: (text: string) => (
        <Text ellipsis={{ tooltip: text }} style={{ maxWidth: 200 }}>
          {text}
        </Text>
      ),
    },
    {
      title: '责任部门',
      dataIndex: 'responsible_dept',
      key: 'responsible_dept',
      width: 100,
    },
    {
      title: '责任人',
      dataIndex: 'responsible_person_name',
      key: 'responsible_person_name',
      width: 90,
    },
  ];

  const handleApprovalClick = (record: ApprovalRecord) => {
    const routePrefix = MODULE_ROUTE_MAP[record.module];
    if (routePrefix) {
      navigate(`${routePrefix}${record.record_id}`);
    }
  };

  return (
    <Spin spinning={loading}>
      <div style={{ padding: '24px' }}>
        <Card style={{ marginBottom: 24 }}>
          <Space size="large" align="center">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                欢迎回来, {user?.name || '用户'}!
              </Typography.Title>
              <Text type="secondary">
                今天是 {dayjs().format('YYYY年MM月DD日 dddd')}
                {user?.department ? ` · ${user.department}` : ''}
              </Text>
            </div>
          </Space>
        </Card>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="项目总数"
                value={totalProjects}
                prefix={<ProjectOutlined />}
                valueStyle={{ color: '#1677ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="进行中项目"
                value={inProgressProjects}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="待处理OPL"
                value={openOplCount}
                prefix={<AlertOutlined />}
                valueStyle={{ color: '#f5222d' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="待我审批"
                value={pendingApprovalCount}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="最新项目" extra={<Button type="link" onClick={() => navigate('/projects')}>查看全部</Button>}>
              <ResizableTable
                tableKey="dashboard_recent_projects"
                columns={projectColumns}
                dataSource={recentProjects}
                rowKey="id"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="待处理OPL" extra={<Button type="link" onClick={() => navigate('/qms/opl')}>查看全部</Button>}>
              <ResizableTable
                tableKey="dashboard_opl"
                columns={oplColumns}
                dataSource={openOpls}
                rowKey="id"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        </Row>

        <Card title="待我审批">
          {pendingApprovals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              暂无待审批事项
            </div>
          ) : (
            <List
              dataSource={pendingApprovals}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      type="primary"
                      size="small"
                      icon={<ArrowRightOutlined />}
                      onClick={() => handleApprovalClick(item)}
                    >
                      去处理
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Tag color="purple">{MODULE_NAME_MAP[item.module] || item.module}</Tag>
                        <Text>记录ID: {item.record_id}</Text>
                      </Space>
                    }
                    description={
                      <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                        <Text type="secondary">提交人: {item.submitter_name || '-'}</Text>
                        <Text type="secondary">
                          提交时间: {item.submitted_at ? dayjs(item.submitted_at).format('YYYY-MM-DD HH:mm') : '-'}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </Spin>
  );
};

export default Dashboard;
