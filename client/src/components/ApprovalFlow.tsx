import React, { useEffect, useState, useCallback } from 'react';
import { Steps, Button, Modal, Form, Input, message, Space, Descriptions, Tag, Select, Row, Col } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { approvalApi, ceMaterialApi } from '@/api';
import {
  ApprovalRecord,
  ApprovalStepRecord,
  NANDE_STATUS_OPTIONS,
  OUCE_STATUS_OPTIONS,
  ARCHIVE_STATUS_MANUAL_OPTIONS
} from '@/types';
import { useAppStore } from '@/store';

const { TextArea } = Input;

interface CEFormData {
  nande_status?: string;
  ouce_status?: string;
  archive_status_manual?: string;
  alternative_suggestion?: string;
  approval_remark?: string;
}

interface ApprovalFlowProps {
  recordId: number;
  module: string;
  businessId?: string;
  approvalRecord?: ApprovalRecord | null;
  onRefresh?: () => void;
}

const ApprovalFlow: React.FC<ApprovalFlowProps> = ({ recordId, module, businessId, approvalRecord: propRecord, onRefresh }) => {
  const { user } = useAppStore();
  const isCEModule = module === 'ce_archive';
  const [record, setRecord] = useState<ApprovalRecord | null>(propRecord || null);
  const [loading, setLoading] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [ceMaterialInfo, setCeMaterialInfo] = useState<any>(null);
  const [ceBatchInfo, setCeBatchInfo] = useState<any>(null);

  const loadCEInfo = useCallback(async () => {
    if (!isCEModule || !businessId) return;
    try {
      if (businessId.startsWith('ce_batch_')) {
        const batchId = businessId.replace('ce_batch_', '');
        const batchRes: any = await ceMaterialApi.getBatch(parseInt(batchId));
        const batchData = batchRes?.data || batchRes;
        setCeBatchInfo(batchData);
        if (batchData?.material || batchData?.material_id) {
          const mat = batchData.material;
          setCeMaterialInfo(mat);
          const defaultVals = {
            nande_status: mat?.nande_status || 'pending',
            ouce_status: mat?.ouce_status || 'pending',
            archive_status_manual: mat?.archive_status_manual || 'not_archived',
            alternative_suggestion: mat?.alternative_suggestion || '',
            approval_remark: mat?.approval_remark || ''
          };
          approveForm.setFieldsValue(defaultVals);
          rejectForm.setFieldsValue({ ...defaultVals, reject_reason: mat?.reject_reason || '' });
        }
      }
    } catch (err) {
      console.error('加载CE信息失败', err);
    }
  }, [businessId, approveForm, rejectForm]);

  useEffect(() => {
    if (approveModalOpen && isCEModule) {
      loadCEInfo();
    }
  }, [approveModalOpen, loadCEInfo]);

  useEffect(() => {
    if (rejectModalOpen && isCEModule) {
      loadCEInfo();
    }
  }, [rejectModalOpen, loadCEInfo]);

  const fetchRecord = useCallback(async () => {
    if (propRecord) {
      setRecord(propRecord);
      return;
    }
    setLoading(true);
    try {
      const res: any = await approvalApi.records({ module, record_id: recordId });
      const list = Array.isArray(res) ? res : (res?.data || res?.records || []);
      if (list.length > 0) {
        setRecord(list[list.length - 1]);
      } else {
        setRecord(null);
      }
    } catch {
      message.error('获取审批记录失败');
    } finally {
      setLoading(false);
    }
  }, [recordId, module, propRecord]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  useEffect(() => {
    if (propRecord) {
      setRecord(propRecord);
    }
  }, [propRecord]);

  const isCurrentApprover = useCallback(() => {
    if (!record || record.status !== 'pending' || !user) return false;
    const stepRecords = record.step_records || [];
    const currentStepRecord = stepRecords.find(s => s.step_index === record.current_step && s.status === 'pending');
    if (currentStepRecord && currentStepRecord.approver_id === user.id) return true;
    if (stepRecords.filter(s => s.status === 'approved').length === record.current_step) return true;
    return false;
  }, [record, user]);

  const handleApprove = async (values: any) => {
    if (!record) return;
    try {
      const data: any = { comment: values.comment || '' };
      if (isCEModule) {
        data.form_data = {
          nande_status: values.nande_status,
          ouce_status: values.ouce_status,
          archive_status_manual: values.archive_status_manual,
          alternative_suggestion: values.alternative_suggestion,
          approval_remark: values.approval_remark
        };
      }
      await approvalApi.approve(record.id, data);
      message.success('审批通过');
      setApproveModalOpen(false);
      approveForm.resetFields();
      fetchRecord();
      onRefresh?.();
    } catch {
      message.error('审批操作失败');
    }
  };

  const handleReject = async (values: any) => {
    if (!record) return;
    try {
      const data: any = { reject_reason: values.reject_reason };
      if (isCEModule) {
        data.form_data = {
          nande_status: values.nande_status,
          ouce_status: values.ouce_status,
          archive_status_manual: values.archive_status_manual,
          alternative_suggestion: values.alternative_suggestion,
          approval_remark: values.approval_remark || values.reject_reason
        };
      }
      await approvalApi.reject(record.id, data);
      message.success('已驳回');
      setRejectModalOpen(false);
      rejectForm.resetFields();
      fetchRecord();
      onRefresh?.();
    } catch {
      message.error('驳回操作失败');
    }
  };

  const getStepStatus = (stepIdx: number): 'wait' | 'process' | 'finish' | 'error' => {
    if (!record) return 'wait';
    const stepRecords = record.step_records || [];
    const stepRec = stepRecords.find(s => s.step_index === stepIdx);

    if (record.status === 'rejected') {
      if (stepRec?.status === 'rejected') return 'error';
      if (stepIdx < record.current_step) return 'finish';
      return 'wait';
    }

    if (record.status === 'approved') {
      return 'finish';
    }

    if (stepIdx < record.current_step) {
      return stepRec?.status === 'rejected' ? 'error' : 'finish';
    }
    if (stepIdx === record.current_step) {
      if (record.status === 'pending') return 'process';
      return 'wait';
    }
    return 'wait';
  };

  const getStepIcon = (stepIdx: number) => {
    const status = getStepStatus(stepIdx);
    if (status === 'finish') return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (status === 'error') return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    if (status === 'process') return <ClockCircleOutlined style={{ color: '#1677ff' }} />;
    return <UserOutlined />;
  };

  const getStepTitle = (stepIdx: number): string => {
    if (!record) return `步骤${stepIdx + 1}`;
    const stepRecords = record.step_records || [];
    const stepRec = stepRecords.find(s => s.step_index === stepIdx);
    if (stepRec?.approver_name) return stepRec.approver_name;
    return `步骤${stepIdx + 1}`;
  };

  const getStepDescription = (stepIdx: number): React.ReactNode => {
    if (!record) return null;
    const stepRecords = record.step_records || [];
    const stepRec = stepRecords.find(s => s.step_index === stepIdx);
    const items: React.ReactNode[] = [];

    if (stepRec?.approved_at) {
      items.push(<div key="time" style={{ fontSize: 12, color: '#999' }}>{dayjs(stepRec.approved_at).format('YYYY-MM-DD HH:mm')}</div>);
    }
    if (stepRec?.comment) {
      items.push(<div key="comment" style={{ fontSize: 12, marginTop: 4 }}>意见：{stepRec.comment}</div>);
    }
    if (stepRec?.status === 'rejected' && record.reject_reason) {
      items.push(<div key="reject" style={{ fontSize: 12, color: '#ff4d4f', marginTop: 4 }}>驳回原因：{record.reject_reason}</div>);
    }

    const status = getStepStatus(stepIdx);
    if (status === 'process') {
      items.push(
        <Tag key="tag" color="processing" style={{ marginTop: 4 }}>审批中</Tag>
      );
    }

    return <div>{items}</div>;
  };

  const calculateTotalSteps = (): number => {
    if (!record) return 1;
    const stepRecords = record.step_records || [];
    const maxFromRecords = stepRecords.length > 0 ? Math.max(...stepRecords.map(s => s.step_index)) + 1 : 0;
    return Math.max(maxFromRecords, record.current_step + 1);
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>加载审批流程中...</div>;
  }

  if (!record) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>
        暂无审批记录
      </div>
    );
  }

  const totalSteps = calculateTotalSteps();
  const stepItems = Array.from({ length: totalSteps }, (_, idx) => ({
    title: getStepTitle(idx),
    icon: getStepIcon(idx),
    description: getStepDescription(idx),
    status: getStepStatus(idx)
  }));

  return (
    <div className="approval-timeline">
      <Descriptions column={2} size="small" style={{ marginBottom: 24 }}>
        <Descriptions.Item label="提交人">{record.submitter_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="提交时间">
          {record.submitted_at ? dayjs(record.submitted_at).format('YYYY-MM-DD HH:mm') : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="当前状态">
          {record.status === 'pending' && <Tag color="warning">待审批</Tag>}
          {record.status === 'approved' && <Tag color="success">已批准</Tag>}
          {record.status === 'rejected' && <Tag color="error">已驳回</Tag>}
          {record.status === 'draft' && <Tag>草稿</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="当前步骤">
          第 {record.current_step + 1} 步
        </Descriptions.Item>
      </Descriptions>

      <Steps
        direction="vertical"
        current={record.current_step}
        items={stepItems}
        style={{ marginBottom: 24 }}
      />

      {isCurrentApprover() && (
        <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <Space size="middle">
            <Button type="primary" onClick={() => setApproveModalOpen(true)}>
              通过
            </Button>
            <Button danger onClick={() => setRejectModalOpen(true)}>
              驳回
            </Button>
          </Space>
        </div>
      )}

      <Modal title="审批通过" open={approveModalOpen} onCancel={() => {
          setApproveModalOpen(false);
          approveForm.resetFields();
        }} onOk={() => approveForm.submit()} okText="确认通过" cancelText="取消" destroyOnHidden
       className="modal-md">
        <Form form={approveForm} layout="vertical" onFinish={handleApprove}>
          {isCEModule && ceMaterialInfo && (
            <>
              <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4, marginBottom: 16 }}>
                <div><strong>物料：</strong>{ceMaterialInfo.part_code || '-'} - {ceMaterialInfo.part_name}</div>
                {ceMaterialInfo.spec && <div><strong>规格：</strong>{ceMaterialInfo.spec}</div>}
                {ceBatchInfo && <div><strong>批次：</strong>{ceBatchInfo.batch_code}</div>}
              </div>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="nande_status" label="南德确认" initialValue="pending">
                    <Select options={NANDE_STATUS_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ouce_status" label="欧测确认" initialValue="pending">
                    <Select options={OUCE_STATUS_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="archive_status_manual" label="存档状态" initialValue="not_archived">
                <Select options={ARCHIVE_STATUS_MANUAL_OPTIONS} />
              </Form.Item>
              <Form.Item name="alternative_suggestion" label="替代型号建议">
                <Input placeholder="如有替代型号建议请填写" />
              </Form.Item>
              <Form.Item name="approval_remark" label="备注">
                <TextArea rows={2} placeholder="审批备注（可选）" maxLength={500} showCount />
              </Form.Item>
            </>
          )}
          <Form.Item name="comment" label="审批意见（可选）">
            <TextArea rows={isCEModule ? 2 : 4} placeholder="请输入审批意见" maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="审批驳回" open={rejectModalOpen} onCancel={() => {
          setRejectModalOpen(false);
          rejectForm.resetFields();
        }} onOk={() => rejectForm.submit()} okText="确认驳回" okButtonProps={{ danger: true }} cancelText="取消" destroyOnHidden
       className="modal-md">
        <Form form={rejectForm} layout="vertical" onFinish={handleReject}>
          {isCEModule && ceMaterialInfo && (
            <>
              <div style={{ padding: 12, background: '#fff2f0', borderRadius: 4, marginBottom: 16, border: '1px solid #ffccc7' }}>
                <div><strong>物料：</strong>{ceMaterialInfo.part_code || '-'} - {ceMaterialInfo.part_name}</div>
                {ceMaterialInfo.spec && <div><strong>规格：</strong>{ceMaterialInfo.spec}</div>}
                {ceBatchInfo && <div><strong>批次：</strong>{ceBatchInfo.batch_code}</div>}
              </div>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="nande_status" label="南德确认" initialValue="pending">
                    <Select options={NANDE_STATUS_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ouce_status" label="欧测确认" initialValue="pending">
                    <Select options={OUCE_STATUS_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="archive_status_manual" label="存档状态" initialValue="not_archived">
                <Select options={ARCHIVE_STATUS_MANUAL_OPTIONS} />
              </Form.Item>
              <Form.Item name="alternative_suggestion" label="替代型号建议">
                <Input placeholder="如有替代型号建议请填写" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="reject_reason"
            label={isCEModule ? "不合规原因/驳回原因" : "驳回原因"}
            rules={[{ required: true, message: '请输入驳回原因' }]}
          >
            <TextArea rows={4} placeholder={isCEModule ? "请说明不合规原因，提交后物料将标记为不合规" : "请输入驳回原因"} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApprovalFlow;
