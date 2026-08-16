import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Tag, Space, Card, Row, Col,
  Popconfirm, App, Descriptions, Upload, Steps, Checkbox, Tooltip, Empty, Divider, Badge, Progress
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined,
  CheckOutlined, CloseOutlined, SaveOutlined, SendOutlined, FilePdfOutlined,
  FileExcelOutlined, ArrowLeftOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import api, { acceptanceApi, approvalApi } from '@/api';
import {
  AcceptancePlan, AcceptancePlanItem, ApprovalRecord, STATUS_MAP, Deliverable
} from '@/types';
import dayjs from 'dayjs';
import { ResizableTable } from '@/components/ResizableTable';

const { TextArea } = Input;

const ITEM_TYPE_COLORS: Record<string, string> = {
  MSA: 'blue',
  MFU: 'green',
  ESD: 'purple',
  stress: 'magenta',
  EHS: 'red',
  error_proofing: 'orange',
  pre_acceptance: 'cyan',
  custom: 'default'
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  MSA: 'MSA',
  MFU: 'MFU',
  ESD: 'ESD',
  stress: '应力测试',
  EHS: 'EHS',
  error_proofing: '防错防呆',
  pre_acceptance: '预验收',
  custom: '自定义'
};

const ApprovalFlowPanel: React.FC<{ record: ApprovalRecord | null }> = ({ record }) => {
  if (!record) {
    return <Empty description="暂无审批信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const steps = record.step_records || [];
  const currentStep = record.current_step || 0;

  const getStepStatus = (idx: number): 'finish' | 'process' | 'wait' | 'error' => {
    if (record.status === 'rejected' && idx === currentStep - 1) return 'error';
    if (idx < currentStep) return 'finish';
    if (idx === currentStep && record.status === 'pending') return 'process';
    return 'wait';
  };

  return (
    <Card size="small" title="审批流程" style={{ marginTop: 16 }}>
      <Steps
        direction="vertical"
        current={currentStep}
        status={record.status === 'rejected' ? 'error' : record.status === 'approved' ? 'finish' : 'process'}
        items={steps.map((s, idx) => ({
          title: s.approver_name,
          status: getStepStatus(idx),
          description: (
            <div>
              <div>{s.comment || '-'}</div>
              {s.approved_at && (
                <div style={{ fontSize: 12, color: '#999' }}>{dayjs(s.approved_at).format('YYYY-MM-DD HH:mm')}</div>
              )}
            </div>
          ),
          icon: s.status === 'approved' ? <CheckOutlined /> : s.status === 'rejected' ? <CloseOutlined /> : undefined
        }))}
      />
    </Card>
  );
};

const AcceptancePlanDetail: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [planData, setPlanData] = useState<AcceptancePlan | null>(null);
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [completingItem, setCompletingItem] = useState<AcceptancePlanItem | null>(null);
  const [completeForm] = Form.useForm();

  const isDraft = planData?.status === 'draft';
  const isPending = planData?.status === 'pending';
  const isApproved = planData?.status === 'approved';

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await acceptanceApi.getPlan(Number(id));
      setPlanData(res);
      if (res?.approval_record_id) {
        try {
          const approvalRes = await approvalApi.getRecord(res.approval_record_id);
          setApprovalRecord(approvalRes);
        } catch {
          setApprovalRecord(null);
        }
      } else {
        setApprovalRecord(null);
      }
      form.setFieldsValue({
        start_date: res.start_date ? dayjs(res.start_date) : null,
        end_date: res.end_date ? dayjs(res.end_date) : null
      });
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        plan_name: planData?.plan_name,
        project_id: planData?.project_id,
        start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null
      };
      await acceptanceApi.updatePlan(Number(id), payload);
      message.success('保存成功');
      setEditing(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '保存失败');
    }
  };

  const handleSubmit = async () => {
    setSubmitModalVisible(false);
    try {
      await acceptanceApi.submitPlan(Number(id));
      message.success('提交审批成功');
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '提交失败');
    }
  };

  const handleEditVersion = () => {
    Modal.confirm({
      title: '编辑将创建新版本',
      icon: <ExclamationCircleOutlined />,
      content: '编辑已审批的验收计划将自动创建新版本（版本号+1），确认继续？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await acceptanceApi.updatePlan(Number(id), { create_new_version: 1 });
          message.success('已创建新版本，正在刷新...');
          fetchData();
        } catch (err: any) {
          message.error(err?.message || '操作失败');
        }
      }
    });
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      const res = await acceptanceApi.exportPlan(Number(id), format);
      const blob = new Blob([res], {
        type: format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix = isApproved ? '_受控' : '';
      link.download = `${planData?.plan_name || '验收计划'}_V${planData?.version || 1}${suffix}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err: any) {
      message.error(err?.message || '导出失败');
    }
  };

  const openCompleteModal = (item: AcceptancePlanItem) => {
    if (item.deliverable_required === 1 && (!item.deliverables || item.deliverables.length === 0)) {
      message.warning('该验收项需要交付物，请先上传交付物后再完成');
      return;
    }
    setCompletingItem(item);
    completeForm.setFieldsValue({
      result: item.result,
      actual_date: item.actual_date ? dayjs(item.actual_date) : dayjs()
    });
    setCompleteModalVisible(true);
  };

  const handleCompleteItem = async () => {
    try {
      const values = await completeForm.validateFields();
      await acceptanceApi.updatePlanItem(completingItem!.id, {
        status: 'completed',
        result: values.result,
        actual_date: values.actual_date ? values.actual_date.format('YYYY-MM-DD') : null
      });
      message.success('验收项已完成');
      setCompleteModalVisible(false);
      setCompletingItem(null);
      completeForm.resetFields();
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败');
    }
  };

  const handleUploadDeliverable = async (options: any, itemId: number) => {
    const { file, onSuccess, onError } = options;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/acceptance/plans/items/${itemId}/deliverables`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success('上传成功');
      onSuccess?.(null, file);
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '上传失败');
      onError?.(err);
    }
  };

  if (loading && !planData) {
    return <div style={{ textAlign: 'center', padding: 80 }}>加载中...</div>;
  }

  if (!planData) {
    return <Empty description="验收计划不存在" />;
  }

  const statusInfo = STATUS_MAP[planData.status] || { label: planData.status, color: 'default' };

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_: any, __: any, idx: number) => idx + 1
    },
    {
      title: '验收项目',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 180,
      render: (text: string, record: AcceptancePlanItem) => (
        <Space>
          <Tag color={ITEM_TYPE_COLORS[record.item_type] || 'default'}>
            {ITEM_TYPE_LABELS[record.item_type] || record.item_type}
          </Tag>
          {text}
        </Space>
      )
    },
    {
      title: '负责人',
      dataIndex: 'assignee_name',
      key: 'assignee_name',
      width: 100,
      render: (text: string) => text || '-'
    },
    {
      title: '计划日期',
      dataIndex: 'planned_date',
      key: 'planned_date',
      width: 120,
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD') : '-'
    },
    {
      title: '实际日期',
      dataIndex: 'actual_date',
      key: 'actual_date',
      width: 120,
      render: (text: string) => text ? dayjs(text).format('YYYY-MM-DD') : '-'
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
      title: '结果/备注',
      dataIndex: 'result',
      key: 'result',
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '交付物',
      key: 'deliverables',
      width: 200,
      render: (_: any, record: AcceptancePlanItem) => (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {record.deliverable_required === 1 && (
            <Tag color="orange">需交付物</Tag>
          )}
          {(record.deliverables || []).length > 0 && (
            <Space wrap size={[4, 4]}>
              {(record.deliverables || []).map((d: Deliverable) => (
                <Tooltip key={d.id} title={d.file_name}>
                  <Button
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    href={`/api/deliverables/${d.id}/download`}
                    target="_blank"
                    style={{ padding: '0 4px' }}
                  >
                    {d.file_name.length > 12 ? d.file_name.substring(0, 12) + '...' : d.file_name}
                  </Button>
                </Tooltip>
              ))}
            </Space>
          )}
          {(isDraft || isApproved || record.status === 'in_progress') && (
            <Upload
              customRequest={(opts) => handleUploadDeliverable(opts, record.id)}
              showUploadList={false}
            >
              <Button size="small" icon={<UploadOutlined />}>
                上传
              </Button>
            </Upload>
          )}
          {record.deliverable_required === 1 && (!record.deliverables || record.deliverables.length === 0) && record.status !== 'draft' && (
            <span style={{ color: '#ff4d4f', fontSize: 12 }}>
              <ExclamationCircleOutlined /> 缺少交付物
            </span>
          )}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: AcceptancePlanItem) => (
        <Space size="small">
          {record.status !== 'completed' && (isDraft || isApproved || record.status === 'in_progress') && (
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => openCompleteModal(record)}
            >
              完成
            </Button>
          )}
        </Space>
      )
    }
  ];

  const overallProgress = () => {
    const items = planData.items || [];
    if (items.length === 0) return 0;
    const completed = items.filter(i => i.status === 'completed').length;
    return Math.round((completed / items.length) * 100);
  };

  return (
    <div>
      {isApproved && (
        <div
          style={{
            background: 'linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)',
            border: '2px solid #ff4d4f',
            borderRadius: 4,
            padding: '12px 24px',
            marginBottom: 16,
            textAlign: 'center',
            color: '#ff4d4f',
            fontSize: 18,
            fontWeight: 'bold',
            letterSpacing: 4
          }}
        >
          【受控文件】已审批
          {approvalRecord?.step_records && approvalRecord.step_records.length > 0 && (
            <div style={{ fontSize: 12, fontWeight: 'normal', marginTop: 4, letterSpacing: 0 }}>
              审批人：{approvalRecord.step_records.filter(s => s.status === 'approved').map(s => s.approver_name).join(' → ')}
            </div>
          )}
        </div>
      )}

      <Card
        title={
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/acceptance/plans')}
            />
            <span>{planData.plan_name}</span>
            <Tag>V{planData.version}</Tag>
            <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
            {isApproved && <Badge count="受控" style={{ backgroundColor: '#ff4d4f' }} />}
          </Space>
        }
        extra={
          <Space>
            {isDraft && (
              <>
                <Button
                  type={editing ? 'primary' : 'default'}
                  icon={editing ? <SaveOutlined /> : <EditOutlined />}
                  onClick={() => editing ? handleSave() : setEditing(true)}
                >
                  {editing ? '保存' : '编辑'}
                </Button>
                {editing && (
                  <Button onClick={() => { setEditing(false); fetchData(); }}>
                    取消
                  </Button>
                )}
                <Button type="primary" icon={<SendOutlined />} onClick={() => setSubmitModalVisible(true)}>
                  提交审批
                </Button>
                <Button icon={<FileExcelOutlined />} onClick={() => handleExport('excel')}>导出Excel</Button>
                <Button icon={<FilePdfOutlined />} onClick={() => handleExport('pdf')}>导出PDF</Button>
              </>
            )}
            {isApproved && (
              <>
                <Button icon={<EditOutlined />} onClick={handleEditVersion}>
                  编辑（版本+1）
                </Button>
                <Button icon={<FileExcelOutlined />} onClick={() => handleExport('excel')}>导出Excel（受控）</Button>
                <Button icon={<FilePdfOutlined />} onClick={() => handleExport('pdf')}>导出PDF（受控）</Button>
              </>
            )}
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Descriptions bordered size="small" column={3}>
            <Descriptions.Item label="计划名称">{planData.plan_name}</Descriptions.Item>
            <Descriptions.Item label="项目编号">{planData.project_code}</Descriptions.Item>
            <Descriptions.Item label="项目名称">{planData.project_name}</Descriptions.Item>
            <Descriptions.Item label="版本">V{planData.version}</Descriptions.Item>
            <Descriptions.Item label="开始日期">
              {editing ? (
                <Form.Item name="start_date" noStyle>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              ) : (
                planData.start_date ? dayjs(planData.start_date).format('YYYY-MM-DD') : '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="结束日期">
              {editing ? (
                <Form.Item name="end_date" noStyle>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              ) : (
                planData.end_date ? dayjs(planData.end_date).format('YYYY-MM-DD') : '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="整体进度" span={3}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Progress percent={overallProgress()} style={{ flex: 1 }} />
                <span style={{ whiteSpace: 'nowrap' }}>
                  {(planData.items || []).filter(i => i.status === 'completed').length} / {planData.items?.length || 0} 项已完成
                </span>
              </div>
            </Descriptions.Item>
          </Descriptions>
        </Form>

        <Divider orientation="left">验收项目</Divider>

        <ResizableTable
          tableKey="acceptance_plan_items"
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={planData.items || []}
          pagination={false}
          scroll={{ x: 1300 }}
        />

        {(isPending || isApproved) && approvalRecord && (
          <ApprovalFlowPanel record={approvalRecord} />
        )}
      </Card>

      <Modal
        title="确认提交审批"
        open={submitModalVisible}
        onOk={handleSubmit}
        onCancel={() => setSubmitModalVisible(false)}
        okText="确认提交"
        cancelText="取消"
        className="modal-sm"
      >
        <p>提交后将进入审批流程，审批期间无法修改，确认提交？</p>
      </Modal>

      <Modal
        title="完成验收项"
        open={completeModalVisible}
        onOk={handleCompleteItem}
        onCancel={() => { setCompleteModalVisible(false); setCompletingItem(null); completeForm.resetFields(); }}
        okText="确认完成"
        cancelText="取消"
        destroyOnHidden
        className="modal-sm"
      >
        <Form form={completeForm} layout="vertical">
          <Form.Item
            name="result"
            label="验收结果/备注"
            rules={[{ required: true, message: '请输入验收结果' }]}
          >
            <TextArea rows={4} placeholder="请输入验收结果或备注信息" />
          </Form.Item>
          <Form.Item
            name="actual_date"
            label="实际完成日期"
            rules={[{ required: true, message: '请选择实际完成日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AcceptancePlanDetail;
