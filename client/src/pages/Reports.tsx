import React, { useEffect, useState } from 'react';
import {
  Table, Button, Card, Tabs, Select, DatePicker, Row, Col, Statistic, Segmented,
  Space, Tag, Progress, App, Descriptions
} from 'antd';
import {
  DownloadOutlined, ReloadOutlined, BarChartOutlined
} from '@ant-design/icons';
import { reportApi, qmsApi, projectApi } from '@/api';
import { OPLRecord, AnomalyRecord, Project, DEPARTMENTS } from '@/types';
import dayjs from 'dayjs';
import DepartmentSelect from '@/components/DepartmentSelect';
import { ResizableTable } from '@/components/ResizableTable';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface ReportStats {
  total: number;
  open: number;
  closed: number;
  closeRate: number;
  byStatus: { name: string; count: number }[];
  byDept: { name: string; count: number }[];
  byType?: { name: string; count: number }[];
  byMonth: { month: string; count: number }[];
  records: any[];
}

interface ProjectReport {
  project: Project;
  planProgress: number;
  oplCount: number;
  oplClosed: number;
  anomalyCount: number;
  anomalyClosed: number;
  acceptanceStatus: string;
  taskStats?: { total: number; completed: number; inProgress: number };
}

const Reports: React.FC = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('opl');
  const [period, setPeriod] = useState<string>('month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'), dayjs().endOf('month')
  ]);
  const [selectedDept, setSelectedDept] = useState<string | undefined>();
  const [selectedProject, setSelectedProject] = useState<number | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [projectReport, setProjectReport] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    fetchProjects();
    setDefaultDateRange();
  }, []);

  useEffect(() => {
    setDefaultDateRange();
  }, [period]);

  const fetchProjects = async () => {
    try {
      const res = await projectApi.list({ page_size: 100 });
      setProjects(Array.isArray(res) ? res : (res.list || []));
    } catch (err) {
      console.error('Failed to fetch projects', err);
    }
  };

  const setDefaultDateRange = () => {
    let start: dayjs.Dayjs, end: dayjs.Dayjs;
    const now = dayjs();
    if (period === 'month') {
      start = now.startOf('month');
      end = now.endOf('month');
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.month() / 3);
      start = now.month(quarter * 3).startOf('month');
      end = now.month(quarter * 3 + 2).endOf('month');
    } else {
      start = now.startOf('year');
      end = now.endOf('year');
    }
    setDateRange([start, end]);
  };

  const fetchReport = async () => {
    if (!dateRange) {
      message.warning('请选择日期范围');
      return;
    }
    setLoading(true);
    try {
      const params: any = {
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD')
      };
      if (selectedDept) params.responsible_dept = selectedDept;
      if (selectedProject) params.project_id = selectedProject;

      let res;
      if (activeTab === 'opl') {
        res = await reportApi.oplReport(params);
      } else if (activeTab === 'anomaly') {
        res = await reportApi.anomalyReport(params);
      }
      setStats({
        total: res.summary?.total || 0,
        open: res.summary?.open_count || 0,
        closed: res.summary?.closed_count || 0,
        closeRate: res.summary?.close_rate || 0,
        byStatus: res.by_status || res.byStatus || [],
        byDept: res.by_department || res.byDept || [],
        byType: res.by_type || res.byType,
        byMonth: res.by_month || res.byMonth || [],
        records: res.records || []
      });
    } catch (err: any) {
      message.error(err.message || '获取报表数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectReport = async () => {
    if (!selectedProjectId) {
      message.warning('请选择项目');
      return;
    }
    setLoading(true);
    try {
      const res = await reportApi.projectReport(selectedProjectId);
      setProjectReport({
        project: res.project,
        planProgress: res.plan_summary?.progress || 0,
        oplCount: res.opl_summary?.total || 0,
        oplClosed: res.opl_summary?.closed || 0,
        anomalyCount: res.anomaly_summary?.total || 0,
        anomalyClosed: res.anomaly_summary?.closed || 0,
        acceptanceStatus: res.acceptance?.status === '验收通过' ? 'passed' : (res.acceptance?.status === '未验收' ? 'pending' : 'in_progress'),
        taskStats: res.plan_summary?.latest_plan ? {
          total: res.plan_summary.latest_plan.task_count || 0,
          completed: res.plan_summary.latest_plan.completed_tasks || 0,
          inProgress: res.plan_summary.latest_plan.in_progress_tasks || 0
        } : undefined
      });
    } catch (err: any) {
      message.error(err.message || '获取项目报表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'opl' || activeTab === 'anomaly') {
      fetchReport();
    }
  }, [activeTab]);

  const handleExport = async () => {
    if (!dateRange) return;
    setExportLoading(true);
    try {
      const params: any = {
        start_date: dateRange[0].format('YYYY-MM-DD'),
        end_date: dateRange[1].format('YYYY-MM-DD')
      };
      if (selectedDept) params.responsible_dept = selectedDept;
      if (selectedProject) params.project_id = selectedProject;

      let blob;
      let filename;
      if (activeTab === 'opl') {
        blob = await reportApi.exportOpl(params, 'xlsx');
        filename = `OPL报表_${dayjs().format('YYYYMMDD')}.xlsx`;
      } else if (activeTab === 'anomaly') {
        blob = await reportApi.exportAnomaly(params, 'xlsx');
        filename = `异常报表_${dayjs().format('YYYYMMDD')}.xlsx`;
      } else {
        return;
      }

      const url = window.URL.createObjectURL(new Blob([blob as any]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err: any) {
      message.error(err.message || '导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  const renderHorizontalBarChart = (data: { name: string; count: number }[], colors: string[]) => {
    if (!data || data.length === 0) return <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>;
    const maxCount = Math.max(...data.map(d => d.count), 1);
    return (
      <div style={{ padding: '8px 0' }}>
        {data.map((item, index) => (
          <div key={item.name} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{item.name}</span>
              <span style={{ fontWeight: 'bold' }}>{item.count}</span>
            </div>
            <div style={{ background: '#f0f0f0', borderRadius: 4, height: 24, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(item.count / maxCount) * 100}%`,
                  height: '100%',
                  background: colors[index % colors.length],
                  borderRadius: 4,
                  transition: 'width 0.5s ease'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderVerticalBarChart = (data: { name: string; count: number }[]) => {
    if (!data || data.length === 0) return <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>;
    const maxCount = Math.max(...data.map(d => d.count), 1);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 200, padding: '0 8px', gap: 8 }}>
        {data.map((item) => (
          <div key={item.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 'bold' }}>{item.count}</div>
            <div
              style={{
                width: '100%',
                maxWidth: 40,
                height: `${(item.count / maxCount) * 160}px`,
                background: '#1890ff',
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.5s ease'
              }}
            />
            <div style={{ fontSize: 11, marginTop: 4, textAlign: 'center', wordBreak: 'break-all' }}>{item.name}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderTrendChart = (data: { month: string; count: number }[]) => {
    if (!data || data.length === 0) return <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无数据</div>;
    const maxCount = Math.max(...data.map(d => d.count), 1);
    return (
      <div style={{ position: 'relative', height: 220, padding: '20px 10px' }}>
        <svg width="100%" height="180" style={{ position: 'absolute', top: 20, left: 0 }}>
          <polyline
            fill="none"
            stroke="#1890ff"
            strokeWidth="2"
            points={data.map((d, i) => {
              const x = (i / Math.max(data.length - 1, 1)) * 100 + '%';
              const y = 160 - (d.count / maxCount) * 140;
              return `${x},${y}`;
            }).join(' ')}
          />
          {data.map((d, i) => {
            const x = (i / Math.max(data.length - 1, 1)) * 100;
            const y = 160 - (d.count / maxCount) * 140;
            return (
              <g key={d.month}>
                <circle cx={`${x}%`} cy={y} r="5" fill="#1890ff" />
                <text x={`${x}%`} y={y - 10} textAnchor="middle" fontSize="11" fill="#666">{d.count}</text>
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 11, color: '#666' }}>
          {data.map(d => (
            <span key={d.month}>{d.month}</span>
          ))}
        </div>
      </div>
    );
  };

  const oplColumns = [
    { title: 'OPL编号', dataIndex: 'id', key: 'id', width: 80 },
    { title: '发生日期', dataIndex: 'occurrence_date', key: 'occurrence_date', width: 110, render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
    { title: '项目', dataIndex: 'project_name', key: 'project_name', width: 150, ellipsis: true },
    { title: '责任部门', dataIndex: 'responsible_dept', key: 'responsible_dept', width: 110, render: (d: string) => <Tag>{d}</Tag> },
    { title: '责任人', dataIndex: 'responsible_person_name', key: 'responsible_person_name', width: 90 },
    { title: '问题描述', dataIndex: 'problem_description', key: 'problem_description', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => (
      <Tag color={s === 'closed' ? 'success' : 'warning'}>{s === 'closed' ? '已关闭' : '待处理'}</Tag>
    )}
  ];

  const anomalyColumns = [
    { title: '异常编号', dataIndex: 'id', key: 'id', width: 80 },
    { title: '发生日期', dataIndex: 'occurrence_date', key: 'occurrence_date', width: 110, render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
    { title: '异常类型', dataIndex: 'anomaly_type', key: 'anomaly_type', width: 120, render: (t: string) => <Tag color="orange">{t}</Tag> },
    { title: '项目', dataIndex: 'project_name', key: 'project_name', width: 150, ellipsis: true },
    { title: '责任部门', dataIndex: 'responsible_dept', key: 'responsible_dept', width: 110, render: (d: string) => <Tag>{d}</Tag> },
    { title: '问题描述', dataIndex: 'problem_description', key: 'problem_description', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => (
      <Tag color={s === 'closed' ? 'success' : 'warning'}>{s === 'closed' ? '已关闭' : '待处理'}</Tag>
    )}
  ];

  const renderFilterBar = () => (
    <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
      <Col>
        <Segmented
          value={period}
          onChange={setPeriod as any}
          options={[
            { label: '月', value: 'month' },
            { label: '季', value: 'quarter' },
            { label: '年', value: 'year' }
          ]}
        />
      </Col>
      <Col>
        <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)} />
      </Col>
      <Col>
        <DepartmentSelect
          placeholder="责任部门"
          style={{ width: 140 }}
          allowClear
          value={selectedDept}
          onChange={setSelectedDept}
        />
      </Col>
      <Col>
        <Select
          placeholder="选择项目"
          style={{ width: 180 }}
          allowClear
          value={selectedProject}
          onChange={setSelectedProject}
          showSearch
          filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
        >
          {projects.map(p => <Option key={p.id} value={p.id}>{p.project_name}</Option>)}
        </Select>
      </Col>
      <Col>
        <Space>
          <Button type="primary" icon={<BarChartOutlined />} onClick={fetchReport} loading={loading}>
            生成报表
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exportLoading}>
            导出Excel
          </Button>
        </Space>
      </Col>
    </Row>
  );

  const renderStatsCards = () => {
    if (!stats) return null;
    const items = activeTab === 'opl'
      ? [
          { title: '总OPL数', value: stats.total || 0, color: '#1890ff' },
          { title: '已关闭', value: stats.closed || 0, color: '#52c41a' },
          { title: '待处理', value: stats.open || 0, color: '#faad14' },
          { title: '关闭率', value: `${(stats.closeRate ?? 0).toFixed(1)}%`, color: '#722ed1' }
        ]
      : [
          { title: '总异常数', value: stats.total || 0, color: '#1890ff' },
          { title: '已关闭', value: stats.closed || 0, color: '#52c41a' },
          { title: '待处理', value: stats.open || 0, color: '#faad14' },
          { title: '关闭率', value: `${(stats.closeRate ?? 0).toFixed(1)}%`, color: '#722ed1' }
        ];
    return (
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {items.map(item => (
          <Col span={6} key={item.title}>
            <Card>
              <Statistic title={item.title} value={item.value} valueStyle={{ color: item.color }} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  };

  const renderCharts = () => {
    if (!stats) return null;
    return (
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card title="按状态分布" size="small">
            {renderHorizontalBarChart(
              stats.byStatus || [
                { name: '待处理', count: stats.open },
                { name: '已关闭', count: stats.closed }
              ],
              ['#faad14', '#52c41a']
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title={activeTab === 'anomaly' ? '按异常类型分布' : '按部门分布'} size="small">
            {activeTab === 'anomaly' && stats.byType
              ? renderHorizontalBarChart(stats.byType, ['#ff7a45', '#ffa940', '#ffc53d', '#ffd666'])
              : renderVerticalBarChart(stats.byDept || [])}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="趋势分析（按月）" size="small">
            {renderTrendChart(stats.byMonth || [])}
          </Card>
        </Col>
      </Row>
    );
  };

  const renderOplTab = () => (
    <div>
      {renderFilterBar()}
      {renderStatsCards()}
      {renderCharts()}
      <Card title="明细数据">
        <ResizableTable
          tableKey="report_opl"
          columns={oplColumns}
          dataSource={stats?.records || []}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  );

  const renderAnomalyTab = () => (
    <div>
      {renderFilterBar()}
      {renderStatsCards()}
      {renderCharts()}
      <Card title="明细数据">
        <ResizableTable
          tableKey="report_anomaly"
          columns={anomalyColumns}
          dataSource={stats?.records || []}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  );

  const renderProjectTab = () => (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
        <Col>
          <Select
            placeholder="选择项目"
            style={{ width: 280 }}
            value={selectedProjectId}
            onChange={(v) => { setSelectedProjectId(v); }}
            showSearch
            filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
          >
            {projects.map(p => <Option key={p.id} value={p.id}>{p.project_code} - {p.project_name}</Option>)}
          </Select>
        </Col>
        <Col>
          <Button type="primary" icon={<BarChartOutlined />} onClick={fetchProjectReport} loading={loading}>
            生成报表
          </Button>
        </Col>
      </Row>

      {projectReport && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic title="项目名称" value={projectReport.project.project_name} valueStyle={{ fontSize: 16 }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="项目编号" value={projectReport.project.project_code} valueStyle={{ fontSize: 16 }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="OPL数量"
                  value={projectReport.oplCount}
                  suffix={`/ 已关闭${projectReport.oplClosed}`}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="异常数量"
                  value={projectReport.anomalyCount}
                  suffix={`/ 已关闭${projectReport.anomalyClosed}`}
                  valueStyle={{ color: '#ff7a45' }}
                />
              </Card>
            </Col>
          </Row>

          <Card title="项目计划进度" style={{ marginBottom: 16 }}>
            <Progress
              percent={Math.round(projectReport.planProgress)}
              status={projectReport.planProgress === 100 ? 'success' : 'active'}
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
            />
            {projectReport.taskStats && (
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Statistic title="总任务数" value={projectReport.taskStats.total} />
                </Col>
                <Col span={8}>
                  <Statistic title="已完成" value={projectReport.taskStats.completed} valueStyle={{ color: '#52c41a' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="进行中" value={projectReport.taskStats.inProgress} valueStyle={{ color: '#1890ff' }} />
                </Col>
              </Row>
            )}
          </Card>

          <Card title="验收状态">
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="项目状态">
                <Tag color={projectReport.project.status === 'completed' ? 'success' : 'processing'}>
                  {projectReport.project.status === 'completed' ? '已完成' : '进行中'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="验收状态">
                <Tag color={projectReport.acceptanceStatus === 'passed' ? 'success' : 'warning'}>
                  {projectReport.acceptanceStatus === 'passed' ? '已通过' : '未验收'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="项目经理">{projectReport.project.project_manager_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="客户">{projectReport.project.customer || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}
    </div>
  );

  const tabItems = [
    { key: 'opl', label: 'OPL报表', children: renderOplTab() },
    { key: 'anomaly', label: '异常报表', children: renderAnomalyTab() },
    { key: 'project', label: '项目报表', children: renderProjectTab() }
  ];

  return (
    <div>
      <Card title="报表中心">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} destroyOnHidden />
      </Card>
    </div>
  );
};

export default Reports;
