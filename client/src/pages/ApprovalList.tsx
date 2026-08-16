import React, { useEffect, useState, useRef } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Tag, Space, Card, Tabs, Steps, Timeline,
  App, Descriptions, DatePicker, Row, Col, Badge, Alert
} from 'antd';
import {
  CheckOutlined, CloseOutlined, EyeOutlined, RollbackOutlined, DownloadOutlined
} from '@ant-design/icons';
import { approvalApi, ceMaterialApi } from '@/api';
import {
  ApprovalRecord, ApprovalStepRecord, STATUS_MAP,
  NANDE_STATUS_OPTIONS, OUCE_STATUS_OPTIONS, ARCHIVE_STATUS_MANUAL_OPTIONS
} from '@/types';
import { useAppStore } from '@/store';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ResizableTable } from '../components/ResizableTable';

const { TextArea } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Step } = Steps;

const MODULE_MAP: Record<string, { label: string; color: string; path: string }> = {
  project_plan: { label: '项目计划审批', color: 'blue', path: '/plans' },
  acceptance_form: { label: '验收单审批', color: 'purple', path: '/acceptance/forms' },
  acceptance_plan: { label: '验收计划审批', color: 'cyan', path: '/acceptance/plans' },
  improvement: { label: '持续改进审批', color: 'orange', path: '/improvement' },
  ce_archive: { label: 'CE物料存档审批', color: 'green', path: '/ce-materials' },
  ce_bom: { label: 'BOM受控审批', color: 'geekblue', path: '/ce-materials' }
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error'
};

const ApprovalList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<ApprovalRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [ceBatchInfo, setCeBatchInfo] = useState<any>(null);
  const [ceMaterialInfo, setCeMaterialInfo] = useState<any>(null);
  const [bomVersionInfo, setBomVersionInfo] = useState<any>(null);
  const [bomDeleteIds, setBomDeleteIds] = useState<number[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const ceFormDefaultsRef = useRef<any>(null);

  const loadCEInfo = async (record: ApprovalRecord) => {
    if (record.module !== 'ce_archive') return;
    const bid = record.business_id || record.record_id;
    if (!bid || !String(bid).startsWith('ce_batch_')) return;
    try {
      const batchId = String(bid).replace('ce_batch_', '');
      const batchRes: any = await ceMaterialApi.getBatch(parseInt(batchId));
      const batchData = batchRes?.data || batchRes;
      setCeBatchInfo(batchData);
      setCeMaterialInfo(batchData?.material || null);
      const mat = batchData?.material || {};
      const defaultVals = {
        nande_status: mat.nande_status || 'pending',
        ouce_status: mat.ouce_status || 'pending',
        archive_status_manual: mat.archive_status_manual || 'not_archived',
        alternative_suggestion: mat.alternative_suggestion || '',
        approval_remark: mat.approval_remark || ''
      };
      ceFormDefaultsRef.current = defaultVals;
    } catch (err) {
      console.error('加载CE审批信息失败', err);
    }
  };

  const loadBomVersionInfo = async (record: ApprovalRecord) => {
    if (record.module !== 'ce_bom') return;
    const versionId = record.business_id || record.record_id;
    if (!versionId) return;
    try {
      const res: any = await ceMaterialApi.getBomVersionDetail(versionId as number);
      setBomVersionInfo(res);
      setBomDeleteIds([]);
    } catch (err) {
      console.error('加载BOM版本信息失败', err);
    }
  };

  const [filters, setFilters] = useState({
    module: undefined as string | undefined,
    status: undefined as string | undefined,
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null
  });

  useEffect(() => {
    fetchRecords();
  }, [activeTab]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      let res;
      if (activeTab === 'pending') {
        res = await approvalApi.myPending();
        const arr = Array.isArray(res) ? res : (res.list || []);
        setPendingCount(arr.length);
        setRecords(arr);
        return;
      } else if (activeTab === 'submitted') {
        res = await approvalApi.records({ submitter_id: user?.id });
      } else {
        const params: any = {};
        if (filters.module) params.module = filters.module;
        if (filters.status) params.status = filters.status;
        if (filters.dateRange) {
          params.start_date = filters.dateRange[0].format('YYYY-MM-DD');
          params.end_date = filters.dateRange[1].format('YYYY-MM-DD');
        }
        res = await approvalApi.records(params);
      }
      setRecords(Array.isArray(res) ? res : (res.list || []));
    } catch (err: any) {
      message.error(err.message || '获取审批记录失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res: any = await approvalApi.getRecord(id);
      const rec = res?.data || res;
      setCurrentRecord(rec);
      setCeBatchInfo(null);
      setCeMaterialInfo(null);
      setBomVersionInfo(null);
      setBomDeleteIds([]);
      setDetailVisible(true);
      if (rec?.module === 'ce_archive') {
        setTimeout(() => loadCEInfo(rec), 100);
      } else if (rec?.module === 'ce_bom') {
        setTimeout(() => loadBomVersionInfo(rec), 100);
      }
    } catch (err: any) {
      message.error(err.message || '获取审批详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleView = (record: ApprovalRecord) => {
    fetchDetail(record.id);
  };

  const handleApprove = async () => {
    try {
      const values = await approveForm.validateFields();
      setApproveLoading(true);
      const data: any = { comment: values.comment || '' };
      if (currentRecord?.module === 'ce_archive') {
        data.form_data = {
          nande_status: values.nande_status,
          ouce_status: values.ouce_status,
          archive_status_manual: values.archive_status_manual,
          alternative_suggestion: values.alternative_suggestion,
          approval_remark: values.approval_remark
        };
      } else if (currentRecord?.module === 'ce_bom') {
        data.form_data = {
          delete_item_ids: bomDeleteIds
        };
      }
      await approvalApi.approve(currentRecord!.id, data);
      message.success('审批通过');
      setDetailVisible(false);
      approveForm.resetFields();
      setBomDeleteIds([]);
      fetchRecords();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '审批失败');
    } finally {
      setApproveLoading(false);
    }
  };

  const openRejectModal = () => {
    setRejectModalVisible(true);
  };

  const handleDetailAfterOpen = (open: boolean) => {
    if (!open) return;
    setTimeout(() => {
      const defaults = ceFormDefaultsRef.current;
      if (defaults) {
        approveForm.setFieldsValue(defaults);
      } else {
        approveForm.resetFields();
      }
    }, 50);
  };

  const handleRejectModalAfterOpen = (open: boolean) => {
    if (!open) return;
    setTimeout(() => {
      const defaults = ceFormDefaultsRef.current;
      if (defaults) {
        rejectForm.setFieldsValue({ ...defaults, reject_reason: '' });
      } else {
        rejectForm.resetFields();
      }
    }, 50);
  };

  const handleReject = async () => {
    try {
      const values = await rejectForm.validateFields();
      setRejectLoading(true);
      const data: any = { reject_reason: values.reject_reason };
      if (currentRecord?.module === 'ce_archive') {
        data.form_data = {
          nande_status: values.nande_status,
          ouce_status: values.ouce_status,
          archive_status_manual: values.archive_status_manual,
          alternative_suggestion: values.alternative_suggestion,
          approval_remark: values.approval_remark || values.reject_reason
        };
      }
      await approvalApi.reject(currentRecord!.id, data);
      message.success('已驳回');
      setRejectModalVisible(false);
      setDetailVisible(false);
      fetchRecords();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '驳回失败');
    } finally {
      setRejectLoading(false);
    }
  };

  const isCurrentApprover = (record: ApprovalRecord | null) => {
    if (!record || record.status !== 'pending') return false;
    const stepRecords = record.step_records || [];
    const currentStepRecord = stepRecords.find(sr => sr.step_index === record.current_step && sr.status === 'pending');
    return currentStepRecord && currentStepRecord.approver_id === user?.id;
  };

  const goToOriginalRecord = (record: ApprovalRecord) => {
    const moduleInfo = MODULE_MAP[record.module];
    if (!moduleInfo) return;
    if (record.module === 'ce_archive') {
      const matId = ceMaterialInfo?.id;
      navigate(matId ? `${moduleInfo.path}?materialId=${matId}` : moduleInfo.path);
    } else {
      navigate(`${moduleInfo.path}/${record.record_id}`);
    }
  };

  const renderCEForm = (formName: 'approve' | 'reject') => {
    if (currentRecord?.module !== 'ce_archive' || !ceMaterialInfo) return null;
    const mat = ceMaterialInfo;
    const archives = ceBatchInfo?.archives || [];
    return (
      <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 4, border: '1px solid #b7eb8f' }}>
        <div style={{ marginBottom: 8 }}>
          <strong>物料信息：</strong>{mat.part_code || '-'} - {mat.part_name}
          {mat.spec && <span style={{ marginLeft: 8, color: '#666' }}>规格: {mat.spec}</span>}
        </div>
        {archives.length > 0 && (
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            <strong>待审批存档（{archives.length}份）：</strong>
            {archives.map((a: any) => (
              <Tag key={a.id} color="blue" style={{ marginBottom: 4 }}>{a.type_name}: {a.original_name}</Tag>
            ))}
          </div>
        )}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="nande_status"
              label="南德确认"
              initialValue="approved"
              style={{ marginBottom: 8 }}
            >
              <Select options={NANDE_STATUS_OPTIONS.filter(o => o.value !== 'na')} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="ouce_status"
              label="欧测确认"
              initialValue="approved"
              style={{ marginBottom: 8 }}
            >
              <Select options={OUCE_STATUS_OPTIONS.filter(o => o.value !== 'na')} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="archive_status_manual"
          label="存档状态"
          initialValue="archived"
          style={{ marginBottom: 8 }}
        >
          <Select options={ARCHIVE_STATUS_MANUAL_OPTIONS.filter(o => o.value !== 'not_archived')} />
        </Form.Item>
        <Form.Item
          name="alternative_suggestion"
          label="替代品号/规格"
          style={{ marginBottom: 8 }}
        >
          <Input placeholder="如有替代品号/规格建议请填写" />
        </Form.Item>
        {formName === 'approve' && (
          <Form.Item
            name="approval_remark"
            label="备注"
            style={{ marginBottom: 8 }}
          >
            <TextArea rows={2} placeholder="审批备注（可选）" maxLength={500} showCount />
          </Form.Item>
        )}
      </div>
    );
  };

  const getStepStatus = (stepIndex: number, record: ApprovalRecord): 'wait' | 'process' | 'finish' | 'error' => {
    const stepRecords = record.step_records || [];
    const sr = stepRecords.find(s => s.step_index === stepIndex);
    if (!sr) {
      if (stepIndex < record.current_step) return 'finish';
      if (stepIndex === record.current_step) return 'process';
      return 'wait';
    }
    if (sr.status === 'approved') return 'finish';
    if (sr.status === 'rejected') return 'error';
    if (stepIndex === record.current_step && record.status === 'pending') return 'process';
    return 'wait';
  };

  const columns = [
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 140,
      render: (module: string) => {
        const info = MODULE_MAP[module];
        return <Tag color={info?.color || 'default'}>{info?.label || module}</Tag>;
      }
    },
    {
      title: '流程名称',
      dataIndex: 'flow_name',
      key: 'flow_name',
      width: 160,
      render: (_: any, record: any) => record.flow?.flow_name || '-'
    },
    {
      title: '提交人',
      dataIndex: 'submitter_name',
      key: 'submitter_name',
      width: 100
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '当前步骤',
      key: 'current_step',
      width: 200,
      render: (_: any, record: ApprovalRecord) => {
        const steps = record.flow?.steps || [];
        if (steps.length === 0) return '-';
        return (
          <Steps size="small" current={record.current_step - 1}>
            {steps.slice(0, 4).map((s: any, i: number) => (
              <Step key={i} title={s.name} status={getStepStatus(i + 1, record)} />
            ))}
            {steps.length > 4 && <Step title="..." />}
          </Steps>
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={STATUS_COLORS[status] || info.color}>{info.label}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: ApprovalRecord) => (
        <Space>
          {activeTab === 'pending' && record.status === 'pending' && (
            <Button type="primary" size="small" onClick={() => handleView(record)}>审批</Button>
          )}
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看详情
          </Button>
        </Space>
      )
    }
  ];

  const renderTabFilter = () => {
    if (activeTab !== 'all') return null;
    return (
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="选择模块"
            style={{ width: 160 }}
            allowClear
            showSearch
            filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
            value={filters.module}
            onChange={(v) => setFilters({ ...filters, module: v })}
          >
            {Object.entries(MODULE_MAP).map(([key, val]) => (
              <Option key={key} value={key}>{val.label}</Option>
            ))}
          </Select>
        </Col>
        <Col>
          <Select
            placeholder="选择状态"
            style={{ width: 120 }}
            allowClear
            showSearch
            filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
          >
            <Option value="pending">待审批</Option>
            <Option value="approved">已批准</Option>
            <Option value="rejected">已驳回</Option>
          </Select>
        </Col>
        <Col>
          <RangePicker
            value={filters.dateRange}
            onChange={(dates) => setFilters({ ...filters, dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs] | null })}
          />
        </Col>
        <Col>
          <Button type="primary" onClick={fetchRecords}>查询</Button>
        </Col>
        <Col>
          <Button onClick={() => {
            setFilters({ module: undefined, status: undefined, dateRange: null });
            setTimeout(fetchRecords, 0);
          }}>重置</Button>
        </Col>
      </Row>
    );
  };

  const renderTimeline = () => {
    if (!currentRecord) return null;
    const steps = currentRecord.flow?.steps || [];
    const stepRecords = currentRecord.step_records || [];

    const items = steps.map((step, i) => {
      const stepIndex = i + 1;
      const sr = stepRecords.find(s => s.step_index === stepIndex);
      let color = 'gray';
      let children: React.ReactNode;

      if (sr) {
        if (sr.status === 'approved') {
          color = 'green';
          children = (
            <div>
              <p style={{ margin: 0 }}><strong>步骤 {stepIndex}：{step.name}</strong></p>
              <p style={{ margin: 0, color: '#666' }}>
                审批人：{sr.approver_name} | 审批时间：{sr.approved_at ? dayjs(sr.approved_at).format('YYYY-MM-DD HH:mm') : '-'}
              </p>
              {sr.comment && <p style={{ margin: 0, color: '#666' }}>审批意见：{sr.comment}</p>}
            </div>
          );
        } else if (sr.status === 'rejected') {
          color = 'red';
          children = (
            <div>
              <p style={{ margin: 0 }}><strong>步骤 {stepIndex}：{step.name}</strong></p>
              <p style={{ margin: 0, color: '#666' }}>
                审批人：{sr.approver_name} | 驳回时间：{sr.approved_at ? dayjs(sr.approved_at).format('YYYY-MM-DD HH:mm') : '-'}
              </p>
              <p style={{ margin: 0, color: '#ff4d4f' }}>驳回原因：{currentRecord.reject_reason || sr.comment}</p>
            </div>
          );
        } else {
          color = 'blue';
          children = (
            <div>
              <p style={{ margin: 0 }}><strong>步骤 {stepIndex}：{step.name}</strong></p>
              <p style={{ margin: 0, color: '#666' }}>待审批人：{sr.approver_name}</p>
            </div>
          );
        }
      } else {
        children = (
          <div>
            <p style={{ margin: 0, color: '#999' }}><strong>步骤 {stepIndex}：{step.name}</strong></p>
            <p style={{ margin: 0, color: '#bbb' }}>待处理</p>
          </div>
        );
      }

      return { key: stepIndex, color, children };
    });

    return <Timeline items={items} />;
  };

  const tabItems = [
    { key: 'pending', label: <Badge count={pendingCount} size="small" offset={[8, 0]}><span>待我审批</span></Badge> },
    { key: 'submitted', label: '我提交的' },
    { key: 'all', label: '全部审批' }
  ];

  return (
    <div>
      <Card title="审批管理">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
        {renderTabFilter()}
        <ResizableTable
          tableKey="approval_list"
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title="审批详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        afterOpenChange={handleDetailAfterOpen}
        width={currentRecord?.module === 'ce_archive' ? 800 : currentRecord?.module === 'ce_bom' ? 1000 : 750}
        footer={
          currentRecord && isCurrentApprover(currentRecord) ? (
            <Space>
              <Button onClick={() => setDetailVisible(false)}>关闭</Button>
              <Button danger icon={<CloseOutlined />} onClick={openRejectModal} loading={rejectLoading}>
                驳回
              </Button>
              <Button type="primary" icon={<CheckOutlined />} onClick={handleApprove} loading={approveLoading}>
                通过
              </Button>
            </Space>
          ) : (
            <Button onClick={() => setDetailVisible(false)}>关闭</Button>
          )
        }
        className={currentRecord?.module === 'ce_bom' ? 'modal-xl' : 'modal-lg'}
      >
        {currentRecord && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="模块" span={1}>
                <Tag color={MODULE_MAP[currentRecord.module]?.color || 'default'}>
                  {MODULE_MAP[currentRecord.module]?.label || currentRecord.module}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态" span={1}>
                <Tag color={STATUS_COLORS[currentRecord.status]}>
                  {STATUS_MAP[currentRecord.status]?.label || currentRecord.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="流程名称" span={1}>
                {currentRecord.flow?.flow_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="提交人" span={1}>
                {currentRecord.submitter_name}
              </Descriptions.Item>
              <Descriptions.Item label="提交时间" span={1}>
                {currentRecord.submitted_at ? dayjs(currentRecord.submitted_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="关联单据" span={1}>
                <Button type="link" size="small" onClick={() => goToOriginalRecord(currentRecord)}>
                  查看原单据
                </Button>
              </Descriptions.Item>
            </Descriptions>

            {currentRecord.module === 'ce_archive' && ceMaterialInfo && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>物料信息</h4>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="物料品号" span={1}>
                    {ceMaterialInfo.part_code || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="物料品名" span={1}>
                    {ceMaterialInfo.part_name || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="规格" span={1}>
                    {ceMaterialInfo.spec || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="品牌" span={1}>
                    {ceMaterialInfo.brand || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="类别" span={1}>
                    {ceMaterialInfo.category || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="选型负责人" span={1}>
                    {ceMaterialInfo.selector_name || '-'}
                  </Descriptions.Item>
                </Descriptions>
                <h4 style={{ margin: '12px 0 8px' }}>存档文件列表（{(ceBatchInfo?.archives || []).length}份）</h4>
                <ResizableTable
                  tableKey="approval_archives"
                  size="small"
                  pagination={false}
                  rowKey="id"
                  dataSource={ceBatchInfo?.archives || []}
                  columns={[
                    { title: '文档类型', dataIndex: 'type_name', key: 'type_name', width: 120 },
                    {
                      title: '文件名',
                      dataIndex: 'original_name',
                      key: 'fname',
                      ellipsis: true,
                      render: (_: any, r: any) => {
                        const ext = r.file_name?.includes('.') ? r.file_name.substring(r.file_name.lastIndexOf('.')) : '';
                        return r.archive_code ? `${r.archive_code}${ext}` : (r.original_name || '-');
                      }
                    },
                    { title: '证书号', dataIndex: 'cert_no', key: 'cert_no', width: 120, render: (v: string) => v || '-' },
                    { title: '版本', dataIndex: 'version_no', key: 'version_no', width: 60, render: (v: string) => v || '-' },
                    {
                      title: '操作',
                      key: 'op',
                      width: 140,
                      render: (_: any, r: any) => (
                        <Space size={0}>
                          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => ceMaterialApi.previewArchive(r.id)}>
                            预览
                          </Button>
                          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => ceMaterialApi.downloadArchive(r.id)}>
                            下载
                          </Button>
                        </Space>
                      )
                    }
                  ]}
                />
              </div>
            )}

            {currentRecord.module === 'ce_bom' && bomVersionInfo && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ marginBottom: 8 }}>BOM版本信息</h4>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="版本号" span={1}>
                    {bomVersionInfo.version?.version_label || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="物料数量" span={1}>
                    {bomVersionInfo.version?.item_count || 0} 条（已匹配：{bomVersionInfo.version?.matched_count || 0}）
                  </Descriptions.Item>
                  {bomVersionInfo.version?.change_reason && (
                    <Descriptions.Item label="变更原因" span={2}>
                      {bomVersionInfo.version.change_reason}
                    </Descriptions.Item>
                  )}
                  {bomVersionInfo.version?.remarks && (
                    <Descriptions.Item label="备注" span={2}>
                      {bomVersionInfo.version.remarks}
                    </Descriptions.Item>
                  )}
                </Descriptions>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>BOM物料清单</strong>
                    {isCurrentApprover(currentRecord) && (
                      <Space>
                        {bomDeleteIds.length > 0 && (
                          <Tag color="orange">已标记删除 {bomDeleteIds.length} 条</Tag>
                        )}
                        <Button size="small" onClick={() => setBomDeleteIds([])}>重置删减</Button>
                      </Space>
                    )}
                  </div>
                  <Alert
                    message="审批人可对不合规物料进行删除，审批通过后删除项将生效"
                    type="info"
                    showIcon
                    style={{ marginBottom: 8 }}
                  />
                  <Table
                    size="small"
                    dataSource={bomVersionInfo.items || []}
                    rowKey="id"
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 900 }}
                    rowClassName={(r: any) => bomDeleteIds.includes(r.id) ? 'bom-delete-row' : ''}
                    columns={[
                      { title: '行号', dataIndex: 'bom_row_no', key: 'bom_row_no', width: 60 },
                      { title: '物料编码', dataIndex: 'part_code', key: 'part_code', width: 120, render: (t: string) => t || '-' },
                      { title: '物料名称', dataIndex: 'part_name', key: 'part_name', width: 150, ellipsis: true },
                      { title: '规格', dataIndex: 'part_spec', key: 'part_spec', width: 120, ellipsis: true, render: (t: string) => t || '-' },
                      { title: '品牌', dataIndex: 'brand', key: 'brand', width: 80, render: (t: string) => t || '-' },
                      { title: '数量', dataIndex: 'qty', key: 'qty', width: 55 },
                      {
                        title: '匹配状态', dataIndex: 'match_status', key: 'match_status', width: 80,
                        render: (s: string) => {
                          if (s === 'matched') return <Tag color="success">已匹配</Tag>;
                          if (s === 'added') return <Tag color="processing">新增</Tag>;
                          return <Tag color="error">未匹配</Tag>;
                        }
                      },
                      {
                        title: '合规状态', dataIndex: 'compliance_status', key: 'compliance_status', width: 80,
                        render: (s: string) => {
                          if (s === 'approved') return <Tag color="success">合规</Tag>;
                          if (s === 'rejected') return <Tag color="error">不合规</Tag>;
                          return <Tag>待审</Tag>;
                        }
                      },
                      isCurrentApprover(currentRecord) ? {
                        title: '操作', key: 'op', width: 80, fixed: 'right' as const,
                        render: (_: any, r: any) => {
                          const isDeleted = bomDeleteIds.includes(r.id);
                          return isDeleted ? (
                            <Button type="link" size="small" onClick={() => setBomDeleteIds(bomDeleteIds.filter(id => id !== r.id))}>
                              恢复
                            </Button>
                          ) : (
                            <Button type="link" size="small" danger onClick={() => setBomDeleteIds([...bomDeleteIds, r.id])}>
                              删除
                            </Button>
                          );
                        }
                      } : {}
                    ].filter(c => Object.keys(c).length > 0)}
                  />
                </div>
              </div>
            )}

            <Steps
              size="small"
              current={currentRecord.current_step - 1}
              status={currentRecord.status === 'rejected' ? 'error' : currentRecord.status === 'approved' ? 'finish' : 'process'}
              style={{ marginBottom: 16 }}
            >
              {(currentRecord.flow?.steps || []).map((s: any, i: number) => (
                <Step key={i} title={s.name} status={getStepStatus(i + 1, currentRecord)} />
              ))}
            </Steps>

            <h4>审批流程记录</h4>
            {renderTimeline()}
          </div>
        )}
        {detailLoading && <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>}
        <Form form={approveForm} layout="vertical" style={isCurrentApprover(currentRecord) ? { marginTop: 24 } : { display: 'none' }}>
          {isCurrentApprover(currentRecord) && (
            <>
              <h4>审批填写</h4>
              {renderCEForm('approve')}
              <Form.Item name="comment" label="审批意见（可选）">
                <TextArea rows={currentRecord?.module === 'ce_archive' ? 2 : 3} placeholder="请输入审批意见" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        title={currentRecord?.module === 'ce_archive' ? "驳回审批（物料将标记为不合规）" : "驳回审批"}
        open={rejectModalVisible}
        onOk={handleReject}
        onCancel={() => setRejectModalVisible(false)}
        afterOpenChange={handleRejectModalAfterOpen}
        confirmLoading={rejectLoading}
        okText="确认驳回"
        okType="danger"
        width={currentRecord?.module === 'ce_archive' ? 700 : 520}
        destroyOnHidden
        className="modal-md"
      >
        <Form form={rejectForm} layout="vertical">
          {currentRecord?.module === 'ce_archive' && renderCEForm('reject')}
          <Form.Item
            name="reject_reason"
            label={currentRecord?.module === 'ce_archive' ? "不合规原因/驳回原因" : "驳回原因"}
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <TextArea rows={4} placeholder={currentRecord?.module === 'ce_archive' ? "请说明不合规原因，提交后物料将标记为不合规" : "请输入驳回原因"} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApprovalList;
