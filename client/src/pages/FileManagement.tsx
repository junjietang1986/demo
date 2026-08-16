import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Button, Space, Input, Select, Tag, Typography, App,
  Row, Col, Statistic, Empty, Tooltip, Drawer, Descriptions
} from 'antd';
import { ResizableTable } from '../components/ResizableTable';
import {
  FolderOpenOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileImageOutlined,
  FileZipOutlined,
  SearchOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  FilterOutlined,
  ProjectOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { downloadFile, getFileUrl, getFileIcon, getPreviewUrl, formatFileSize } from '@/api';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Search } = Input;

interface FileRecord {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_by: number;
  uploader_name: string;
  created_at: string;
  module: string;
  record_id: number;
  task_id: number | null;
  ref_name: string;
  ref_code: string;
  module_label: string;
}

const moduleColors: Record<string, string> = {
  '交付物': 'blue',
  'APQP门控': 'cyan',
  '验收附件': 'green',
  '改进附件': 'orange',
  'BOM附件': 'purple',
  'CE物料证书': 'gold',
  'VOC客户需求': 'magenta',
  'PPAP交付': 'geekblue',
  'DVP&R试验': 'volcano',
  'FMEA': 'lime',
  'MSA': 'pink',
  'SPC': 'red',
  '控制计划': 'yellow',
  'ECR/ECO变更': 'default',
  '8D/CAPA': 'error',
  'VDA6.7审核': 'processing'
};

function getFileIconNode(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const style = { fontSize: 20 };
  if (ext === 'pdf') return <FilePdfOutlined style={{ ...style, color: '#d93025' }} />;
  if (['doc', 'docx'].includes(ext)) return <FileWordOutlined style={{ ...style, color: '#2b579a' }} />;
  if (['xls', 'xlsx'].includes(ext)) return <FileExcelOutlined style={{ ...style, color: '#217346' }} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return <FileImageOutlined style={{ ...style, color: '#1a73e8' }} />;
  if (['zip', 'rar', '7z'].includes(ext)) return <FileZipOutlined style={{ ...style, color: '#5f6368' }} />;
  return <FileOutlined style={{ ...style, color: '#5f6368' }} />;
}

const FileManagement: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [searchText, setSearchText] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const loadFiles = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (searchText) params.set('search', searchText);
      if (selectedModule) params.set('module', selectedModule);
      if (selectedProject) params.set('project_id', String(selectedProject));

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.code === 0) {
        setFiles(json.data.list || []);
        setStats(json.data.stats || []);
        setProjects(json.data.projects || []);
        setPagination(json.data.pagination);
      } else {
        message.error(json.message || '加载文件列表失败');
      }
    } catch (err: any) {
      message.error(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles(1);
  }, [selectedModule, selectedProject]);

  const handleSearch = (value: string) => {
    setSearchText(value);
    setTimeout(() => loadFiles(1), 0);
  };

  const handleDownload = (record: FileRecord) => {
    downloadFile(record.file_name, record.file_path);
  };

  const handlePreview = (record: FileRecord) => {
    setPreviewFile(record);
    setDrawerVisible(true);
  };

  const totalFiles = useMemo(() => stats.reduce((s, item) => s + item.count, 0), [stats]);

  const columns: ColumnsType<FileRecord> = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      width: 320,
      render: (text: string, record) => (
        <Space>
          {getFileIconNode(text)}
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      )
    },
    {
      title: '文件类型',
      dataIndex: 'module_label',
      key: 'module_label',
      width: 120,
      align: 'center' as const,
      render: (label: string) => <Tag color={moduleColors[label] || 'default'}>{label}</Tag>
    },
    {
      title: '关联对象',
      key: 'ref',
      width: 220,
      ellipsis: true,
      render: (_: any, record) => (
        <Tooltip title={record.ref_name}>
          <span>
            {record.ref_code && <Text type="secondary" style={{ marginRight: 6 }}>{record.ref_code}</Text>}
            {record.ref_name || '-'}
          </span>
        </Tooltip>
      )
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 100,
      render: (size: number) => formatFileSize(size || 0)
    },
    {
      title: '上传人',
      dataIndex: 'uploader_name',
      key: 'uploader_name',
      width: 100,
      render: (name: string) => name || '-'
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right' as const,
      render: (_: any, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)}>预览</Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>下载</Button>
        </Space>
      )
    }
  ];

  const moduleOptions = useMemo(() => {
    const options = stats.map(s => ({ value: s.module, label: `${s.module_label} (${s.count})` }));
    return [{ value: '', label: '全部类型' }, ...options];
  }, [stats]);

  return (
    <div style={{ padding: 'var(--page-padding)' }}>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <FolderOpenOutlined style={{ fontSize: 28, color: 'var(--google-blue)' }} />
          <div>
            <Title level={4} style={{ margin: 0 }}>文件管理</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>统一管理各阶段交付文件、APQP资料、验收附件等项目文档</Text>
          </div>
        </div>

        <Row gutter={16}>
          <Col span={6}>
            <Card size="small" style={{ background: 'var(--google-blue)', borderRadius: 8 }}>
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>文件总数</span>}
                value={totalFiles}
                valueStyle={{ color: '#fff', fontWeight: 600 }}
                prefix={<FileOutlined />}
              />
            </Card>
          </Col>
          {stats.slice(0, 6).map(s => (
            <Col span={4} key={s.module}>
              <Card size="small" hoverable style={{ borderRadius: 8, cursor: 'pointer', borderColor: selectedModule === s.module ? 'var(--google-blue)' : undefined }}
                onClick={() => setSelectedModule(selectedModule === s.module ? '' : s.module)}>
                <Statistic
                  title={<span style={{ fontSize: 12 }}>{s.module_label}</span>}
                  value={s.count}
                  prefix={<AppstoreOutlined style={{ color: moduleColors[s.module_label] || '#999' }} />}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Space wrap>
            <Select
              value={selectedProject || ''}
              onChange={v => setSelectedProject(v || null)}
              style={{ width: 220 }}
              placeholder="筛选项目"
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { value: '', label: '全部项目' },
                ...projects.map(p => ({ value: p.id, label: `${p.project_code} - ${p.project_name}` }))
              ]}
            />
            <Select
              value={selectedModule}
              onChange={setSelectedModule}
              style={{ width: 160 }}
              options={moduleOptions}
              placeholder="文件类型"
            />
            <Button icon={<ReloadOutlined />} onClick={() => loadFiles(pagination.page)}>刷新</Button>
          </Space>
          <Search
            placeholder="搜索文件名、关联对象、上传人"
            allowClear
            enterButton={<SearchOutlined />}
            style={{ width: 320 }}
            onSearch={handleSearch}
          />
        </div>

        <ResizableTable
          tableKey="file_list"
          columns={columns}
          dataSource={files}
          rowKey={r => `${r.module}-${r.id}`}
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 个文件`,
            onChange: (p) => loadFiles(p)
          }}
          size="middle"
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty description="暂无文件" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Card>

      <Drawer
        title={previewFile?.file_name}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={720}
        footer={
          previewFile && (
            <Space>
              <Button icon={<DownloadOutlined />} type="primary" onClick={() => handleDownload(previewFile)}>下载文件</Button>
            </Space>
          )
        }
      >
        {previewFile && (
          <>
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="文件名">{previewFile.file_name}</Descriptions.Item>
              <Descriptions.Item label="文件类型"><Tag color={moduleColors[previewFile.module_label]}>{previewFile.module_label}</Tag></Descriptions.Item>
              <Descriptions.Item label="关联对象">
                {previewFile.ref_code && <Tag>{previewFile.ref_code}</Tag>}
                {previewFile.ref_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatFileSize(previewFile.file_size || 0)}</Descriptions.Item>
              <Descriptions.Item label="上传人">{previewFile.uploader_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="上传时间">{previewFile.created_at}</Descriptions.Item>
            </Descriptions>
            <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, textAlign: 'center', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div>
                {getFileIconNode(previewFile.file_name)}
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(previewFile)}>下载文件查看</Button>
                </div>
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default FileManagement;
