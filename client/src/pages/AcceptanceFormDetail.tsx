import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Tag, Space, Card, Row, Col,
  Popconfirm, App, Descriptions, Tabs, Checkbox, Radio, Upload, Steps, Timeline,
  Divider, Badge, Tooltip, Progress, Empty, Statistic
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, UploadOutlined,
  CheckOutlined, CloseOutlined, SaveOutlined, SendOutlined, FilePdfOutlined,
  FileExcelOutlined, EyeOutlined, ArrowLeftOutlined
} from '@ant-design/icons';
import { acceptanceApi, userApi, approvalApi } from '@/api';
import {
  AcceptanceForm, AcceptanceFormItem, AcceptanceAttachment, User,
  STATUS_MAP, ApprovalRecord
} from '@/types';
import FeishuUserSelect from '@/components/FeishuUserSelect';
import dayjs from 'dayjs';
import { ResizableTable } from '@/components/ResizableTable';

const { TextArea } = Input;

const CATEGORY_COLORS: Record<string, string> = {
  mechanical: 'blue',
  electrical: 'cyan',
  functional: 'green',
  safety: 'red',
  error_proofing: 'orange',
  msa: 'purple',
  mfu: 'geekblue',
  other: 'default'
};

const CATEGORY_LABELS: Record<string, string> = {
  mechanical: '机械结构',
  electrical: '电气系统',
  functional: '功能测试',
  safety: '安全',
  error_proofing: '防错防呆',
  msa: 'MSA',
  mfu: 'MFU',
  other: '其他'
};

const ATTACH_TYPES = [
  { value: 'ehs', label: 'EHS报告' },
  { value: 'esd', label: 'ESD报告' },
  { value: 'red_paste', label: '红丹验证' },
  { value: 'stress', label: '应力报告' },
  { value: 'other', label: '其他' }
];

const ApprovalFlowPanel: React.FC<{ record: ApprovalRecord | null }> = ({ record }) => {
  if (!record) {
    return <Empty description="暂无审批信息" />;
  }

  const steps = record.step_records || [];
  const currentStep = record.current_step || 0;

  const getStepStatus = (idx: number): 'finish' | 'process' | 'wait' | 'error' => {
    if (record.status === 'rejected' && idx === currentStep - 1) return 'error';
    if (idx < currentStep) return 'finish';
    if (idx === currentStep && record.status === 'pending') return 'process';
    if (idx === currentStep - 1 && record.status === 'approved') return 'finish';
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

const AcceptanceFormDetail: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<AcceptanceForm | null>(null);
  const [approvalRecord, setApprovalRecord] = useState<ApprovalRecord | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState(false);
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [attachmentType, setAttachmentType] = useState<string>('other');

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await acceptanceApi.getForm(Number(id));
      setFormData(res);
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
        acceptance_date: res.acceptance_date ? dayjs(res.acceptance_date) : null,
        conclusion: res.conclusion
      });
    } catch (err: any) {
      message.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  const fetchUsers = async () => {
    try {
      const res = await userApi.list();
      setUsers(Array.isArray(res) ? res : (res.list || []));
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    fetchData();
    fetchUsers();
  }, [fetchData]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const itemsData = (formData?.items || []).map(item => ({
        id: item.id,
        result: item.result,
        is_pass: item.is_pass,
        remark: item.remark,
        inspector_id: item.inspector_id,
        inspect_date: item.inspect_date
      }));
      const payload = {
        acceptance_date: values.acceptance_date ? values.acceptance_date.format('YYYY-MM-DD') : null,
        conclusion: values.conclusion,
        items: itemsData
      };
      await acceptanceApi.updateForm(Number(id), payload);
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
      await acceptanceApi.submitForm(Number(id));
      message.success('提交审批成功');
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '提交失败');
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      const res = await acceptanceApi.exportForm(Number(id), format);
      const blob = new Blob([res], {
        type: format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${formData?.form_code || '验收单'}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err: any) {
      message.error(err?.message || '导出失败');
    }
  };

  const handleUploadAttachment = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('attach_type', attachmentType);
    try {
      await acceptanceApi.uploadAttachment(Number(id), formDataUpload);
      message.success('上传成功');
      onSuccess?.(null, file);
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '上传失败');
      onError?.(err);
    }
  };

  const updateItemField = (itemId: number, field: string, value: any) => {
    if (!formData) return;
    setFormData({
      ...formData,
      items: (formData.items || []).map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    });
  };

  const getWorkstationGroups = () => {
    if (!formData?.items) return {};
    return formData.items.reduce((acc, item) => {
      const key = item.workstation_name || '未分配工站';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, AcceptanceFormItem[]>);
  };

  const getStatistics = () => {
    const items = formData?.items || [];
    const total = items.length;
    const passed = items.filter(i => i.is_pass === 1).length;
    const failed = items.filter(i => i.is_pass === 0).length;
    const pending = total - passed - failed;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failedItems = items.filter(i => i.is_pass === 0);
    return { total, passed, failed, pending, passRate, failedItems };
  };

  if (loading && !formData) {
    return <div style={{ textAlign: 'center', padding: 80 }}>加载中...</div>;
  }

  if (!formData) {
    return <Empty description="验收单不存在" />;
  }

  const groups = getWorkstationGroups();
  const stationNames = Object.keys(groups);
  const stats = getStatistics();
  const statusInfo = STATUS_MAP[formData.status] || { label: formData.status, color: 'default' };

  const getItemColumns = (stationKey: string) => {
    const items = groups[stationKey] || [];
    return [
      {
        title: '序号',
        key: 'index',
        width: 60,
        render: (_: any, __: any, idx: number) => idx + 1
      },
      {
        title: '类别',
        dataIndex: 'category',
        key: 'category',
        width: 100,
        render: (text: string) => (
          <Tag color={CATEGORY_COLORS[text] || 'default'}>
            {CATEGORY_LABELS[text] || text}
          </Tag>
        )
      },
      {
        title: '验收项目',
        dataIndex: 'item_name',
        key: 'item_name',
        width: 180
      },
      {
        title: '验收标准',
        dataIndex: 'standard',
        key: 'standard',
        width: 200,
        ellipsis: true
      },
      {
        title: '检验方法',
        dataIndex: 'method',
        key: 'method',
        width: 160,
        ellipsis: true
      },
      {
        title: '检验结果',
        dataIndex: 'result',
        key: 'result',
        width: 180,
        render: (text: string, record: AcceptanceFormItem) =>
          editing ? (
            <Input
              value={text}
              placeholder="请输入结果"
              onChange={e => updateItemField(record.id, 'result', e.target.value)}
            />
          ) : (text || '-')
      },
      {
        title: '是否合格',
        dataIndex: 'is_pass',
        key: 'is_pass',
        width: 90,
        align: 'center' as const,
        render: (val: number, record: AcceptanceFormItem) =>
          editing ? (
            <Radio.Group
              value={val}
              onChange={e => updateItemField(record.id, 'is_pass', e.target.value)}
            >
              <Radio value={1}><Tag color="success">合格</Tag></Radio>
              <Radio value={0}><Tag color="error">不合格</Tag></Radio>
            </Radio.Group>
          ) : (
            val === 1 ? <Tag color="success">合格</Tag> : val === 0 ? <Tag color="error">不合格</Tag> : '-'
          )
      },
      {
        title: '备注',
        dataIndex: 'remark',
        key: 'remark',
        width: 150,
        render: (text: string, record: AcceptanceFormItem) =>
          editing ? (
            <Input
              value={text}
              placeholder="备注"
              onChange={e => updateItemField(record.id, 'remark', e.target.value)}
            />
          ) : (text || '-')
      },
      {
        title: '检验人',
        dataIndex: 'inspector_id',
        key: 'inspector_id',
        width: 120,
        render: (val: number, record: AcceptanceFormItem) =>
          editing ? (
            <FeishuUserSelect
              style={{ width: '100%' }}
              value={val}
              placeholder="选择检验人"
              onChange={v => updateItemField(record.id, 'inspector_id', v)}
            />
          ) : (record.inspector_name || '-')
      },
      {
        title: '检验日期',
        dataIndex: 'inspect_date',
        key: 'inspect_date',
        width: 140,
        render: (text: string, record: AcceptanceFormItem) =>
          editing ? (
            <DatePicker
              style={{ width: '100%' }}
              value={text ? dayjs(text) : null}
              onChange={d => updateItemField(record.id, 'inspect_date', d ? d.format('YYYY-MM-DD') : null)}
            />
          ) : (text ? dayjs(text).format('YYYY-MM-DD') : '-')
      }
    ];
  };

  const tabItems = [
    ...stationNames.map(name => ({
      key: name,
      label: (
        <span>
          {name}
          {groups[name] && groups[name].filter(i => i.is_pass === 0).length > 0 && (
            <Badge count={groups[name].filter(i => i.is_pass === 0).length} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
      children: (
        <ResizableTable
          tableKey="acceptance_form_items"
          rowKey="id"
          size="small"
          columns={getItemColumns(name)}
          dataSource={groups[name]}
          pagination={false}
          scroll={{ x: 1300 }}
        />
      )
    })),
    {
      key: 'summary',
      label: '汇总',
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic title="总项目数" value={stats.total} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="合格数" value={stats.passed} valueStyle={{ color: '#52c41a' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="不合格数" value={stats.failed} valueStyle={{ color: '#ff4d4f' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <div style={{ marginBottom: 8 }}>合格率</div>
                <Progress percent={stats.passRate} status={stats.failed > 0 ? 'exception' : 'success'} />
              </Card>
            </Col>
          </Row>

          {stats.failedItems.length > 0 && (
            <Card title="不合格项目列表" size="small" style={{ marginBottom: 16 }} type="inner">
              <ResizableTable
                tableKey="acceptance_form_failed_items"
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: '工站', dataIndex: 'workstation_name', key: 'workstation_name', width: 120 },
                  { title: '类别', dataIndex: 'category', key: 'category', width: 100, render: (t: string) => <Tag color={CATEGORY_COLORS[t]}>{CATEGORY_LABELS[t] || t}</Tag> },
                  { title: '验收项目', dataIndex: 'item_name', key: 'item_name', width: 200 },
                  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true }
                ]}
                dataSource={stats.failedItems}
              />
            </Card>
          )}

          <Card title="验收结论" size="small" type="inner">
            {editing ? (
              <Form.Item name="conclusion" noStyle>
                <TextArea rows={4} placeholder="请输入验收结论" />
              </Form.Item>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap' }}>{formData.conclusion || '暂无结论'}</div>
            )}
          </Card>
        </div>
      )
    }
  ];

  return (
    <div>
      {formData.status === 'approved' && (
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
              onClick={() => navigate('/acceptance/forms')}
            />
            <span>{formData.form_code}</span>
            <Tag color={getProjectTypeColor(formData.project_type)}>{formData.project_type}</Tag>
            <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
            {formData.status === 'approved' && <Badge count="已审批" style={{ backgroundColor: '#52c41a' }} />}
          </Space>
        }
        extra={
          <Space>
            {formData.status === 'draft' && (
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
              </>
            )}
            {formData.status === 'approved' && (
              <>
                <Button icon={<FileExcelOutlined />} onClick={() => handleExport('excel')}>
                  导出Excel（受控）
                </Button>
                <Button icon={<FilePdfOutlined />} onClick={() => handleExport('pdf')}>
                  导出PDF（受控）
                </Button>
              </>
            )}
          </Space>
        }
      >
        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="验收单编号">{formData.form_code}</Descriptions.Item>
          <Descriptions.Item label="项目编号">{formData.project_code}</Descriptions.Item>
          <Descriptions.Item label="项目名称">{formData.project_name}</Descriptions.Item>
          <Descriptions.Item label="项目类型">
            <Tag color={getProjectTypeColor(formData.project_type)}>{formData.project_type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="验收日期">
            {editing ? (
              <Form.Item name="acceptance_date" noStyle>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            ) : (
              formData.acceptance_date ? dayjs(formData.acceptance_date).format('YYYY-MM-DD') : '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">验收项目</Divider>

        <Form form={form} layout="vertical">
          <Tabs defaultActiveKey={stationNames[0] || 'summary'} items={tabItems} />
        </Form>

        <Divider orientation="left">附表附件</Divider>

        <Card size="small">
          <Space style={{ marginBottom: 16 }}>
            <Select
              value={attachmentType}
              onChange={setAttachmentType}
              style={{ width: 140 }}
              showSearch
              filterOption={(input, option) => ((option as any)?.label ?? (option as any)?.children ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={ATTACH_TYPES}
            />
            <Upload
              customRequest={handleUploadAttachment}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>上传附件</Button>
            </Upload>
          </Space>

          {(formData.attachments || []).length === 0 ? (
            <Empty description="暂无附件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <ResizableTable
              tableKey="acceptance_form_attachments"
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                {
                  title: '附件类型',
                  dataIndex: 'attach_type',
                  key: 'attach_type',
                  width: 120,
                  render: (t: string) => ATTACH_TYPES.find(a => a.value === t)?.label || t
                },
                { title: '文件名', dataIndex: 'file_name', key: 'file_name' },
                {
                  title: '文件大小',
                  dataIndex: 'file_size',
                  key: 'file_size',
                  width: 120,
                  render: (s: number) => s ? `${(s / 1024).toFixed(1)} KB` : '-'
                },
                {
                  title: '操作',
                  key: 'actions',
                  width: 100,
                  render: (_: any, record: AcceptanceAttachment) => (
                    <Button
                      type="link"
                      size="small"
                      icon={<DownloadOutlined />}
                      href={`/api/acceptance/attachments/${record.id}/download`}
                      target="_blank"
                    >
                      下载
                    </Button>
                  )
                }
              ]}
              dataSource={formData.attachments}
            />
          )}
        </Card>

        {formData.status !== 'draft' && approvalRecord && (
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
    </div>
  );
};

function getProjectTypeColor(type: string) {
  if (type?.startsWith('G')) return 'blue';
  if (type?.includes('产线')) return 'green';
  if (type?.includes('实验室')) return 'purple';
  return 'default';
}

export default AcceptanceFormDetail;
