import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Space, Card, Row, Col, Popconfirm, App, Descriptions, Tabs, Breadcrumb, Drawer, Tooltip, Progress, DatePicker, Radio, Badge, Empty, Divider, Steps, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ArrowLeftOutlined, FileAddOutlined, ScheduleOutlined, CheckSquareOutlined, HistoryOutlined, AuditOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined, FlagOutlined, SafetyCertificateOutlined, ExperimentOutlined, ControlOutlined, FundOutlined, FileTextOutlined, ClusterOutlined, BranchesOutlined, ApiOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { projectApi, planApi, acceptanceApi, userApi, qmsApi, impexpApi, customerApi, qualityApi } from '@/api';
import { Project, Workstation, ProjectPlan, User, PROJECT_TYPES, STATUS_MAP, DEPARTMENTS, OPLRecord, AnomalyRecord, AcceptanceForm, AcceptancePlan } from '@/types';
import ImportExportToolbar from '@/components/ImportExportToolbar';
import FeishuUserSelect from '@/components/FeishuUserSelect';
import DepartmentSelect from '@/components/DepartmentSelect';
import AttachmentUploader from '@/components/AttachmentUploader';
import { ResizableTable } from '../components/ResizableTable';
import { getUserDisplayName } from '@/utils/userHelper';
import BomTab from './project/BomTab';
import FmeaTab from './project/FmeaTab';
import DvprTab from './project/DvprTab';
import ControlPlanTab from './project/ControlPlanTab';
import EcoTab from './project/EcoTab';
import PpapTab from './project/PpapTab';
import MsaTab from './project/MsaTab';
import SpcTab from './project/SpcTab';
import VdaTab from './project/VdaTab';
import EightdTab from './project/EightdTab';
import VersionTab from './project/VersionTab';

const { Option } = Select;
const { TextArea } = Input;

const ProjectDetail: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = parseInt(id || '0');

  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('basic');

  const [workstationModalVisible, setWorkstationModalVisible] = useState(false);
  const [workstationModalTitle, setWorkstationModalTitle] = useState('添加工位');
  const [editingWorkstation, setEditingWorkstation] = useState<Workstation | null>(null);
  const [workstationForm] = Form.useForm();

  const [plans, setPlans] = useState<ProjectPlan[]>([]);
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [planForm] = Form.useForm();
  const [planVersionsMap, setPlanVersionsMap] = useState<Record<number, any[]>>({});
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionPreview, setVersionPreview] = useState<any>(null);

  const [apqpPhases, setApqpPhases] = useState<any[]>([]);
  const [apqpGates, setApqpGates] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [gateModalVisible, setGateModalVisible] = useState(false);
  const [gateReadOnly, setGateReadOnly] = useState(false);
  const [gatePhase, setGatePhase] = useState<any>(null);
  const [gateForm] = Form.useForm();
  const [gateDraft, setGateDraft] = useState<any>(null);
  const [gateCheckitemAttachments, setGateCheckitemAttachments] = useState<Record<number, any[]>>({});
  const [riskModalVisible, setRiskModalVisible] = useState(false);
  const [editingRisk, setEditingRisk] = useState<any>(null);
  const [riskForm] = Form.useForm();

  const [opls, setOpls] = useState<OPLRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);

  const [acceptanceForms, setAcceptanceForms] = useState<AcceptanceForm[]>([]);
  const [acceptancePlans, setAcceptancePlans] = useState<AcceptancePlan[]>([]);
  const [vocAttachments, setVocAttachments] = useState<any[]>([]);

  const fetchVocAttachments = async () => {
    if (!projectId) return;
    try {
      const res = await projectApi.listVocAttachments(projectId);
      setVocAttachments(Array.isArray(res) ? res : []);
    } catch (_e) { /* ignore */ }
  };

  const handleVocUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await projectApi.uploadVocAttachment(projectId, fd);
    setVocAttachments(prev => [res, ...prev]);
    return res;
  };

  const handleVocDelete = async (attachId: number) => {
    await projectApi.deleteVocAttachment(attachId);
    setVocAttachments(prev => prev.filter(a => a.id !== attachId));
  };

  const fetchProject = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await projectApi.get(projectId);
      setProject(res);
      setApqpPhases(res.apqp_phases || []);
      setApqpGates(res.apqp_gates || []);
      setRisks(res.risks || []);
      await fetchVocAttachments();

      const shouldOpenEdit = searchParams.get('new') === '1' || searchParams.get('edit') === '1';
      if (shouldOpenEdit) {
        editForm.setFieldsValue({
          ...res,
          kickoff_date: res.kickoff_date ? dayjs(res.kickoff_date) : undefined,
          planned_fat_date: res.planned_fat_date ? dayjs(res.planned_fat_date) : undefined,
          planned_sat_date: res.planned_sat_date ? dayjs(res.planned_sat_date) : undefined,
          planned_sop_date: res.planned_sop_date ? dayjs(res.planned_sop_date) : undefined,
          actual_fat_date: (res as any).actual_fat_date ? dayjs((res as any).actual_fat_date) : undefined,
          actual_sat_date: (res as any).actual_sat_date ? dayjs((res as any).actual_sat_date) : undefined,
          actual_sop_date: (res as any).actual_sop_date ? dayjs((res as any).actual_sop_date) : undefined,
        });
        setEditModalVisible(true);
        searchParams.delete('new');
        searchParams.delete('edit');
        setSearchParams(searchParams);
      }
    } catch (error) {
      message.error('获取项目详情失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const list = await customerApi.list({ is_active: 1 });
      setCustomers(Array.isArray(list) ? list : []);
    } catch (_e) { /* ignore */ }
  };

  const fetchUsers = async () => {
    try {
      const res = await userApi.list();
      setUsers(Array.isArray(res) ? res : (res.list || []));
    } catch (error) {
      console.error('获取用户列表失败', error);
    }
  };

  const formatVersion = (v: number) => 'V' + String(v || 1).padStart(2, '0');

  const fetchPlans = async () => {
    try {
      const res = await planApi.list({ project_id: projectId });
      const list = Array.isArray(res) ? res : (res.list || []);
      setPlans(list);
      if (list.length > 0) {
        setLoadingVersions(true);
        try {
          const results = await Promise.all(
            list.map((p: ProjectPlan) =>
              impexpApi.getVersions('project_plan', p.id)
                .then((r: any) => ({ id: p.id, versions: r?.data || r || [] }))
                .catch(() => ({ id: p.id, versions: [] }))
            )
          );
          const map: Record<number, any[]> = {};
          results.forEach((r: { id: number; versions: any[] }) => { map[r.id] = r.versions; });
          setPlanVersionsMap(map);
        } finally {
          setLoadingVersions(false);
        }
      } else {
        setPlanVersionsMap({});
      }
    } catch (error) {
      console.error('获取项目计划失败', error);
    }
  };

  const handleViewVersion = useCallback((v: any) => {
    try {
      const snap = typeof v.snapshot_data === 'string' ? JSON.parse(v.snapshot_data) : v.snapshot_data;
      setVersionPreview({ ...v, snapshot: snap });
    } catch (_e) {
      message.error('版本数据解析失败');
    }
  }, [message]);

  const flattenedPlanRows = useMemo(() => {
    const rows: any[] = [];
    plans.forEach((plan: ProjectPlan) => {
      rows.push({ ...plan, _isCurrent: true, _rowKey: `current-${plan.id}` });
      const versions = planVersionsMap[plan.id] || [];
      versions.forEach((v: any) => {
        rows.push({
          ...plan,
          ...v,
          _isCurrent: false,
          _rowKey: `history-${v.id}`,
          version: v.version_no || plan.version,
          status: v.status || plan.status,
          created_at: v.created_at || plan.created_at,
          department: v.snapshot_data ? (() => {
            try { const s = typeof v.snapshot_data === 'string' ? JSON.parse(v.snapshot_data) : v.snapshot_data; return s.department || plan.department; } catch { return plan.department; }
          })() : plan.department
        });
      });
    });
    return rows;
  }, [plans, planVersionsMap]);

  const fetchQMS = async () => {
    try {
      const [oplRes, anomalyRes] = await Promise.all([
        qmsApi.oplList({ project_id: projectId }),
        qmsApi.anomalyList({ project_id: projectId })
      ]);
      setOpls(Array.isArray(oplRes) ? oplRes : (oplRes.list || []));
      setAnomalies(Array.isArray(anomalyRes) ? anomalyRes : (anomalyRes.list || []));
    } catch (error) {
      console.error('获取QMS记录失败', error);
    }
  };

  const fetchAcceptance = async () => {
    try {
      const [formRes, planRes] = await Promise.all([
        acceptanceApi.forms({ project_id: projectId }),
        acceptanceApi.plans({ project_id: projectId })
      ]);
      setAcceptanceForms(Array.isArray(formRes) ? formRes : (formRes.list || []));
      setAcceptancePlans(Array.isArray(planRes) ? planRes : (planRes.list || []));
    } catch (error) {
      console.error('获取验收记录失败', error);
    }
  };

  useEffect(() => {
    fetchProject();
    fetchUsers();
    fetchCustomers();
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'plans') fetchPlans();
    if (activeTab === 'qms') fetchQMS();
    if (activeTab === 'acceptance') fetchAcceptance();
  }, [activeTab, projectId]);

  const handleEditProject = () => {
    if (project) {
      editForm.setFieldsValue({
        ...project,
        kickoff_date: project.kickoff_date ? dayjs(project.kickoff_date) : undefined,
        planned_fat_date: project.planned_fat_date ? dayjs(project.planned_fat_date) : undefined,
        planned_sat_date: project.planned_sat_date ? dayjs(project.planned_sat_date) : undefined,
        planned_sop_date: project.planned_sop_date ? dayjs(project.planned_sop_date) : undefined,
        actual_fat_date: (project as any).actual_fat_date ? dayjs((project as any).actual_fat_date) : undefined,
        actual_sat_date: (project as any).actual_sat_date ? dayjs((project as any).actual_sat_date) : undefined,
        actual_sop_date: (project as any).actual_sop_date ? dayjs((project as any).actual_sop_date) : undefined,
      });
      fetchVocAttachments();
      setEditModalVisible(true);
    }
  };

  const handleEditModalOk = async () => {
    try {
      const values = await editForm.validateFields();
      const payload: any = { ...values };
      ['kickoff_date', 'planned_fat_date', 'planned_sat_date', 'planned_sop_date', 'actual_fat_date', 'actual_sat_date', 'actual_sop_date'].forEach(k => {
        if (payload[k] && payload[k].format) payload[k] = payload[k].format('YYYY-MM-DD');
      });
      await projectApi.update(projectId, payload);
      message.success('更新成功');
      setEditModalVisible(false);
      fetchProject();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleAddWorkstation = () => {
    setEditingWorkstation(null);
    setWorkstationModalTitle('添加工位');
    workstationForm.resetFields();
    setWorkstationModalVisible(true);
  };

  const handleEditWorkstation = (ws: Workstation) => {
    setEditingWorkstation(ws);
    setWorkstationModalTitle('编辑工位');
    workstationForm.setFieldsValue({
      station_code: ws.station_code,
      station_name: ws.station_name,
      description: ws.description,
      sort_order: ws.sort_order,
      mech_designer_id: ws.mech_designer_id,
      elec_designer_id: ws.elec_designer_id,
      meas_control_designer_id: ws.meas_control_designer_id
    });
    setWorkstationModalVisible(true);
  };

  const handleDeleteWorkstation = async (wsId: number) => {
    try {
      await projectApi.deleteWorkstation(wsId);
      message.success('删除成功');
      fetchProject();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleWorkstationModalOk = async () => {
    try {
      const values = await workstationForm.validateFields();
      if (editingWorkstation) {
        await projectApi.updateWorkstation(editingWorkstation.id, values);
        message.success('更新成功');
      } else {
        await projectApi.addWorkstation(projectId, values);
        message.success('添加成功');
      }
      setWorkstationModalVisible(false);
      fetchProject();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleCreatePlan = () => {
    planForm.resetFields();
    setPlanModalVisible(true);
  };

  const handlePlanModalOk = async () => {
    try {
      const values = await planForm.validateFields();
      await planApi.create({ ...values, project_id: projectId });
      message.success('创建计划成功');
      setPlanModalVisible(false);
      fetchPlans();
    } catch (error) {
      message.error('创建失败');
    }
  };

  const handleViewPlan = (planId: number) => {
    navigate(`/plans/${planId}`);
  };

  const handleGenerateAcceptanceForm = async () => {
    try {
      const res = await acceptanceApi.generateForm(projectId);
      const formId = res.id;
      message.success('验收单创建成功');
      navigate(`/acceptance/forms/${formId}`);
    } catch (error) {
      message.error('创建验收单失败');
    }
  };

  const handleCreateAcceptancePlan = () => {
    navigate(`/acceptance/plans/create?project_id=${projectId}`);
  };

  const handleCreateNewProjectPlan = () => {
    setActiveTab('plans');
    setPlanModalVisible(true);
  };

  const phaseColor = (phaseNo: number) => ['#bfbfbf', '#1890ff', '#52c41a', '#fa8c16', '#722ed1'][phaseNo - 1] || '#1890ff';
  const phaseStatus = (phaseNo: number) => {
    const current = project?.apqp_phase || 1;
    if (phaseNo < current) return 'done';
    if (phaseNo === current) return 'process';
    return 'wait';
  };
  const gateOfPhase = (phaseNo: number) => apqpGates.find((g: any) => g.phase_no === phaseNo);
  const healthColor = (s?: string) => s === 'green' ? '#52c41a' : s === 'yellow' ? '#faad14' : s === 'red' ? '#ff4d4f' : '#52c41a';
  const riskLevelColor = (l: string) => l === 'high' ? 'red' : l === 'medium' ? 'orange' : 'green';
  const riskLevelText = (l: string) => l === 'high' ? '高风险' : l === 'medium' ? '中风险' : '低风险';

  const handleOpenGate = async (phase: any) => {
    setGatePhase(phase);
    setGateReadOnly(false);
    try {
      const draft = await projectApi.initGateDraft(projectId, phase.phase_no);
      setGateDraft(draft);
      setGateCheckitemAttachments({});

      if (draft && draft.checkitems) {
        const attachMap: Record<number, any[]> = {};
        for (const ci of draft.checkitems) {
          try {
            const atts = await projectApi.listGateAttachments(draft.id, ci.id);
            attachMap[ci.id] = atts || [];
          } catch (_) {
            attachMap[ci.id] = [];
          }
        }
        setGateCheckitemAttachments(attachMap);
      }

      gateForm.resetFields();
      gateForm.setFieldsValue({
        conclusion: draft?.conclusion || 'approved',
        reviewer_id: draft?.reviewer_id || project?.project_manager_id || null,
        comments: draft?.comments || '',
        conditional_terms: draft?.conditional_terms || '',
        checkitems: (draft.checkitems || []).map((ci: any) => ({
          id: ci.id,
          item_name: ci.item_name,
          status: ci.status === 'pending' ? 'checked' : ci.status,
          remark: ci.remark || ''
        }))
      });
      setGateModalVisible(true);
    } catch (err: any) {
      message.error(err?.message || '初始化门控评审失败');
    }
  };

  const handleViewGate = async (phase: any) => {
    setGatePhase(phase);
    setGateReadOnly(true);
    try {
      const gate = await projectApi.getGateByPhase(projectId, phase.phase_no);
      setGateDraft(gate);
      setGateCheckitemAttachments({});
      if (gate && gate.checkitems) {
        const attachMap: Record<number, any[]> = {};
        for (const ci of gate.checkitems) {
          try {
            const atts = await projectApi.listGateAttachments(gate.id, ci.id);
            attachMap[ci.id] = atts || [];
          } catch (_) {
            attachMap[ci.id] = [];
          }
        }
        setGateCheckitemAttachments(attachMap);
      }
      gateForm.resetFields();
      gateForm.setFieldsValue({
        conclusion: gate?.conclusion || 'approved',
        reviewer_id: gate?.reviewer_id || null,
        comments: gate?.comments || '',
        conditional_terms: gate?.conditional_terms || '',
        checkitems: (gate?.checkitems || []).map((ci: any) => ({
          id: ci.id,
          item_name: ci.item_name,
          status: ci.status === 'pending' ? 'checked' : ci.status,
          remark: ci.remark || ''
        }))
      });
      setGateModalVisible(true);
    } catch (err: any) {
      message.error(err?.message || '获取门控详情失败');
    }
  };

  const handleContinueGate = async (phase: any) => {
    const gate = gateOfPhase(phase.phase_no);
    if (gate && gate.gate_status === 'draft') {
      handleOpenGate(phase);
    } else {
      handleOpenGate(phase);
    }
  };

  const handleGateUpload = async (checkitemId: number, file: File): Promise<any> => {
    if (!gateDraft) throw new Error('门控草稿未初始化');
    const result = await projectApi.uploadGateAttachment(gateDraft.id, checkitemId, (() => {
      const fd = new FormData();
      fd.append('file', file);
      return fd;
    })());
    setGateCheckitemAttachments(prev => ({
      ...prev,
      [checkitemId]: [...(prev[checkitemId] || []), result]
    }));
    return result;
  };

  const handleGateDeleteAttachment = async (checkitemId: number, attachId: number) => {
    await projectApi.deleteGateAttachment(attachId);
    setGateCheckitemAttachments(prev => ({
      ...prev,
      [checkitemId]: (prev[checkitemId] || []).filter(a => a.id !== attachId)
    }));
  };

  const handleGateSubmit = async () => {
    try {
      const values = await gateForm.validateFields();
      await projectApi.submitGate(projectId, {
        gate_id: gateDraft?.id,
        phase_no: gatePhase.phase_no,
        ...values
      });
      message.success(`P${gatePhase.phase_no} ${gatePhase.phase_name} 已提交审批，等待项目经理批准`);
      setGateModalVisible(false);
      setGateReadOnly(false);
      setGateDraft(null);
      setGateCheckitemAttachments({});
      fetchProject();
      fetchApqpData();
    } catch (e: any) {
      message.error(e?.message || '提交失败');
    }
  };

  const handleOpenRisk = (risk?: any) => {
    setEditingRisk(risk || null);
    riskForm.resetFields();
    if (risk) {
      riskForm.setFieldsValue({
        ...risk,
        due_date: risk.due_date ? dayjs(risk.due_date) : null
      });
    }
    setRiskModalVisible(true);
  };

  const handleRiskSubmit = async () => {
    try {
      const values = await riskForm.validateFields();
      const payload = {
        ...values,
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null
      };
      if (editingRisk) {
        await projectApi.updateRisk(editingRisk.id, payload);
        message.success('更新风险成功');
      } else {
        await projectApi.addRisk(projectId, payload);
        message.success('添加风险成功');
      }
      setRiskModalVisible(false);
      // refresh risks
      const list = await projectApi.listRisks(projectId);
      setRisks(Array.isArray(list) ? list : []);
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const handleDeleteRisk = async (id: number) => {
    try {
      await projectApi.deleteRisk(id);
      message.success('删除成功');
      setRisks(prev => prev.filter((r: any) => r.id !== id));
    } catch (_e) {
      message.error('删除失败');
    }
  };

  const getUserOptions = () => users.map(u => (
    <Option key={u.id} value={u.id}>{getUserDisplayName(u)}</Option>
  ));

  const getUserName = (name?: string, id?: number) => {
    if (name) return name;
    if (id) {
      const user = users.find(u => u.id === id);
      return user ? getUserDisplayName(user) : '-';
    }
    return '-';
  };

  const workstationColumns = [
    { title: '序号', dataIndex: 'sort_order', key: 'sort_order', width: 60, render: (_: any, __: any, idx: number) => idx + 1 },
    { title: '工序代码', dataIndex: 'station_code', key: 'station_code', width: 100 },
    { title: '工位名称（中文）', dataIndex: 'station_name', key: 'station_name', width: 280 },
    { title: '机械设计', dataIndex: 'mech_designer_name', key: 'mech_designer_name', width: 100, render: (v: string) => v || '-' },
    { title: '电气设计', dataIndex: 'elec_designer_name', key: 'elec_designer_name', width: 100, render: (v: string) => v || '-' },
    { title: '测控设计', dataIndex: 'meas_control_designer_name', key: 'meas_control_designer_name', width: 100, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 150, fixed: 'right' as const,
      render: (_: any, record: Workstation) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditWorkstation(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteWorkstation(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const planColumns = [
    {
      title: '计划名称', dataIndex: 'plan_name', key: 'plan_name',
      render: (name: string, record: any) => (
        <Space size={8}>
          {!record._isCurrent && <HistoryOutlined style={{ color: '#8c8c8c' }} />}
          <span style={{ color: record._isCurrent ? 'rgba(0,0,0,0.88)' : '#8c8c8c' }}>{name}</span>
          {!record._isCurrent && <Tag color="default" style={{ fontSize: 11, margin: 0 }}>历史版本</Tag>}
        </Space>
      )
    },
    { title: '部门', dataIndex: 'department', key: 'department', width: 180 },
    {
      title: '版本', dataIndex: 'version', key: 'version', width: 120,
      render: (v: number, record: any) => {
        const label = record.version_label || formatVersion(v);
        if (record._isCurrent) {
          return <Tag color="blue" style={{ margin: 0 }}>{label}（当前）</Tag>;
        }
        return <Tag color="default" style={{ margin: 0 }}>{label}</Tag>;
      }
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => {
        const versionStatusMap: Record<string, { label: string; color: string }> = {
          draft: { label: '草稿', color: 'default' },
          submitted: { label: '审批中', color: 'processing' },
          pending: { label: '待审批', color: 'processing' },
          approved: { label: '已审批', color: 'success' },
          rejected: { label: '已拒绝', color: 'warning' }
        };
        const vInfo = versionStatusMap[status];
        if (vInfo) return <Tag color={vInfo.color}>{vInfo.label}</Tag>;
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    { title: '来源', dataIndex: 'source_type', key: 'source_type', width: 100, render: (t: string) => !t ? '-' : (t === 'approval' ? '审批归档' : '手动保存') },
    { title: '创建人', dataIndex: 'creator_name', key: 'creator_name', width: 100, render: (v: string, record: any) => record._isCurrent ? (record.creator_name || '-') : (v || '-') },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right' as const,
      render: (_: any, record: any) => (
        record._isCurrent ? (
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewPlan(record.id)}>查看</Button>
        ) : (
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewVersion(record)}>查看</Button>
        )
      )
    }
  ];

  const oplColumns = [
    { title: '日期', dataIndex: 'occurrence_date', key: 'occurrence_date', width: 120, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '工位', dataIndex: 'station_name', key: 'station_name', width: 120 },
    { title: '责任部门', dataIndex: 'responsible_dept', key: 'responsible_dept', width: 120 },
    { title: '问题描述', dataIndex: 'problem_description', key: 'problem_description' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    }
  ];

  const anomalyColumns = [
    { title: '日期', dataIndex: 'occurrence_date', key: 'occurrence_date', width: 120, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '异常类型', dataIndex: 'anomaly_type', key: 'anomaly_type', width: 120 },
    { title: '工位', dataIndex: 'station_name', key: 'station_name', width: 120 },
    { title: '责任部门', dataIndex: 'responsible_dept', key: 'responsible_dept', width: 120 },
    { title: '问题描述', dataIndex: 'problem_description', key: 'problem_description' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    }
  ];

  const acceptanceFormColumns = [
    { title: '验收单号', dataIndex: 'form_code', key: 'form_code', width: 150 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    { title: '验收日期', dataIndex: 'acceptance_date', key: 'acceptance_date', width: 120, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '结论', dataIndex: 'conclusion', key: 'conclusion' },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: AcceptanceForm) => (
        <Button type="link" size="small" onClick={() => navigate(`/acceptance/forms/${record.id}`)}>查看</Button>
      )
    }
  ];

  const acceptancePlanColumns = [
    { title: '计划名称', dataIndex: 'plan_name', key: 'plan_name' },
    { title: '版本', dataIndex: 'version', key: 'version', width: 80, render: (v: number) => `V${v}` },
    { title: '开始日期', dataIndex: 'start_date', key: 'start_date', width: 120, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    { title: '结束日期', dataIndex: 'end_date', key: 'end_date', width: 120, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: AcceptancePlan) => (
        <Button type="link" size="small" onClick={() => navigate(`/acceptance/plans/${record.id}`)}>查看</Button>
      )
    }
  ];

  const projectTypeLabel = PROJECT_TYPES.find(t => t.value === project?.project_type)?.label || project?.project_type;
  const statusInfo = project ? (STATUS_MAP[project.status] || { label: project.status, color: 'default' }) : null;

  const qmsSubTabItems = [
    {
      key: 'opl',
      label: 'OPL单点课',
      children: <ResizableTable tableKey="project_opl" columns={oplColumns} dataSource={opls} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} size="small" />
    },
    {
      key: 'anomaly',
      label: '异常记录',
      children: <ResizableTable tableKey="project_anomaly" columns={anomalyColumns} dataSource={anomalies} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} size="small" />
    }
  ];

  const tabItems = [
    {
      key: 'basic',
      label: <span><FlagOutlined />APQP总览</span>,
      children: (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small">
                <div style={{ fontSize: 12, color: '#5f6368' }}>当前阶段</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: phaseColor(project?.apqp_phase || 1) }}>
                  P{project?.apqp_phase || 1} {apqpPhases.find((p: any) => p.phase_no === (project?.apqp_phase || 1))?.phase_name || '-'}
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ fontSize: 12, color: '#5f6368' }}>项目健康度</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: healthColor(project?.health_status) }}>
                  {{ green: '🟢 正常', yellow: '🟡 关注', red: '🔴 预警' }[project?.health_status || 'green']}
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ fontSize: 12, color: '#5f6368' }}>风险数量</div>
                <div style={{ fontSize: 20, fontWeight: 500 }}>
                  {risks.length} <Tag color="red" style={{ marginLeft: 6 }}>高 {risks.filter((r: any) => r.risk_level === 'high' && r.status === 'open').length}</Tag>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ fontSize: 12, color: '#5f6368' }}>项目计划数</div>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{plans.length || '-'}</div>
              </Card>
            </Col>
          </Row>

          <Card title={<span><BranchesOutlined /> APQP 五阶段门控（Phase Gate）</span>} size="small" style={{ marginBottom: 16 }}>
            <Steps
              current={(project?.apqp_phase || 1) - 1}
              status={project?.status === 'completed' ? 'finish' : 'process'}
              style={{ padding: '16px 8px' }}
              items={apqpPhases.map((p: any) => {
                const gate = gateOfPhase(p.phase_no);
                const ps = phaseStatus(p.phase_no);
                let icon: any = <span>P{p.phase_no}</span>;
                if (ps === 'done') icon = <CheckCircleOutlined />;
                let desc: any;
                if (gate && gate.gate_status === 'completed') {
                  desc = (
                    <Space size={4} style={{ fontSize: 11 }}>
                      <Tag color="success" style={{ margin: 0 }}>已通过</Tag>
                      {gate.review_date ? <span>{dayjs(gate.review_date).format('YYYY-MM-DD')}</span> : null}
                      <Button type="link" size="small" style={{ fontSize: 11, padding: '0 4px' }} onClick={() => handleViewGate(p)}>查看详情</Button>
                    </Space>
                  );
                } else if (gate && gate.gate_status === 'submitted') {
                  desc = (
                    <Space size={4} style={{ fontSize: 11 }}>
                      <Tag color="orange" style={{ margin: 0 }}>审批中</Tag>
                      <Button type="link" size="small" style={{ fontSize: 11, padding: '0 4px' }} onClick={() => handleViewGate(p)}>查看详情</Button>
                    </Space>
                  );
                } else if (gate && gate.gate_status === 'draft') {
                  desc = (
                    <Space size={4} style={{ fontSize: 11 }}>
                      <Tag color="processing" style={{ margin: 0 }}>草稿中</Tag>
                      <Button type="link" size="small" style={{ fontSize: 11, padding: '0 4px' }} onClick={() => handleContinueGate(p)}>继续编辑</Button>
                    </Space>
                  );
                } else if (ps === 'process') {
                  desc = <Button size="small" type="primary" onClick={() => handleOpenGate(p)}>发起门控评审</Button>;
                } else {
                  desc = <span style={{ color: '#bdc1c6', fontSize: 11 }}>{p.gate_name}</span>;
                }
                return {
                  title: <span style={{ fontSize: 13 }}>{p.phase_name}</span>,
                  icon,
                  description: desc,
                  status: ps as any
                };
              })}
            />
            <Divider style={{ margin: '12px 0' }} />
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="项目编号">{project?.project_code || '-'}</Descriptions.Item>
              <Descriptions.Item label="项目客户">{project?.customer_name || project?.customer || '-'}</Descriptions.Item>
              <Descriptions.Item label="项目经理">{getUserName(project?.project_manager_name, project?.project_manager_id)}</Descriptions.Item>
              <Descriptions.Item label="优先级">
                {project?.project_priority === 'high' ? <Tag color="red">高</Tag> : project?.project_priority === 'low' ? <Tag color="blue">低</Tag> : <Tag>中</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="启动日期">{project?.kickoff_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="计划SOP">{project?.planned_sop_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="计划FAT">{project?.planned_fat_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="合同金额">{project?.contract_amount ? `¥${Number(project.contract_amount).toLocaleString()}` : '-'}</Descriptions.Item>
              <Descriptions.Item label="项目描述" span={2}>{project?.description || '-'}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16, padding: 16, background: '#f8f9fa', borderRadius: 8, border: '1px solid #f1f3f4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: '#202124' }}><FileTextOutlined /> 客户需求（VOC）</div>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', color: project?.customer_requirements ? 'rgba(0,0,0,0.85)' : '#5f6368', marginBottom: vocAttachments.length > 0 ? 12 : 0, lineHeight: 1.8 }}>
                {project?.customer_requirements || '暂无客户需求描述，点击"编辑项目基础信息"可添加。'}
              </div>
              {vocAttachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {vocAttachments.map((att: any) => {
                    const ext = (att.file_name || '').split('.').pop()?.toLowerCase() || '';
                    const isImg = ['png','jpg','jpeg','gif','bmp','webp'].includes(ext);
                    return (
                      <a
                        key={att.id}
                        href={`/uploads/${att.file_path}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#fff', border: '1px solid #dadce0', borderRadius: 20, fontSize: 12, color: '#1a73e8' }}
                      >
                        {isImg ? '🖼️' : ext === 'pdf' ? '📄' : ['doc','docx'].includes(ext) ? '📝' : ['xls','xlsx'].includes(ext) ? '📊' : ['ppt','pptx'].includes(ext) ? '📑' : '📎'}
                        {att.file_name}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Button icon={<EditOutlined />} onClick={handleEditProject}>编辑项目基础信息</Button>
            </div>
          </Card>

          <Card
            title={<span><WarningOutlined /> 项目风险登记册（Risk Register）</span>}
            size="small"
            extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => handleOpenRisk()}>登记风险</Button>}
          >
            {risks.length === 0 ? <Empty description="暂无风险记录" /> : (
              <ResizableTable
                tableKey="project_risks"
                size="small"
                pagination={false}
                dataSource={risks}
                rowKey="id"
                columns={[
                  { title: '类别', dataIndex: 'risk_category', width: 100, render: (t: string) => ({ technical: '技术', schedule: '进度', cost: '成本', quality: '质量', resource: '资源', supplier: '供应商' }[t] || t) },
                  { title: '风险描述', dataIndex: 'risk_description', ellipsis: true },
                  { title: '概率', dataIndex: 'probability', width: 70, render: (p: string) => ({ high: '高', medium: '中', low: '低' }[p] || p) },
                  { title: '严重度', dataIndex: 'severity', width: 70, render: (s: string) => ({ high: '高', medium: '中', low: '低' }[s] || s) },
                  { title: '风险等级', dataIndex: 'risk_level', width: 90, render: (l: string) => <Tag color={riskLevelColor(l)}>{riskLevelText(l)}</Tag> },
                  { title: '责任人', dataIndex: 'responsible_name', width: 90 },
                  { title: '到期日', dataIndex: 'due_date', width: 100, render: (d: string) => d || '-' },
                  { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => s === 'closed' ? <Tag color="green">已关闭</Tag> : <Tag color="blue">进行中</Tag> },
                  {
                    title: '操作', key: 'a', width: 120,
                    render: (_: any, r: any) => (
                      <Space size={0}>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenRisk(r)}>编辑</Button>
                        <Popconfirm title="确认删除？" onConfirm={() => handleDeleteRisk(r.id)}>
                          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                      </Space>
                    )
                  }
                ]}
              />
            )}
          </Card>
        </>
      )
    },
    {
      key: 'basic_ws',
      label: <span><ClusterOutlined />工位配置</span>,
      children: (
        <>
          <Descriptions bordered column={2} style={{ marginBottom: '16px' }}>
            <Descriptions.Item label="项目编号">{project?.project_code || '-'}</Descriptions.Item>
            <Descriptions.Item label="项目类型">{projectTypeLabel || '-'}</Descriptions.Item>
            <Descriptions.Item label="项目名称">{project?.project_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户">{project?.customer_name || project?.customer || '-'}</Descriptions.Item>
            <Descriptions.Item label="项目经理">{getUserName(project?.project_manager_name, project?.project_manager_id)}</Descriptions.Item>
            <Descriptions.Item label="机械设计负责人">{getUserName(project?.mech_designer_name, project?.mech_designer_id)}</Descriptions.Item>
            <Descriptions.Item label="电气设计负责人">{getUserName(project?.elec_designer_name, project?.elec_designer_id)}</Descriptions.Item>
            <Descriptions.Item label="测试设计负责人">{getUserName(project?.test_designer_name, project?.test_designer_id)}</Descriptions.Item>
            <Descriptions.Item label="电工负责人">{getUserName(project?.electrician_lead_name, project?.electrician_lead_id)}</Descriptions.Item>
            <Descriptions.Item label="钳工负责人">{getUserName(project?.fitter_lead_name, project?.fitter_lead_id)}</Descriptions.Item>
            <Descriptions.Item label="装配团队">{project?.assembly_team || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{project?.created_at ? dayjs(project.created_at).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
            <Descriptions.Item label="项目描述" span={2}>{project?.description || '-'}</Descriptions.Item>
          </Descriptions>
          <Card
            title="工位列表"
            size="small"
            extra={
              <Space>
                <ImportExportToolbar
                  module="workstation"
                  params={{ project_id: projectId }}
                  onImportSuccess={fetchProject}
                  showExport={true}
                  showImport={true}
                  showTemplate={true}
                />
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddWorkstation}>添加工位</Button>
              </Space>
            }
          >
            <ResizableTable
              tableKey="project_workstations"
              columns={workstationColumns}
              dataSource={project?.workstations || []}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 900 }}
            />
          </Card>
        </>
      )
    },
    {
      key: 'plans',
      label: <span><ScheduleOutlined />项目计划WBS</span>,
      children: (
        <>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreatePlan}>新建计划</Button>
          </div>
          <ResizableTable
            tableKey="project_plans"
            columns={planColumns}
            dataSource={flattenedPlanRows}
            rowKey="_rowKey"
            pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 条` }}
            scroll={{ x: 1100 }}
          />
        </>
      )
    },
    {
      key: 'acceptance',
      label: <span><CheckSquareOutlined />验收管理</span>,
      children: (
        <>
          <Card title="验收单" size="small" style={{ marginBottom: '16px' }}>
            <ResizableTable tableKey="project_acceptance_forms" columns={acceptanceFormColumns} dataSource={acceptanceForms} rowKey="id" pagination={false} size="small" />
          </Card>
          <Card title="验收计划" size="small">
            <ResizableTable tableKey="project_acceptance_plans" columns={acceptancePlanColumns} dataSource={acceptancePlans} rowKey="id" pagination={false} size="small" />
          </Card>
        </>
      )
    },
    { key: 'bom', label: <span><ClusterOutlined />BOM物料</span>, children: <BomTab projectId={projectId} /> },
    { key: 'fmea', label: <span><SafetyCertificateOutlined />FMEA</span>, children: <FmeaTab projectId={projectId} /> },
    { key: 'dvpr', label: <span><ExperimentOutlined />DVP&R</span>, children: <DvprTab projectId={projectId} /> },
    { key: 'cp', label: <span><ControlOutlined />控制计划</span>, children: <ControlPlanTab projectId={projectId} /> },
    { key: 'eco', label: <span><ApiOutlined />ECR/ECO变更</span>, children: <EcoTab projectId={projectId} /> },
    { key: 'ppap', label: <span><FileAddOutlined />PPAP交付</span>, children: <PpapTab projectId={projectId} /> },
    { key: 'msa', label: <span><FundOutlined />MSA</span>, children: <MsaTab projectId={projectId} /> },
    { key: 'spc', label: <span><FundOutlined />SPC</span>, children: <SpcTab projectId={projectId} /> },
    { key: 'audit', label: <span><AuditOutlined />VDA6.7审核</span>, children: <VdaTab projectId={projectId} /> },
    { key: '8d', label: <span><WarningOutlined />8D/CAPA</span>, children: <EightdTab projectId={projectId} /> },
    {
      key: 'qms',
      label: <span><FileTextOutlined />QMS现场</span>,
      children: <Tabs defaultActiveKey="opl" size="small" items={qmsSubTabItems} />
    },
    { key: 'versions', label: <span><HistoryOutlined />版本历史</span>, children: <VersionTab projectId={projectId} /> }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Breadcrumb
        style={{ marginBottom: '16px' }}
        items={[
          { title: <a onClick={() => navigate('/projects')}>项目管理</a> },
          { title: <a onClick={() => navigate('/projects')}>项目列表</a> },
          { title: project?.project_name || '项目详情' }
        ]}
      />

      <Card loading={loading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '1rem' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Space align="center" size="middle" wrap>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>返回</Button>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{project?.project_name}</h2>
              {project?.project_code && <Tag color="blue">{project.project_code}</Tag>}
              {projectTypeLabel && <Tag>{projectTypeLabel}</Tag>}
              {statusInfo && <Tag color={statusInfo.color}>{statusInfo.label}</Tag>}
            </Space>
          </div>
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <Modal title="编辑项目基础信息" open={editModalVisible} onOk={handleEditModalOk} onCancel={() => setEditModalVisible(false)} forceRender
       className="modal-lg">
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="project_type" label="项目类型" rules={[{ required: true, message: '请选择项目类型' }]}>
                <Select
                  placeholder="请选择项目类型"
                  showSearch
                  filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
                >
                  {PROJECT_TYPES.map(t => (
                    <Option key={t.value} value={t.value}>{t.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="project_code" label="项目编号">
                <Input placeholder="自动生成，可手动修改" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="project_name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
                <Input placeholder="请输入项目名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_id" label="关联客户">
                <Select placeholder="选择客户（或在下方输入文本）" allowClear showSearch optionFilterProp="children">
                  {customers.map((c: any) => <Option key={c.id} value={c.id}>{c.customer_name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer" label="客户（文本）">
                <Input placeholder="若客户未在下拉中可直接输入" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="project_priority" label="项目优先级">
                <Select>
                  <Option value="high">高（红色）</Option>
                  <Option value="medium">中（默认）</Option>
                  <Option value="low">低</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="kickoff_date" label="启动日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planned_fat_date" label="计划FAT">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planned_sop_date" label="计划SOP">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="health_status" label="健康度">
                <Select>
                  <Option value="green">🟢 正常</Option>
                  <Option value="yellow">🟡 关注</Option>
                  <Option value="red">🔴 预警</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contract_amount" label="合同金额（元）">
                <Input type="number" placeholder="例如 5000000" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="project_manager_id" label="项目经理">
                <FeishuUserSelect placeholder="请选择项目经理" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="mech_designer_id" label="机械设计负责人">
                <FeishuUserSelect placeholder="请选择机械设计负责人" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="elec_designer_id" label="电气设计负责人">
                <FeishuUserSelect placeholder="请选择电气设计负责人" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="test_designer_id" label="测试设计负责人">
                <FeishuUserSelect placeholder="请选择测试设计负责人" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="electrician_lead_id" label="电工负责人">
                <FeishuUserSelect placeholder="请选择电工负责人" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fitter_lead_id" label="钳工负责人">
                <FeishuUserSelect placeholder="请选择钳工负责人" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="assembly_team" label="装配团队">
                <Input placeholder="请输入装配团队" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="description" label="项目描述">
                <TextArea rows={3} placeholder="请输入项目描述" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label="客户需求（VOC）">
                <Form.Item name="customer_requirements" noStyle>
                  <TextArea rows={3} placeholder="记录客户核心要求、技术规格、交付要求等" />
                </Form.Item>
                <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 4, border: '1px dashed #d9d9d9' }}>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    <FileTextOutlined /> VOC附件（客户需求文档、技术规格书等）
                  </div>
                  <AttachmentUploader
                    value={vocAttachments}
                    onUpload={handleVocUpload}
                    onDelete={handleVocDelete}
                    listStyle="list"
                  />
                </div>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal title={workstationModalTitle} open={workstationModalVisible} onOk={handleWorkstationModalOk} onCancel={() => setWorkstationModalVisible(false)} destroyOnHidden
         className="modal-md">
        <Form form={workstationForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="sort_order" label="序号">
                <Input type="number" placeholder="自动" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="station_code" label="工序代码" rules={[{ required: true, message: '请输入工序代码' }]}>
                <Input placeholder="如：OP10" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="station_name" label="工位名称（中文）" rules={[{ required: true, message: '请输入工位名称' }]}>
            <Input placeholder="如：RLM5#产线-OP10-底座点导热胶及上料" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="mech_designer_id" label="机械设计">
                <FeishuUserSelect placeholder="请选择机械设计负责人" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="elec_designer_id" label="电气设计">
                <FeishuUserSelect placeholder="请选择电气设计负责人" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="meas_control_designer_id" label="测控设计">
                <FeishuUserSelect placeholder="请选择测控设计负责人" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="请输入工位描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建项目计划"
        open={planModalVisible}
        onOk={handlePlanModalOk}
        onCancel={() => setPlanModalVisible(false)}
        destroyOnHidden
        className="modal-sm"
      >
        <Form form={planForm} layout="vertical">
          <Form.Item name="plan_name" label="计划名称" rules={[{ required: true, message: '请输入计划名称' }]}>
            <Input placeholder="请输入计划名称" />
          </Form.Item>
          <Form.Item name="department" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
            <DepartmentSelect
              placeholder="请选择部门"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={gatePhase ? `P${gatePhase.phase_no} ${gatePhase.phase_name} · ${gateReadOnly ? '门控详情' : `门控评审（${gatePhase.gate_name}）`}` : '门控评审'} open={gateModalVisible} onOk={gateReadOnly ? undefined : handleGateSubmit} onCancel={() => { setGateModalVisible(false); setGateReadOnly(false); }} destroyOnHidden
         okText={gateReadOnly ? '关闭' : '提交审批'} confirmLoading={loading} footer={gateReadOnly ? [
          <Button key="close" onClick={() => { setGateModalVisible(false); setGateReadOnly(false); }}>关闭</Button>
        ] : undefined} className="modal-xl">
        {gatePhase && (
          <Form form={gateForm} layout="vertical">
            {!gateReadOnly && (
              <Alert
                message={`上传交付物附件并确认完成状态后，点击「提交审批」发送给项目经理审批。审批通过后项目将进入P${Math.min(gatePhase.phase_no + 1, 5)}阶段。`}
                type="info" showIcon style={{ marginBottom: 12 }}
              />
            )}
            {gateReadOnly && gateDraft && (
              <Alert
                message={
                  <Space>
                    <Tag color={
                      gateDraft.gate_status === 'submitted' ? 'orange' :
                      gateDraft.approval_status === 'rejected' ? 'red' :
                      gateDraft.conclusion === 'approved' ? 'success' : 'warning'
                    }>
                      {gateDraft.gate_status === 'submitted' ? '审批中' :
                       gateDraft.approval_status === 'rejected' ? '已驳回' :
                       gateDraft.conclusion === 'approved' ? '已通过' : '有条件通过'}
                    </Tag>
                    <span>评审人：{gateDraft.reviewer_name || '-'}</span>
                    <span>评审日期：{gateDraft.review_date ? dayjs(gateDraft.review_date).format('YYYY-MM-DD HH:mm') : '-'}</span>
                  </Space>
                }
                type={gateDraft.conclusion === 'approved' ? 'success' : 'warning'} showIcon style={{ marginBottom: 12 }}
              />
            )}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="reviewer_id" label="评审人" rules={gateReadOnly ? [] : [{ required: true, message: '请选择评审人' }]}>
                  {gateReadOnly ? (
                    <span style={{ color: '#5f6368' }}>{gateDraft?.reviewer_name || '-'}</span>
                  ) : (
                    <FeishuUserSelect placeholder="选择门控评审人" allowClear />
                  )}
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="conclusion" label="评审结论" rules={gateReadOnly ? [] : [{ required: true }]}>
                  {gateReadOnly ? (
                    <Tag color={gateForm.getFieldValue('conclusion') === 'approved' ? 'success' : 'warning'}>
                      {gateForm.getFieldValue('conclusion') === 'approved' ? '通过' : '有条件通过'}
                    </Tag>
                  ) : (
                    <Radio.Group>
                      <Radio value="approved"><CheckCircleOutlined /> 通过</Radio>
                      <Radio value="conditional"><ClockCircleOutlined /> 有条件通过</Radio>
                    </Radio.Group>
                  )}
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label={`P${gatePhase.phase_no} 交付物检查清单${gateReadOnly ? '' : '（支持上传PDF/Word/Excel/PPT/图片附件）'}`}>
              <Form.List name="checkitems">
                {(fields, { add, remove }) => (
                  <div>
                    <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
                      {fields.map((f) => {
                        const checkitemId = gateForm.getFieldValue(['checkitems', f.name, 'id']);
                        const ciStatus = gateForm.getFieldValue(['checkitems', f.name, 'status']);
                        return (
                          <Card
                            key={f.key}
                            size="small"
                            style={{ marginBottom: 8 }}
                            styles={{ body: { padding: '8px 12px' } }}
                            title={
                              <Space>
                                {gateReadOnly ? (
                                  <>
                                    <span style={{ fontWeight: 500 }}>{gateForm.getFieldValue(['checkitems', f.name, 'item_name'])}</span>
                                    <Tag color={ciStatus === 'checked' ? 'success' : ciStatus === 'pending' ? 'warning' : 'default'}>
                                      {ciStatus === 'checked' ? '已完成' : ciStatus === 'pending' ? '待补' : 'N/A'}
                                    </Tag>
                                  </>
                                ) : (
                                  <>
                                    <Form.Item name={[f.name, 'item_name']} noStyle rules={[{ required: true }]}>
                                      <Input size="small" style={{ width: 200 }} placeholder="交付物名称" />
                                    </Form.Item>
                                    <Form.Item name={[f.name, 'is_required']} noStyle initialValue={1}>
                                      <Radio.Group size="small">
                                        <Radio value={1}>必交</Radio>
                                        <Radio value={0}>可选</Radio>
                                      </Radio.Group>
                                    </Form.Item>
                                    <Form.Item name={[f.name, 'status']} noStyle initialValue="checked">
                                      <Select size="small" style={{ width: 100 }}>
                                        <Option value="checked">已完成</Option>
                                        <Option value="pending">待补</Option>
                                        <Option value="na">N/A</Option>
                                      </Select>
                                    </Form.Item>
                                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                                  </>
                                )}
                              </Space>
                            }
                          >
                            <Space direction="vertical" style={{ width: '100%' }} size="small">
                              <Form.Item name={[f.name, 'remark']} noStyle>
                                {gateReadOnly ? (
                                  gateForm.getFieldValue(['checkitems', f.name, 'remark']) ? (
                                    <div style={{ color: '#5f6368', fontSize: 12 }}>备注：{gateForm.getFieldValue(['checkitems', f.name, 'remark'])}</div>
                                  ) : null
                                ) : (
                                  <Input size="small" placeholder="备注说明（可选）" />
                                )}
                              </Form.Item>
                              {checkitemId && (
                                <div style={{ background: '#fafafa', padding: 8, borderRadius: 4 }}>
                                  <AttachmentUploader
                                    value={gateCheckitemAttachments[checkitemId] || []}
                                    readOnly={gateReadOnly}
                                    onUpload={gateReadOnly ? undefined : ((file: File) => handleGateUpload(checkitemId, file))}
                                    onDelete={gateReadOnly ? undefined : ((attachId: number) => handleGateDeleteAttachment(checkitemId, attachId))}
                                  />
                                </div>
                              )}
                            </Space>
                          </Card>
                        );
                      })}
                    </div>
                    {!gateReadOnly && (
                      <Button type="dashed" size="small" block icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => add({ item_name: '', is_required: 1, status: 'checked', remark: '' })}>
                        添加交付物
                      </Button>
                    )}
                  </div>
                )}
              </Form.List>
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="conditional_terms" label="有条件通过项（如有）">
                  {gateReadOnly ? (
                    <div style={{ color: '#5f6368' }}>{gateForm.getFieldValue('conditional_terms') || '-'}</div>
                  ) : (
                    <TextArea rows={2} placeholder="若有条件通过，请列出必须后续完成的事项及期限" />
                  )}
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="comments" label="评审意见">
                  {gateReadOnly ? (
                    <div style={{ color: '#5f6368' }}>{gateForm.getFieldValue('comments') || '-'}</div>
                  ) : (
                    <TextArea rows={2} placeholder="评审综合意见" />
                  )}
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </Modal>

      <Modal title={editingRisk ? '编辑风险' : '登记项目风险'} open={riskModalVisible} onOk={handleRiskSubmit} onCancel={() => setRiskModalVisible(false)} destroyOnHidden
       className="modal-md">
        <Form form={riskForm} layout="vertical" initialValues={{ risk_category: 'technical', probability: 'medium', severity: 'medium', status: 'open' }}>
          <Form.Item name="risk_category" label="风险类别" rules={[{ required: true }]}>
            <Select>
              <Option value="technical">技术风险</Option>
              <Option value="schedule">进度风险</Option>
              <Option value="cost">成本风险</Option>
              <Option value="quality">质量风险</Option>
              <Option value="resource">资源风险</Option>
              <Option value="supplier">供应商风险</Option>
              <Option value="customer">客户风险</Option>
              <Option value="safety">安全/合规风险</Option>
            </Select>
          </Form.Item>
          <Form.Item name="risk_description" label="风险描述" rules={[{ required: true, message: '请描述风险' }]}>
            <TextArea rows={3} placeholder="清晰描述风险是什么、可能发生什么情况" />
          </Form.Item>
          <Form.Item name="impact" label="影响分析">
            <TextArea rows={2} placeholder="风险发生后的影响（范围/成本/进度/质量）" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="probability" label="发生概率" rules={[{ required: true }]}>
                <Select>
                  <Option value="high">高（大于50%）</Option>
                  <Option value="medium">中（20-50%）</Option>
                  <Option value="low">低（小于20%）</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="severity" label="严重度" rules={[{ required: true }]}>
                <Select>
                  <Option value="high">高（重大影响）</Option>
                  <Option value="medium">中（一般影响）</Option>
                  <Option value="low">低（轻微影响）</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Option value="open">进行中</Option>
                  <Option value="monitoring">监控中</Option>
                  <Option value="closed">已关闭</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="mitigation_plan" label="缓解/应对措施">
            <TextArea rows={2} placeholder="描述应对策略和具体行动" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="responsible_id" label="责任人">
                <FeishuUserSelect placeholder="选择风险责任人" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="due_date" label="应对截止日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          {editingRisk && (
            <Form.Item name="closure_note" label="关闭说明（关闭时填写）">
              <TextArea rows={2} placeholder="关闭原因/结果说明" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title="历史版本详情"
        placement="right"
        width={640}
        open={!!versionPreview}
        onClose={() => setVersionPreview(null)}
      >
        {versionPreview && (
          <div>
            <div style={{ background: '#fafafa', padding: 12, borderRadius: 4, marginBottom: 12 }}>
              <div>
                <Tag color="blue">{versionPreview.version_label || formatVersion(versionPreview.version_no)}</Tag>
                <Tag color={
                  versionPreview.status === 'approved' ? 'success' :
                  versionPreview.status === 'submitted' || versionPreview.status === 'pending' ? 'processing' :
                  versionPreview.status === 'rejected' ? 'warning' : 'default'
                }>
                  {versionPreview.status === 'draft' ? '草稿' :
                   versionPreview.status === 'submitted' || versionPreview.status === 'pending' ? '审批中' :
                   versionPreview.status === 'approved' ? '已审批' :
                   versionPreview.status === 'rejected' ? '已拒绝' : versionPreview.status}
                </Tag>
                {versionPreview.is_current ? <Tag color="green">当前生效</Tag> : null}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                {versionPreview.creator_name || '系统'} · {versionPreview.created_at}
                {versionPreview.approved_at ? ` · 审批于 ${versionPreview.approved_at}` : ''}
              </div>
            </div>
            <ResizableTable
              tableKey="project_version_tasks"
              size="small"
              pagination={false}
              scroll={{ y: 'calc(100vh - 220px)' }}
              dataSource={versionPreview.snapshot?.tasks || []}
              rowKey="id"
              columns={[
                { title: '#', dataIndex: 'id', width: 36, render: (_: any, __: any, i: number) => i + 1 },
                { title: '任务名称', dataIndex: 'task_name', ellipsis: true, render: (n: string, r: any) => <span style={{ paddingLeft: ((r.level || 1) - 1) * 12 }}>{n}</span> },
                { title: '类型', dataIndex: 'task_type', width: 56, render: (t: string) => <Tag style={{ fontSize: 9, margin: 0 }}>{t === 'milestone' ? '里程碑' : t === 'phase' ? '阶段' : '任务'}</Tag> },
                { title: '开始', dataIndex: 'start_date', width: 80, render: (d: string) => d ? dayjs(d).format('MM-DD') : '' },
                { title: '结束', dataIndex: 'end_date', width: 80, render: (d: string) => d ? dayjs(d).format('MM-DD') : '' },
                { title: '进度', dataIndex: 'progress', width: 50, render: (p: number) => `${p || 0}%` },
                {
                  title: '状态', dataIndex: 'status', width: 64,
                  render: (s: string) => {
                    const info = STATUS_MAP[s] || { label: s, color: 'default' };
                    return <Tag color={info.color} style={{ fontSize: 9, margin: 0 }}>{info.label}</Tag>;
                  }
                }
              ]}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default ProjectDetail;
