import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag,
  Popconfirm, message, Row, Col, Statistic, Divider, Upload, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined,
  ExportOutlined, SafetyOutlined, StarOutlined, CloudUploadOutlined,
  FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FilePptOutlined,
  FileImageOutlined, FileOutlined, DownloadOutlined, EyeOutlined
} from '@ant-design/icons';
import { bomApi, projectApi, formatFileSize, downloadFile, getFileUrl, isImageFile, isPdfFile } from '@/api';
import AttachmentUploader from '@/components/AttachmentUploader';
import { ResizableTable } from '../../components/ResizableTable';

interface Props {
  projectId: number;
}

interface BomItem {
  id: number;
  item_code: string;
  item_name: string;
  item_spec?: string;
  category_id?: number;
  category_name?: string;
  material?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  supplier?: string;
  make_or_buy: string;
  drawing_no?: string;
  drawing_version?: string;
  is_key_part: number;
  is_safety_part: number;
  status: string;
  remark?: string;
  creator_name?: string;
  attachments?: any[];
}

const BomTab: React.FC<Props> = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BomItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<BomItem | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [msgApi, contextHolder] = message.useMessage();

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsData, catsData, summaryData] = await Promise.all([
        bomApi.listByProject(projectId),
        bomApi.categories(),
        projectApi.getBomSummary(projectId)
      ]);
      setItems(itemsData || []);
      setCategories(catsData || []);
      setSummary(summaryData || {});
    } catch (err: any) {
      msgApi.error(err.message || '加载BOM数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetailAttachments = async (itemId: number) => {
    try {
      const detail = await bomApi.get(itemId);
      setDetailAttachments(detail?.attachments || []);
    } catch (err: any) {
      msgApi.error(err.message || '加载附件失败');
    }
  };

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      quantity: 1,
      unit: 'PCS',
      make_or_buy: 'buy',
      is_key_part: false,
      is_safety_part: false,
      status: 'draft'
    });
    setModalVisible(true);
  };

  const handleEdit = (item: BomItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      is_key_part: item.is_key_part === 1,
      is_safety_part: item.is_safety_part === 1
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (item: BomItem) => {
    setDetailItem(item);
    setDetailVisible(true);
    await loadDetailAttachments(item.id);
  };

  const handleDelete = async (id: number) => {
    try {
      await bomApi.delete(id);
      msgApi.success('删除成功');
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        project_id: projectId,
        is_key_part: values.is_key_part ? 1 : 0,
        is_safety_part: values.is_safety_part ? 1 : 0,
        total_price: (values.quantity || 1) * (values.unit_price || 0)
      };

      if (editingItem) {
        await bomApi.update(editingItem.id, data);
        msgApi.success('更新成功');
      } else {
        await bomApi.create(data);
        msgApi.success('添加成功');
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      msgApi.error(err.message || '保存失败');
    }
  };

  const handleUploadAttachment = async (itemId: number, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('attach_type', 'drawing');
    const result = await bomApi.uploadAttachment(itemId, formData);
    return result;
  };

  const handleDeleteAttachment = async (attachId: number) => {
    await bomApi.deleteAttachment(attachId);
    if (detailItem) {
      await loadDetailAttachments(detailItem.id);
    }
  };

  const getCategoryTree = () => {
    const parents = categories.filter((c: any) => c.parent_id === 0);
    return parents.map((p: any) => ({
      label: p.category_name,
      options: categories
        .filter((c: any) => c.parent_id === p.id)
        .map((c: any) => ({ label: c.category_name, value: c.id, category_name: c.category_name }))
    }));
  };

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_: any, __: any, idx: number) => idx + 1
    },
    {
      title: '物料编码',
      dataIndex: 'item_code',
      key: 'item_code',
      width: 130,
      fixed: 'left' as const
    },
    {
      title: '物料名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 200,
      render: (text: string, record: BomItem) => (
        <Space>
          {record.is_key_part === 1 && <Tag color="gold" icon={<StarOutlined />}>关键件</Tag>}
          {record.is_safety_part === 1 && <Tag color="red" icon={<SafetyOutlined />}>安全件</Tag>}
          <a onClick={() => handleViewDetail(record)}>{text}</a>
        </Space>
      )
    },
    { title: '规格型号', dataIndex: 'item_spec', key: 'item_spec', width: 150, ellipsis: true },
    { title: '分类', dataIndex: 'category_name', key: 'category_name', width: 110 },
    { title: '材质', dataIndex: 'material', key: 'material', width: 100 },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'right' as const },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
    {
      title: '单价(元)',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 90,
      align: 'right' as const,
      render: (v: number) => v?.toFixed(2)
    },
    {
      title: '总价(元)',
      dataIndex: 'total_price',
      key: 'total_price',
      width: 100,
      align: 'right' as const,
      render: (v: number) => <strong>{v?.toFixed(2)}</strong>
    },
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 120, ellipsis: true },
    {
      title: '自制/外购',
      dataIndex: 'make_or_buy',
      key: 'make_or_buy',
      width: 90,
      render: (v: string) => <Tag color={v === 'make' ? 'blue' : 'green'}>{v === 'make' ? '自制' : '外购'}</Tag>
    },
    { title: '图号', dataIndex: 'drawing_no', key: 'drawing_no', width: 120 },
    { title: '版本', dataIndex: 'drawing_version', key: 'drawing_version', width: 70 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) => {
        const colors: Record<string, string> = { draft: 'default', approved: 'green', changed: 'orange', obsolete: 'red' };
        return <Tag color={colors[v] || 'default'}>{v === 'draft' ? '草稿' : v === 'approved' ? '已确认' : v === 'changed' ? '变更中' : '已停用'}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: BomItem) => (
        <Space size="small">
          <Tooltip title="查看详情/图纸">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除此物料？" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      {contextHolder}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title="物料总数" value={summary.total_items || 0} suffix="项" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="自制件" value={summary.make_count || 0} suffix="项" valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="外购件" value={summary.buy_count || 0} suffix="项" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="关键件" value={summary.key_part_count || 0} suffix="项" valueStyle={{ color: '#faad14' }} prefix={<StarOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="安全件" value={summary.safety_part_count || 0} suffix="项" valueStyle={{ color: '#ff4d4f' }} prefix={<SafetyOutlined />} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="预估物料成本" value={summary.total_cost || 0} suffix="元" precision={2} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="BOM物料清单"
        extra={
          <Space wrap>
            <Button icon={<ImportOutlined />} disabled>导入BOM</Button>
            <Button icon={<ExportOutlined />} disabled>导出Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增物料</Button>
          </Space>
        }
      >
        <ResizableTable
          tableKey="project_bom"
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600, y: 'calc(100vh - 430px)' }}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
          summary={(pageData) => {
            let totalQty = 0;
            let totalAmount = 0;
            pageData.forEach((r: any) => {
              totalQty += r.quantity || 0;
              totalAmount += r.total_price || 0;
            });
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={7}>本页合计</Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">{totalQty}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8}></Table.Summary.Cell>
                  <Table.Summary.Cell index={9}></Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="right"><strong>{totalAmount.toFixed(2)}</strong></Table.Summary.Cell>
                  <Table.Summary.Cell index={11} colSpan={6}></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>

      <Modal title={editingItem ? '编辑物料' : '新增物料'} open={modalVisible} onOk={handleModalOk} onCancel={() => setModalVisible(false)} destroyOnHidden
         okText="保存" className="modal-lg">
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="item_code" label="物料编码" rules={[{ required: true, message: '请输入物料编码' }]}>
                <Input placeholder="如 M-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="item_name" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
                <Input placeholder="请输入物料名称" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="make_or_buy" label="自制/外购">
                <Select>
                  <Select.Option value="buy">外购</Select.Option>
                  <Select.Option value="make">自制</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="item_spec" label="规格型号">
                <Input placeholder="规格/型号/参数" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="category_id" label="物料分类">
                <Select placeholder="选择分类" options={getCategoryTree()} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="material" label="材质">
                <Input placeholder="如 Q235/SUS304" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={4}>
              <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="unit" label="单位">
                <Select>
                  <Select.Option value="PCS">PCS</Select.Option>
                  <Select.Option value="SET">SET</Select.Option>
                  <Select.Option value="M">M</Select.Option>
                  <Select.Option value="KG">KG</Select.Option>
                  <Select.Option value="个">个</Select.Option>
                  <Select.Option value="件">件</Select.Option>
                  <Select.Option value="套">套</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="unit_price" label="单价(元)">
                <InputNumber min={0} style={{ width: '100%' }} precision={2} />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="supplier" label="供应商">
                <Input placeholder="供应商名称" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="drawing_no" label="图号">
                <Input placeholder="图纸编号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={4}>
              <Form.Item name="drawing_version" label="图纸版本">
                <Input placeholder="如 A/01" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="is_key_part" label="关键件" valuePropName="checked">
                <Select>
                  <Select.Option value={true}>是</Select.Option>
                  <Select.Option value={false}>否</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="is_safety_part" label="安全件" valuePropName="checked">
                <Select>
                  <Select.Option value={true}>是</Select.Option>
                  <Select.Option value={false}>否</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="status" label="状态">
                <Select>
                  <Select.Option value="draft">草稿</Select.Option>
                  <Select.Option value="approved">已确认</Select.Option>
                  <Select.Option value="changed">变更中</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={detailItem ? `${detailItem.item_name} - 详情与图纸` : '物料详情'} open={detailVisible} onCancel={() => setDetailVisible(false)} footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>,
          detailItem && <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { setDetailVisible(false); handleEdit(detailItem); }}>编辑</Button>
        ]} destroyOnHidden
       className="modal-lg">
        {detailItem && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <div><strong>物料编码：</strong>{detailItem.item_code}</div>
                <div style={{ marginTop: 8 }}><strong>规格型号：</strong>{detailItem.item_spec || '-'}</div>
                <div style={{ marginTop: 8 }}><strong>材质：</strong>{detailItem.material || '-'}</div>
                <div style={{ marginTop: 8 }}><strong>数量：</strong>{detailItem.quantity} {detailItem.unit}</div>
                <div style={{ marginTop: 8 }}><strong>单价：</strong>¥{detailItem.unit_price?.toFixed(2)}</div>
              </Col>
              <Col span={12}>
                <div><strong>分类：</strong>{detailItem.category_name || '-'}</div>
                <div style={{ marginTop: 8 }}><strong>图号/版本：</strong>{detailItem.drawing_no || '-'} / {detailItem.drawing_version || '-'}</div>
                <div style={{ marginTop: 8 }}><strong>供应商：</strong>{detailItem.supplier || '-'}</div>
                <div style={{ marginTop: 8 }}><Space>
                  {detailItem.is_key_part === 1 && <Tag color="gold" icon={<StarOutlined />}>关键件</Tag>}
                  {detailItem.is_safety_part === 1 && <Tag color="red" icon={<SafetyOutlined />}>安全件</Tag>}
                  <Tag color={detailItem.make_or_buy === 'make' ? 'blue' : 'green'}>{detailItem.make_or_buy === 'make' ? '自制' : '外购'}</Tag>
                </Space></div>
                <div style={{ marginTop: 8 }}><strong>备注：</strong>{detailItem.remark || '-'}</div>
              </Col>
            </Row>
            <Divider orientation="left" style={{ margin: '12px 0' }}>附件/图纸</Divider>
            <AttachmentUploader
              disabled={false}
              value={detailAttachments}
              onUpload={(file) => handleUploadAttachment(detailItem.id, file)}
              onDelete={handleDeleteAttachment}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BomTab;
