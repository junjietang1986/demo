import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Select,
  Upload,
  Modal,
  Form,
  Tag,
  Space,
  Input,
  App,
  Card,
  Row,
  Col,
  Empty,
  Tooltip,
  Alert,
  Popconfirm,
  Descriptions,
  Timeline,
  Typography
} from 'antd';
import {
  UploadOutlined,
  ReloadOutlined,
  LinkOutlined,
  SearchOutlined,
  DownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  ClearOutlined,
  SendOutlined,
  HistoryOutlined,
  RollbackOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { ceMaterialApi, projectApi } from '@/api';
import { ResizableTable } from '../../components/ResizableTable';
import {
  CEMaterial,
  NANDE_STATUS_MAP,
  OUCE_STATUS_MAP,
  COMPLIANCE_STATUS_MAP,
  ARCHIVE_STATUS_MANUAL_MAP
} from '@/types';

const { Text } = Typography;

interface BomItem {
  id: number;
  workstation_id: number;
  workstation_name: string;
  workstation_code?: string;
  bom_row_no: number;
  part_code: string;
  part_name: string;
  part_spec?: string;
  brand?: string;
  qty: number;
  match_status: 'matched' | 'unmatched' | 'added';
  ce_material_id?: number;
  ce_part_code?: string;
  ce_name?: string;
  ce_spec?: string;
  ce_brand?: string;
  nande_status?: string;
  ouce_status?: string;
  compliance_status?: string;
  archive_status_manual?: string;
  archive_names?: string;
  approval_remark?: string;
  reject_reason?: string;
  alternative_suggestion?: string;
  remarks?: string;
  bom_status?: string;
  version_no?: number;
  version_label?: string;
  is_deleted?: number;
}

interface BomInfo {
  id: number;
  project_id: number;
  workstation_id: number | null;
  bom_code: string;
  status: 'draft' | 'pending' | 'approved';
  version_no: number;
  version_label: string;
  submitter_name?: string;
  submitted_at?: string;
  approver_name?: string;
  approved_at?: string;
  reject_reason?: string;
  change_reason?: string;
}

interface BomVersion {
  id: number;
  ce_bom_id: number;
  version_no: number;
  version_label: string;
  item_count: number;
  matched_count: number;
  status: 'pending' | 'approved' | 'rejected';
  submitter_name?: string;
  submitted_at?: string;
  approver_name?: string;
  approved_at?: string;
  reject_reason?: string;
  change_reason?: string;
  created_at: string;
}

const StatusTag: React.FC<{ status?: string; map: Record<string, { label: string; color: string }> }> = ({ status, map }) => {
  const s = status || 'pending';
  const cfg = map[s] || map.pending;
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
};

const BomStatusTag: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'approved') return <Tag icon={<CheckCircleOutlined />} color="success">已受控</Tag>;
  if (status === 'pending') return <Tag icon={<ClockCircleOutlined />} color="processing">审批中</Tag>;
  return <Tag icon={<EditOutlined />} color="default">草稿</Tag>;
};

interface Workstation {
  id: number;
  station_code: string;
  station_name: string;
}

interface ProjectOption {
  id: number;
  project_code: string;
  project_name: string;
}

interface CeBomTabProps {
  projectId?: number;
  embedded?: boolean;
}

const BOM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '审批中', color: 'processing' },
  approved: { label: '已批准', color: 'success' },
  rejected: { label: '已驳回', color: 'error' }
};

const CeBomTab: React.FC<CeBomTabProps> = ({ projectId: propProjectId, embedded = false }) => {
  const { message, modal } = App.useApp();
  const [searchForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | undefined>(propProjectId);
  const [workstations, setWorkstations] = useState<Workstation[]>([]);
  const [selectedWorkstation, setSelectedWorkstation] = useState<number | undefined>();
  const [matchStatusFilter, setMatchStatusFilter] = useState<string>('all');
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [currentBomItem, setCurrentBomItem] = useState<BomItem | null>(null);
  const [ceMaterials, setCeMaterials] = useState<CEMaterial[]>([]);
  const [matching, setMatching] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [addingToCe, setAddingToCe] = useState(false);
  const [bomInfo, setBomInfo] = useState<BomInfo | null>(null);
  const [bomStats, setBomStats] = useState({ total: 0, matched: 0, unmatched: 0, added: 0 });
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [versions, setVersions] = useState<BomVersion[]>([]);
  const [versionDetail, setVersionDetail] = useState<any>(null);
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [changeModalVisible, setChangeModalVisible] = useState(false);
  const [submitForm] = Form.useForm();
  const [changeForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!propProjectId) {
      loadProjects();
    }
  }, [propProjectId]);

  useEffect(() => {
    if (selectedProject) {
      loadWorkstations();
      loadBomItems();
    } else {
      setWorkstations([]);
      setBomItems([]);
      setBomInfo(null);
      setSelectedWorkstation(undefined);
      setSelectedRowKeys([]);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      loadBomItems();
    }
  }, [selectedProject, selectedWorkstation, matchStatusFilter]);

  const loadProjects = async () => {
    try {
      const res: any = await projectApi.list({ pageSize: 1000, page: 1 });
      const list = Array.isArray(res) ? res : (res.list || res.data || []);
      setProjects(list);
    } catch (err: any) {
      message.error(err.message || '加载项目列表失败');
    }
  };

  const loadWorkstations = async () => {
    if (!selectedProject) return;
    try {
      const res: any = await ceMaterialApi.getWorkstations(selectedProject);
      const list = Array.isArray(res) ? res : (res.list || res.data || []);
      setWorkstations(list);
    } catch (err: any) {
      message.error(err.message || '加载工位失败');
    }
  };

  const loadBomItems = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const params: any = { page_size: 500 };
      if (selectedWorkstation) {
        params.workstation_id = selectedWorkstation;
      }
      if (matchStatusFilter !== 'all') {
        params.match_status = matchStatusFilter;
      }
      const res: any = await ceMaterialApi.getBomItems(selectedProject, params);
      const list = Array.isArray(res) ? res : (res.list || res.data || []);
      setBomItems(list);
      setBomInfo(res.bom_info || null);
      setBomStats(res.stats || { total: 0, matched: 0, unmatched: 0, added: 0 });
      setSelectedRowKeys([]);
    } catch (err: any) {
      message.error(err.message || '加载BOM数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    if (!selectedProject) return;
    try {
      const res: any = await ceMaterialApi.getBomVersions(selectedProject, selectedWorkstation);
      setVersions(Array.isArray(res) ? res : []);
    } catch (err: any) {
      message.error(err.message || '加载版本历史失败');
    }
  };

  const uploadProps: UploadProps = {
    accept: '.xlsx,.xls',
    showUploadList: false,
    beforeUpload: async (file) => {
      if (!selectedProject) {
        message.warning('请先选择项目');
        return false;
      }
      if (!selectedWorkstation) {
        message.warning('请先选择工位');
        return false;
      }
      setImporting(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('workstation_id', String(selectedWorkstation));
        const res: any = await ceMaterialApi.importBom(selectedProject, formData);
        const { matched = 0, unmatched = 0 } = res || {};
        message.success(`BOM导入完成：匹配${matched}条，未匹配${unmatched}条`, 5);
        loadBomItems();
      } catch (err: any) {
        message.error(err.message || '导入失败');
      } finally {
        setImporting(false);
      }
      return false;
    }
  };

  const handleMatch = async (item: BomItem) => {
    setCurrentBomItem(item);
    try {
      const res: any = await ceMaterialApi.listAll();
      const list = Array.isArray(res) ? res : (res.list || res.data || []);
      setCeMaterials(list);
    } catch (err: any) {
      message.error(err.message || '加载CE物料列表失败');
    }
    setMatchModalVisible(true);
  };

  const handleSelectMaterial = async (ceMaterialId: number) => {
    if (!currentBomItem) return;
    setMatching(true);
    try {
      await ceMaterialApi.matchBomItem(currentBomItem.id, ceMaterialId);
      message.success('匹配成功');
      setMatchModalVisible(false);
      loadBomItems();
    } catch (err: any) {
      message.error(err.message || '匹配失败');
    } finally {
      setMatching(false);
    }
  };

  const handleSearchMaterial = async () => {
    try {
      const values = await searchForm.validateFields();
      const keyword = values.keyword || '';
      const res: any = await ceMaterialApi.list({ keyword, pageSize: 200 });
      const list = Array.isArray(res) ? res : (res.list || res.data || []);
      setCeMaterials(list);
    } catch (err: any) {
      message.error(err.message || '搜索CE物料失败');
    }
  };

  const handleAddSelectedToCe = async () => {
    if (!selectedProject || selectedRowKeys.length === 0) {
      message.warning('请先选择要添加的未匹配物料');
      return;
    }
    setAddingToCe(true);
    try {
      const res: any = await ceMaterialApi.addBomItemsToCe(selectedProject, selectedRowKeys as number[]);
      const { added = 0, alreadyMatched = 0 } = res || {};
      message.success(`已添加${added}条物料到CE清单，${alreadyMatched}条已存在自动匹配`);
      loadBomItems();
    } catch (err: any) {
      message.error(err.message || '添加失败');
    } finally {
      setAddingToCe(false);
    }
  };

  const handleAddSingleToCe = async (id: number) => {
    if (!selectedProject) return;
    setAddingToCe(true);
    try {
      const res: any = await ceMaterialApi.addBomItemsToCe(selectedProject, [id]);
      const { added = 0, alreadyMatched = 0 } = res || {};
      if (added > 0) {
        message.success('已添加到CE物料清单');
      } else if (alreadyMatched > 0) {
        message.success('该物料已存在CE清单中，已自动匹配');
      }
      loadBomItems();
    } catch (err: any) {
      message.error(err.message || '添加失败');
    } finally {
      setAddingToCe(false);
    }
  };

  const handleClearBom = () => {
    if (!selectedProject) return;
    modal.confirm({
      title: '确认清空BOM',
      icon: <ExclamationCircleOutlined />,
      content: '清空后当前工位的所有BOM物料将被删除，此操作不可恢复（草稿状态下）。确定继续吗？',
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await ceMaterialApi.clearBom(selectedProject, selectedWorkstation);
          message.success('BOM已清空');
          loadBomItems();
        } catch (err: any) {
          message.error(err.message || '清空失败');
        }
      }
    });
  };

  const handleDeleteItem = (item: BomItem) => {
    modal.confirm({
      title: '确认删除该行',
      content: `确定要删除物料「${item.part_code} - ${item.part_name}」吗？${bomInfo?.status === 'pending' ? '（审批中删除，审批通过后生效）' : ''}`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await ceMaterialApi.deleteBomItem(item.id, bomInfo?.status === 'pending' ? '审批删减' : '');
          message.success('已删除');
          loadBomItems();
        } catch (err: any) {
          message.error(err.message || '删除失败');
        }
      }
    });
  };

  const handleSubmitApproval = async () => {
    if (!selectedProject) return;
    try {
      const values = await submitForm.validateFields();
      setSubmitting(true);
      await ceMaterialApi.submitBomApproval(selectedProject, {
        workstation_id: selectedWorkstation,
        remarks: values.remarks,
        change_reason: values.change_reason
      });
      message.success('已提交审批，请等待审核');
      setSubmitModalVisible(false);
      submitForm.resetFields();
      loadBomItems();
    } catch (err: any) {
      message.error(err.message || '提交审批失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartChange = async () => {
    if (!selectedProject) return;
    try {
      const values = await changeForm.validateFields();
      setSubmitting(true);
      await ceMaterialApi.startBomChange(selectedProject, {
        workstation_id: selectedWorkstation,
        change_reason: values.change_reason
      });
      message.success('已进入变更编辑状态，可以继续编辑BOM');
      setChangeModalVisible(false);
      changeForm.resetFields();
      loadBomItems();
    } catch (err: any) {
      message.error(err.message || '发起变更失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRollbackVersion = (version: BomVersion) => {
    modal.confirm({
      title: `确认回滚到版本 ${version.version_label}`,
      content: '回滚后将用该版本覆盖当前BOM数据，并自动生成新版本记录。确定继续吗？',
      okText: '确认回滚',
      cancelText: '取消',
      onOk: async () => {
        try {
          await ceMaterialApi.rollbackBomVersion(version.id);
          message.success(`已回滚到版本${version.version_label}`);
          setVersionModalVisible(false);
          setVersionDetail(null);
          loadBomItems();
          loadVersions();
        } catch (err: any) {
          message.error(err.message || '回滚失败');
        }
      }
    });
  };

  const handleViewVersionDetail = async (version: BomVersion) => {
    try {
      const res: any = await ceMaterialApi.getBomVersionDetail(version.id);
      setVersionDetail(res);
    } catch (err: any) {
      message.error(err.message || '加载版本详情失败');
    }
  };

  const handleSelectUnmatched = () => {
    const unmatchedKeys = bomItems.filter(r => r.match_status === 'unmatched').map(r => r.id);
    setSelectedRowKeys(unmatchedKeys);
  };

  const unmatchedCount = bomStats.unmatched;
  const isDraft = !bomInfo || bomInfo.status === 'draft';
  const isPending = bomInfo?.status === 'pending';
  const isApproved = bomInfo?.status === 'approved';
  const canEdit = isDraft || isPending;
  const canImport = isDraft;
  const canClear = isDraft && bomStats.total > 0;
  const canSubmit = isDraft && bomStats.total > 0;
  const canChange = isApproved;

  const columns = [
    {
      title: '工位名称',
      dataIndex: 'workstation_name',
      key: 'workstation_name',
      width: 140,
      render: (t: string) => t || '-'
    },
    {
      title: 'BOM行号',
      dataIndex: 'bom_row_no',
      key: 'bom_row_no',
      width: 80
    },
    {
      title: '物料编码',
      dataIndex: 'part_code',
      key: 'part_code',
      width: 140,
      render: (t: string) => t || '-'
    },
    {
      title: '物料名称',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 180,
      ellipsis: true
    },
    {
      title: '规格',
      dataIndex: 'part_spec',
      key: 'part_spec',
      width: 140,
      ellipsis: true,
      render: (t: string) => t || '-'
    },
    {
      title: '品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (t: string, r: BomItem) => {
        const displayBrand = t || r.ce_brand || '-';
        return displayBrand;
      }
    },
    {
      title: '数量',
      dataIndex: 'qty',
      key: 'qty',
      width: 70
    },
    {
      title: '匹配状态',
      dataIndex: 'match_status',
      key: 'match_status',
      width: 100,
      render: (s: string) => {
        if (s === 'matched') return <Tag color="success">已匹配</Tag>;
        if (s === 'added') return <Tag color="processing">新增物料</Tag>;
        return <Tag color="error">未匹配</Tag>;
      }
    },
    {
      title: '关联CE物料',
      key: 'ce_material',
      width: 200,
      render: (_: any, r: BomItem) =>
        r.ce_part_code || r.ce_name
          ? `${r.ce_part_code || ''} ${r.ce_name || ''}`.trim()
          : '-'
    },
    {
      title: '存档状态',
      dataIndex: 'archive_status_manual',
      key: 'archive_status_manual',
      width: 130,
      render: (s: string) => <StatusTag status={s} map={ARCHIVE_STATUS_MANUAL_MAP} />
    },
    {
      title: '南德',
      dataIndex: 'nande_status',
      key: 'nande_status',
      width: 90,
      render: (s: string) => <StatusTag status={s} map={NANDE_STATUS_MAP} />
    },
    {
      title: '欧测',
      dataIndex: 'ouce_status',
      key: 'ouce_status',
      width: 90,
      render: (s: string) => <StatusTag status={s} map={OUCE_STATUS_MAP} />
    },
    {
      title: '合规状态',
      dataIndex: 'compliance_status',
      key: 'compliance_status',
      width: 90,
      render: (s: string) => <StatusTag status={s} map={COMPLIANCE_STATUS_MAP} />
    },
    {
      title: '存档资料',
      dataIndex: 'archive_names',
      key: 'archive_names',
      width: 180,
      ellipsis: true,
      render: (t: string) => t ? (
        <Tooltip title={t}>{t}</Tooltip>
      ) : '-'
    },
    {
      title: '替代型号建议',
      dataIndex: 'alternative_suggestion',
      key: 'alternative_suggestion',
      width: 140,
      ellipsis: true,
      render: (t: string) => t || '-'
    },
    {
      title: '备注',
      dataIndex: 'approval_remark',
      key: 'approval_remark',
      width: 160,
      ellipsis: true,
      render: (_: any, r: BomItem) => {
        const remark = r.approval_remark || r.reject_reason;
        return remark ? <Tooltip title={remark}>{remark}</Tooltip> : '-';
      }
    },
    {
      title: '操作',
      key: 'action',
      width: canEdit ? 200 : 120,
      fixed: 'right' as const,
      render: (_: any, r: BomItem) => (
        <Space size={0} wrap>
          {r.match_status === 'unmatched' && (
            <>
              <Button type="link" size="small" onClick={() => handleAddSingleToCe(r.id)}>
                加入CE
              </Button>
              {canEdit && (
                <Button type="link" size="small" onClick={() => setSelectedRowKeys([r.id])}>
                  选中
                </Button>
              )}
            </>
          )}
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => handleMatch(r)}>
            手动匹配
          </Button>
          {canEdit && (
            <Popconfirm title="确定删除该行？" onConfirm={() => handleDeleteItem(r)} okText="删除" okType="danger" cancelText="取消">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const ceMatColumns = [
    { title: '品号', dataIndex: 'part_code', key: 'part_code', width: 130, render: (t: string) => t || '-' },
    { title: '品名', dataIndex: 'part_name', key: 'part_name', width: 180, ellipsis: true },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (t: string) => t || '-' },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 100, render: (t: string) => t || '-' },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: CEMaterial) => (
        <Button type="primary" size="small" loading={matching} onClick={() => handleSelectMaterial(r.id)}>选择</Button>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    getCheckboxProps: (record: BomItem) => ({
      disabled: record.match_status === 'matched' || !canEdit
    })
  };

  return (
    <div>
      {!embedded && (
        <Card size="small" style={{ marginBottom: 12 }} title="项目BOM与CE物料匹配">
          <Row gutter={12}>
            <Col span={8}>
              <div style={{ marginBottom: 4, color: '#666' }}>选择项目</div>
              <Select
                placeholder="请选择项目"
                style={{ width: '100%' }}
                value={selectedProject}
                onChange={(v) => { setSelectedProject(v); setSelectedWorkstation(undefined); setBomInfo(null); }}
                allowClear
                showSearch
                optionFilterProp="label"
                options={projects.map(p => ({
                  label: `${p.project_code} - ${p.project_name}`,
                  value: p.id
                }))}
              />
            </Col>
          </Row>
        </Card>
      )}
      <Card
        size="small"
        title={
          <Space>
            {embedded ? 'CE BOM物料匹配' : null}
            {bomInfo && (
              <Space>
                <BomStatusTag status={bomInfo.status} />
                <Text type="secondary" style={{ fontSize: 13 }}>版本：{bomInfo.version_label}</Text>
                {bomInfo.submitter_name && <Text type="secondary" style={{ fontSize: 13 }}>提交人：{bomInfo.submitter_name}</Text>}
              </Space>
            )}
          </Space>
        }
        extra={
          <Space wrap>
            {embedded && (
              <Select
                placeholder="选择项目"
                style={{ width: 200 }}
                value={selectedProject}
                onChange={(v) => { setSelectedProject(v); setSelectedWorkstation(undefined); setBomInfo(null); }}
                allowClear
                showSearch
                optionFilterProp="label"
                options={projects.map(p => ({
                  label: `${p.project_code} - ${p.project_name}`,
                  value: p.id
                }))}
              />
            )}
            <Select
              placeholder="选择工位"
              style={{ width: 180 }}
              value={selectedWorkstation}
              onChange={setSelectedWorkstation}
              allowClear
              disabled={!selectedProject}
              options={workstations.map(w => ({
                label: `${w.station_code} - ${w.station_name}`,
                value: w.id
              }))}
            />
            <Upload {...uploadProps} disabled={importing || !selectedProject || !selectedWorkstation || !canImport}>
              <Button icon={<UploadOutlined />} loading={importing} disabled={!selectedProject || !selectedWorkstation || !canImport}>
                导入BOM
              </Button>
            </Upload>
            <Button
              icon={<DownloadOutlined />}
              disabled={!selectedProject}
              onClick={() => {
                if (!selectedProject) return;
                ceMaterialApi.downloadBomTemplate(selectedProject).catch((e: any) => message.error(e?.message || '下载模板失败'));
              }}
            >
              下载模板
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!selectedProject}
              onClick={() => {
                if (!selectedProject) return;
                const params: any = {};
                if (selectedWorkstation) params.workstation_id = selectedWorkstation;
                ceMaterialApi.exportBom(selectedProject, params).catch((e: any) => message.error(e?.message || '导出BOM失败'));
              }}
            >
              导出BOM清单
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadBomItems} disabled={!selectedProject}>
              刷新
            </Button>
            {canClear && (
              <Button icon={<ClearOutlined />} danger onClick={handleClearBom}>
                一键清空
              </Button>
            )}
            {canChange && (
              <Button icon={<EditOutlined />} type="primary" onClick={() => { changeForm.resetFields(); setChangeModalVisible(true); }}>
                发起变更
              </Button>
            )}
            {canSubmit && (
              <Button icon={<SendOutlined />} type="primary" onClick={() => { submitForm.resetFields(); setSubmitModalVisible(true); }}>
                提交审批
              </Button>
            )}
            <Button icon={<HistoryOutlined />} onClick={() => { setVersionModalVisible(true); setVersionDetail(null); loadVersions(); }} disabled={!selectedProject}>
              版本历史
            </Button>
            <Select
              value={matchStatusFilter}
              onChange={setMatchStatusFilter}
              style={{ width: 120 }}
              disabled={!selectedProject}
              options={[
                { label: '全部', value: 'all' },
                { label: '已匹配', value: 'matched' },
                { label: '未匹配', value: 'unmatched' },
                { label: '新增物料', value: 'added' }
              ]}
            />
          </Space>
        }
      >
        {!selectedProject ? (
          <Empty description="请先选择项目" style={{ padding: '40px 0' }} />
        ) : (
          <>
            {bomInfo?.status === 'pending' && (
              <Alert
                message="BOM审批中"
                description={
                  <Space direction="vertical" size={4}>
                    <span>BOM已提交审批，当前状态为审批中。审批人可以删减物料行，审批通过后BOM将正式受控。</span>
                    {bomInfo.reject_reason && <Text type="danger">上次驳回原因：{bomInfo.reject_reason}</Text>}
                  </Space>
                }
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
              />
            )}
            {bomInfo?.status === 'approved' && (
              <Alert
                message="BOM已受控"
                description="当前BOM已审批通过并受控。如需修改请点击「发起变更」进入编辑状态，修改后重新提交审批。"
                type="success"
                showIcon
                style={{ marginBottom: 12 }}
              />
            )}
            {unmatchedCount > 0 && isDraft && (
              <Alert
                message={
                  <Space>
                    <span>有 <strong style={{ color: '#cf1322' }}>{unmatchedCount}</strong> 条物料未匹配CE物料清单</span>
                    <Button size="small" onClick={handleSelectUnmatched}>全选未匹配</Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<PlusOutlined />}
                      loading={addingToCe}
                      disabled={selectedRowKeys.length === 0}
                      onClick={handleAddSelectedToCe}
                    >
                      加入CE物料清单 ({selectedRowKeys.filter(k => {
                        const item = bomItems.find(b => b.id === k);
                        return item && item.match_status === 'unmatched';
                      }).length})
                    </Button>
                  </Space>
                }
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
              />
            )}
            {bomStats.total > 0 && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4 }}>
                <Space size="large">
                  <span>物料总数：<strong>{bomStats.total}</strong></span>
                  <span style={{ color: '#52c41a' }}>已匹配：{bomStats.matched}</span>
                  <span style={{ color: '#1890ff' }}>新增物料：{bomStats.added}</span>
                  <span style={{ color: '#ff4d4f' }}>未匹配：{bomStats.unmatched}</span>
                </Space>
              </div>
            )}
            <ResizableTable
              tableKey="project_ce_bom"
              columns={columns}
              dataSource={bomItems}
              rowKey="id"
              loading={loading}
              size="small"
              scroll={{ x: 2400 }}
              pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '200'] }}
              rowClassName={(r) => {
                if (r.match_status === 'unmatched') return 'ce-bom-unmatched-row';
                if (r.match_status === 'added') return 'ce-bom-added-row';
                return '';
              }}
              rowSelection={canEdit ? rowSelection : undefined}
            />
          </>
        )}
      </Card>

      <Modal title="手动匹配CE物料" open={matchModalVisible} onCancel={() => setMatchModalVisible(false)} footer={null} destroyOnHidden
       className="modal-lg" width={800}>
        {currentBomItem && (
          <div style={{ marginBottom: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            <div>BOM物料：<strong>{currentBomItem.part_code || '-'} - {currentBomItem.part_name}</strong></div>
            <div>规格：{currentBomItem.part_spec || '-'} / 品牌：{currentBomItem.brand || '-'}</div>
          </div>
        )}
        <Form form={searchForm} layout="inline" style={{ marginBottom: 12 }}>
          <Form.Item name="keyword">
            <Input placeholder="输入品号/品名/品牌搜索" style={{ width: 300 }} onPressEnter={handleSearchMaterial} allowClear />
          </Form.Item>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearchMaterial}>搜索</Button>
        </Form>
        <ResizableTable
          tableKey="project_ce_bom_match"
          columns={ceMatColumns}
          dataSource={ceMaterials}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8 }}
          scroll={{ x: 600 }}
        />
      </Modal>

      <Modal
        title="提交BOM审批"
        open={submitModalVisible}
        onOk={handleSubmitApproval}
        onCancel={() => setSubmitModalVisible(false)}
        confirmLoading={submitting}
        okText="提交审批"
        cancelText="取消"
      >
        <Alert
          message="提交审批后BOM进入审批中状态，审批人审核通过后BOM将正式受控"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={submitForm} layout="vertical">
          <Form.Item name="remarks" label="备注（可选）">
            <Input.TextArea rows={3} placeholder="请输入审批备注说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发起BOM变更"
        open={changeModalVisible}
        onOk={handleStartChange}
        onCancel={() => setChangeModalVisible(false)}
        confirmLoading={submitting}
        okText="发起变更"
        cancelText="取消"
      >
        <Alert
          message="发起变更后BOM将进入草稿状态，您可以编辑物料（导入/新增/删除/匹配），完成后重新提交审批"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={changeForm} layout="vertical">
          <Form.Item name="change_reason" label="变更原因" rules={[{ required: true, message: '请输入变更原因' }]}>
            <Input.TextArea rows={3} placeholder="请输入BOM变更原因" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="BOM版本历史"
        open={versionModalVisible}
        onCancel={() => { setVersionModalVisible(false); setVersionDetail(null); }}
        footer={null}
        width={versionDetail ? 900 : 700}
      >
        {!versionDetail ? (
          <>
            {versions.length === 0 ? (
              <Empty description="暂无版本记录" />
            ) : (
              <Timeline
                items={versions.map(v => ({
                  color: v.status === 'approved' ? 'green' : v.status === 'rejected' ? 'red' : 'blue',
                  children: (
                    <div style={{ paddingBottom: 12 }}>
                      <Space>
                        <Text strong>{v.version_label}</Text>
                        <Tag color={BOM_STATUS_MAP[v.status]?.color || 'default'}>{BOM_STATUS_MAP[v.status]?.label || v.status}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>{v.submitted_at || v.created_at}</Text>
                      </Space>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">提交人：{v.submitter_name || '-'}</Text>
                        {v.approver_name && <Text type="secondary" style={{ marginLeft: 16 }}>审批人：{v.approver_name}</Text>}
                      </div>
                      {v.change_reason && <div style={{ marginTop: 4 }}>变更原因：{v.change_reason}</div>}
                      {v.reject_reason && <div style={{ color: '#ff4d4f', marginTop: 4 }}>驳回原因：{v.reject_reason}</div>}
                      <div style={{ marginTop: 8 }}>
                        <Space>
                          <Button size="small" onClick={() => handleViewVersionDetail(v)}>查看详情</Button>
                          {v.status === 'approved' && bomInfo?.status !== 'pending' && (
                            <Button size="small" icon={<RollbackOutlined />} onClick={() => handleRollbackVersion(v)}>回滚到此版本</Button>
                          )}
                        </Space>
                      </div>
                    </div>
                  )
                }))}
              />
            )}
          </>
        ) : (
          <div>
            <Button type="link" style={{ padding: 0, marginBottom: 12 }} onClick={() => setVersionDetail(null)}>
              ← 返回版本列表
            </Button>
            <Descriptions title={`版本 ${versionDetail.version?.version_label} 详情`} bordered size="small" column={2}>
              <Descriptions.Item label="版本号">{versionDetail.version?.version_label}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={BOM_STATUS_MAP[versionDetail.version?.status]?.color}>{BOM_STATUS_MAP[versionDetail.version?.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="物料总数">{versionDetail.version?.item_count}</Descriptions.Item>
              <Descriptions.Item label="已匹配">{versionDetail.version?.matched_count}</Descriptions.Item>
              <Descriptions.Item label="提交人">{versionDetail.version?.submitter_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="提交时间">{versionDetail.version?.submitted_at || '-'}</Descriptions.Item>
              {versionDetail.version?.approver_name && <Descriptions.Item label="审批人">{versionDetail.version?.approver_name}</Descriptions.Item>}
              {versionDetail.version?.approved_at && <Descriptions.Item label="审批时间">{versionDetail.version?.approved_at}</Descriptions.Item>}
              {versionDetail.version?.change_reason && <Descriptions.Item label="变更原因" span={2}>{versionDetail.version?.change_reason}</Descriptions.Item>}
              {versionDetail.version?.reject_reason && <Descriptions.Item label="驳回原因" span={2}><Text type="danger">{versionDetail.version?.reject_reason}</Text></Descriptions.Item>}
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>BOM物料清单（{versionDetail.items?.length || 0}条）</div>
              <Table
                size="small"
                dataSource={versionDetail.items || []}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 800 }}
                columns={[
                  { title: '行号', dataIndex: 'bom_row_no', key: 'bom_row_no', width: 60 },
                  { title: '物料编码', dataIndex: 'part_code', key: 'part_code', width: 130 },
                  { title: '物料名称', dataIndex: 'part_name', key: 'part_name', width: 160, ellipsis: true },
                  { title: '规格', dataIndex: 'part_spec', key: 'part_spec', width: 140, ellipsis: true },
                  { title: '品牌', dataIndex: 'brand', key: 'brand', width: 90 },
                  { title: '数量', dataIndex: 'qty', key: 'qty', width: 60 },
                  { title: '匹配状态', dataIndex: 'match_status', key: 'match_status', width: 90, render: (s: string) => {
                    if (s === 'matched') return <Tag color="success">已匹配</Tag>;
                    if (s === 'added') return <Tag color="processing">新增</Tag>;
                    return <Tag color="error">未匹配</Tag>;
                  }}
                ]}
              />
            </div>
            {versionDetail.approval_record && versionDetail.step_records?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>审批记录</div>
                <Timeline
                  items={versionDetail.step_records.map((s: any) => ({
                    color: s.status === 'approved' ? 'green' : s.status === 'rejected' ? 'red' : 'gray',
                    children: (
                      <div>
                        <Space>
                          <Text strong>步骤{s.step_index}：{s.approver_name || '审批人'}</Text>
                          <Tag color={s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'error' : 'default'}>
                            {s.status === 'approved' ? '已通过' : s.status === 'rejected' ? '已驳回' : '待审批'}
                          </Tag>
                        </Space>
                        {s.comment && <div style={{ marginTop: 4 }}>意见：{s.comment}</div>}
                        {s.approved_at && <div style={{ fontSize: 12, color: '#999' }}>{s.approved_at}</div>}
                      </div>
                    )
                  }))}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <style>{`
        .ce-bom-unmatched-row {
          background-color: #fff1f0 !important;
        }
        .ce-bom-unmatched-row:hover > td {
          background-color: #ffccc7 !important;
        }
        .ce-bom-added-row {
          background-color: #e6f7ff !important;
        }
        .ce-bom-added-row:hover > td {
          background-color: #bae7ff !important;
        }
      `}</style>
    </div>
  );
};

export default CeBomTab;
