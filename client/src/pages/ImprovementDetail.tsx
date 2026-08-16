import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Row,
  Col,
  Tag,
  Steps,
  Form,
  Input,
  Select,
  DatePicker,
  Upload,
  Timeline,
  Divider,
  Descriptions,
  Tabs,
  Space,
  App,
  Spin,
  Result,
  Tooltip,
  Progress
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  UploadOutlined,
  ArrowLeftOutlined,
  RocketOutlined,
  FileTextOutlined,
  SaveOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { improvementApi, userApi } from '@/api';
import { Improvement, User, STATUS_MAP, DEPARTMENTS, ImprovementAttachment } from '@/types';
import { useAppStore } from '@/store';
import FeishuUserSelect from '@/components/FeishuUserSelect';

const { TextArea } = Input;
const { Option } = Select;

const DMAIC_STEPS = [
  { key: 'define', title: '定义', subtitle: 'Define' },
  { key: 'measure', title: '测量', subtitle: 'Measure' },
  { key: 'analyze', title: '分析', subtitle: 'Analyze' },
  { key: 'improve', title: '改进', subtitle: 'Improve' },
  { key: 'control', title: '控制', subtitle: 'Control' }
];

interface StepData {
  problem_definition?: string;
  goal?: string;
  current_status?: string;
  measurement_data?: string;
  root_cause_analysis?: string;
  corrective_action?: string;
  preventive_action?: string;
  implementation_date?: string;
  effectiveness_verification?: string;
  verifier_id?: number;
  verify_date?: string;
  [key: string]: any;
}

const ImprovementDetail: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Improvement | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stepData, setStepData] = useState<StepData>({});
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await improvementApi.get(parseInt(id));
      const improvement = res;
      setData(improvement);
      setActiveStep(Math.max(0, (improvement.current_step || 1) - 1));
      setCompleted(improvement.status === 'completed');

      try {
        if (improvement.step_data) {
          const parsed = typeof improvement.step_data === 'string' 
            ? JSON.parse(improvement.step_data) 
            : improvement.step_data;
          setStepData(parsed || {});
          form.setFieldsValue(parsed || {});
        }
      } catch (e) {
        console.error('解析步骤数据失败', e);
      }
    } catch (error: any) {
      message.error(error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await userApi.list({ pageSize: 100 });
      setUsers(Array.isArray(res) ? res : (res.list || []));
    } catch (error) {
      console.error('加载用户列表失败', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchUsers();
  }, [id]);

  const handleStepClick = (index: number) => {
    if (data?.status === 'completed') {
      setActiveStep(index);
    } else if (index <= activeStep) {
      setActiveStep(index);
      const stepKey = DMAIC_STEPS[index].key;
      form.setFieldsValue(stepData);
    }
  };

  const handleSaveStep = async (nextStep?: boolean) => {
    if (!data || !id) return;
    try {
      const values = await form.validateFields();
      setSaving(true);

      const formattedValues = { ...values };
      if (formattedValues.implementation_date) {
        formattedValues.implementation_date = formattedValues.implementation_date.format('YYYY-MM-DD');
      }
      if (formattedValues.verify_date) {
        formattedValues.verify_date = formattedValues.verify_date.format('YYYY-MM-DD');
      }

      const newStepData = { ...stepData, ...formattedValues };
      setStepData(newStepData);

      const currentStepIndex = activeStep;
      const stepKey = DMAIC_STEPS[currentStepIndex].key;

      await improvementApi.updateStep(parseInt(id), {
        step: currentStepIndex + 1,
        step_name: stepKey,
        step_data: newStepData,
        current_step: nextStep ? currentStepIndex + 2 : currentStepIndex + 1
      });

      message.success('保存成功');

      if (nextStep && currentStepIndex < 4) {
        setActiveStep(currentStepIndex + 1);
      }
      
      fetchData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!data || !id) return;
    try {
      const values = await form.validateFields();
      setSaving(true);

      const formattedValues = { ...values };
      if (formattedValues.verify_date) {
        formattedValues.verify_date = formattedValues.verify_date.format('YYYY-MM-DD');
      }

      const newStepData = { ...stepData, ...formattedValues };
      setStepData(newStepData);

      await improvementApi.updateStep(parseInt(id), {
        step: 5,
        step_name: 'control',
        step_data: newStepData,
        current_step: 6,
        status: 'completed',
        actual_completion_date: dayjs().format('YYYY-MM-DD')
      });

      message.success('改进项目已完成！');
      setCompleted(true);
      fetchData();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '完成失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('step_name', DMAIC_STEPS[activeStep].key);
    
    try {
      await improvementApi.update(parseInt(id!), {
        attachments: formData
      } as any);
      message.success('上传成功');
      onSuccess('ok');
      fetchData();
    } catch (error) {
      onError(error);
      message.error('上传失败');
    }
  };

  const getStepStatus = (index: number): 'wait' | 'process' | 'finish' | 'error' => {
    if (data?.status === 'completed') return 'finish';
    if (index < activeStep) return 'finish';
    if (index === activeStep) return 'process';
    return 'wait';
  };

  const isStepEditable = (index: number) => {
    if (data?.status === 'completed') return false;
    return index <= activeStep;
  };

  const getStepAttachments = (stepKey: string) => {
    return data?.attachments?.filter((a: ImprovementAttachment) => a.step_name === stepKey) || [];
  };

  const getTimelineItems = () => {
    const items: any[] = [];
    const stepKeys = ['define', 'measure', 'analyze', 'improve', 'control'];
    
    for (let i = 0; i < 5; i++) {
      if (i < activeStep || (i === activeStep && data?.status !== 'completed')) {
        items.push({
          color: i < activeStep ? 'green' : 'blue',
          dot: i < activeStep ? <CheckCircleOutlined /> : <ClockCircleOutlined />,
          children: (
            <div>
              <strong>{DMAIC_STEPS[i].title}阶段</strong>
              <div style={{ fontSize: 12, color: '#999' }}>
                {i < activeStep ? '已完成' : '进行中'}
              </div>
            </div>
          )
        });
      }
    }
    
    if (data?.status === 'completed') {
      items.push({
        color: 'green',
        dot: <CheckCircleOutlined />,
        children: (
          <div>
            <strong>改进完成</strong>
            <div style={{ fontSize: 12, color: '#999' }}>
              {data.actual_completion_date && dayjs(data.actual_completion_date).format('YYYY-MM-DD')}
            </div>
          </div>
        )
      });
    }
    
    return items;
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 24 }}>
        <Result status="404" title="未找到改进项目" />
      </div>
    );
  }

  const currentStepKey = DMAIC_STEPS[activeStep].key;
  const currentAttachments = getStepAttachments(currentStepKey);
  const progress = data.status === 'completed' ? 100 : ((activeStep) / 5) * 100;

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/improvement')}>
          返回列表
        </Button>
      </Space>

      {completed && (
        <Result
          status="success"
          title="改进项目已完成！"
          subTitle={`改进编号: ${data.improvement_code}`}
          style={{ padding: 24, background: '#f6ffed', borderRadius: 8, marginBottom: 24 }}
        />
      )}

      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={18}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="改进编号">{data.improvement_code}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[data.status]?.color || 'default'}>
                  {STATUS_MAP[data.status]?.label || data.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="标题" span={2}>
                <h3 style={{ margin: 0 }}>{data.title}</h3>
              </Descriptions.Item>
              <Descriptions.Item label="责任部门">
                {data.responsible_dept ? <Tag color="blue">{data.responsible_dept}</Tag> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="责任人">{data.responsible_person_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(data.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
              <Descriptions.Item label="计划完成日期">
                {data.planned_completion_date ? dayjs(data.planned_completion_date).format('YYYY-MM-DD') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={6}>
            <div style={{ textAlign: 'center' }}>
              <Progress type="circle" percent={Math.round(progress)} />
              <div style={{ marginTop: 8, color: '#666' }}>整体进度</div>
            </div>
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={activeStep}
          onChange={handleStepClick}
          style={{ marginBottom: 8 }}
          items={DMAIC_STEPS.map((step, index) => ({
            key: step.key,
            title: step.title,
            subTitle: step.subtitle,
            status: getStepStatus(index),
            disabled: !isStepEditable(index) && data?.status !== 'completed'
          }))}
        />
      </Card>

      <Row gutter={24}>
        <Col span={18}>
          <Form form={form} layout="vertical" initialValues={stepData} preserve={false}>
            {activeStep === 0 && (
              <Card title="阶段1: 定义 (Define)" extra={<Tag color="blue">问题界定</Tag>}>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                  <Descriptions.Item label="原始问题描述">
                    {data.problem_description}
                  </Descriptions.Item>
                </Descriptions>

                <Form.Item name="problem_definition" label="问题定义">
                  <TextArea 
                    rows={4} 
                    placeholder="请清晰定义需要解决的问题..."
                    disabled={!isStepEditable(0)}
                  />
                </Form.Item>

                <Form.Item name="goal" label="改进目标">
                  <TextArea 
                    rows={3} 
                    placeholder="请设定具体可衡量的改进目标..."
                    disabled={!isStepEditable(0)}
                  />
                </Form.Item>

                {isStepEditable(0) && (
                  <Space>
                    <Button 
                      type="primary" 
                      icon={<SaveOutlined />} 
                      onClick={() => handleSaveStep(true)}
                      loading={saving}
                    >
                      保存并进入下一步
                    </Button>
                    <Button onClick={() => handleSaveStep(false)} loading={saving}>
                      仅保存
                    </Button>
                  </Space>
                )}
              </Card>
            )}

            {activeStep === 1 && (
              <Card title="阶段2: 测量 (Measure)" extra={<Tag color="cyan">数据收集</Tag>}>
                <Form.Item name="current_status" label="现状描述">
                  <TextArea 
                    rows={3} 
                    placeholder="请描述当前问题的实际状况..."
                    disabled={!isStepEditable(1)}
                  />
                </Form.Item>

                <Form.Item name="measurement_data" label="测量数据">
                  <TextArea 
                    rows={5} 
                    placeholder="请记录收集到的数据和测量结果..."
                    disabled={!isStepEditable(1)}
                  />
                </Form.Item>

                <Divider orientation="left">附件</Divider>
                <Upload customRequest={handleUpload} disabled={!isStepEditable(1)}>
                  <Button icon={<UploadOutlined />} disabled={!isStepEditable(1)}>上传测量数据文件</Button>
                </Upload>
                {currentAttachments.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {currentAttachments.map((att) => (
                      <Tag key={att.id} icon={<FileTextOutlined />} style={{ marginBottom: 8 }}>
                        {att.file_name}
                      </Tag>
                    ))}
                  </div>
                )}

                {isStepEditable(1) && (
                  <Space style={{ marginTop: 24 }}>
                    <Button 
                      type="primary" 
                      icon={<SaveOutlined />} 
                      onClick={() => handleSaveStep(true)}
                      loading={saving}
                    >
                      保存并进入下一步
                    </Button>
                    <Button onClick={() => handleSaveStep(false)} loading={saving}>
                      仅保存
                    </Button>
                  </Space>
                )}
              </Card>
            )}

            {activeStep === 2 && (
              <Card title="阶段3: 分析 (Analyze)" extra={<Tag color="orange">根因分析</Tag>}>
                <Form.Item name="root_cause_analysis" label="根本原因分析">
                  <TextArea 
                    rows={6} 
                    placeholder="请使用鱼骨图、5Why等方法分析根本原因..."
                    disabled={!isStepEditable(2)}
                  />
                </Form.Item>

                <Divider orientation="left">附件</Divider>
                <Upload customRequest={handleUpload} disabled={!isStepEditable(2)}>
                  <Button icon={<UploadOutlined />} disabled={!isStepEditable(2)}>上传分析文件/图表</Button>
                </Upload>
                {currentAttachments.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {currentAttachments.map((att) => (
                      <Tag key={att.id} icon={<FileTextOutlined />} style={{ marginBottom: 8 }}>
                        {att.file_name}
                      </Tag>
                    ))}
                  </div>
                )}

                {isStepEditable(2) && (
                  <Space style={{ marginTop: 24 }}>
                    <Button 
                      type="primary" 
                      icon={<SaveOutlined />} 
                      onClick={() => handleSaveStep(true)}
                      loading={saving}
                    >
                      保存并进入下一步
                    </Button>
                    <Button onClick={() => handleSaveStep(false)} loading={saving}>
                      仅保存
                    </Button>
                  </Space>
                )}
              </Card>
            )}

            {activeStep === 3 && (
              <Card title="阶段4: 改进 (Improve)" extra={<Tag color="green">对策实施</Tag>}>
                <Form.Item name="corrective_action" label="纠正措施">
                  <TextArea 
                    rows={4} 
                    placeholder="请描述针对根本原因的纠正措施..."
                    disabled={!isStepEditable(3)}
                  />
                </Form.Item>

                <Form.Item name="preventive_action" label="预防措施">
                  <TextArea 
                    rows={4} 
                    placeholder="请描述防止问题再发的预防措施..."
                    disabled={!isStepEditable(3)}
                  />
                </Form.Item>

                <Form.Item name="implementation_date" label="措施实施日期">
                  <DatePicker style={{ width: '100%' }} disabled={!isStepEditable(3)} />
                </Form.Item>

                <Divider orientation="left">附件</Divider>
                <Upload customRequest={handleUpload} disabled={!isStepEditable(3)}>
                  <Button icon={<UploadOutlined />} disabled={!isStepEditable(3)}>上传改进方案文件</Button>
                </Upload>
                {currentAttachments.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {currentAttachments.map((att) => (
                      <Tag key={att.id} icon={<FileTextOutlined />} style={{ marginBottom: 8 }}>
                        {att.file_name}
                      </Tag>
                    ))}
                  </div>
                )}

                {isStepEditable(3) && (
                  <Space style={{ marginTop: 24 }}>
                    <Button 
                      type="primary" 
                      icon={<SaveOutlined />} 
                      onClick={() => handleSaveStep(true)}
                      loading={saving}
                    >
                      保存并进入下一步
                    </Button>
                    <Button onClick={() => handleSaveStep(false)} loading={saving}>
                      仅保存
                    </Button>
                  </Space>
                )}
              </Card>
            )}

            {activeStep === 4 && (
              <Card title="阶段5: 控制 (Control)" extra={<Tag color="purple">效果验证</Tag>}>
                <Form.Item name="effectiveness_verification" label="效果验证">
                  <TextArea 
                    rows={5} 
                    placeholder="请验证改进措施的有效性，描述改进效果..."
                    disabled={!isStepEditable(4)}
                  />
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="verifier_id" label="验证人">
                      <FeishuUserSelect
                        placeholder="请选择验证人"
                        allowClear
                        disabled={!isStepEditable(4)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="verify_date" label="验证日期">
                      <DatePicker style={{ width: '100%' }} disabled={!isStepEditable(4)} />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider orientation="left">附件</Divider>
                <Upload customRequest={handleUpload} disabled={!isStepEditable(4)}>
                  <Button icon={<UploadOutlined />} disabled={!isStepEditable(4)}>上传验证报告</Button>
                </Upload>
                {currentAttachments.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {currentAttachments.map((att) => (
                      <Tag key={att.id} icon={<FileTextOutlined />} style={{ marginBottom: 8 }}>
                        {att.file_name}
                      </Tag>
                    ))}
                  </div>
                )}

                {isStepEditable(4) && (
                  <Space style={{ marginTop: 24 }}>
                    <Button 
                      type="primary" 
                      icon={<RocketOutlined />} 
                      onClick={handleComplete}
                      loading={saving}
                      size="large"
                    >
                      完成改进
                    </Button>
                    <Button onClick={() => handleSaveStep(false)} loading={saving}>
                      保存草稿
                    </Button>
                  </Space>
                )}
              </Card>
            )}
          </Form>
        </Col>

        <Col span={6}>
          <Card title="项目时间线" size="small">
            <Timeline items={getTimelineItems()} />
          </Card>

          <Card title="问题描述" size="small" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {data.problem_description}
            </div>
          </Card>

          {data.corrective_action && (
            <Card title="纠正措施" size="small" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {data.corrective_action}
              </div>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default ImprovementDetail;
