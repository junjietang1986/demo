import React, { useRef, useState } from 'react';
import { Space, Upload, Modal, Alert, Tag, App, Typography } from 'antd';
import { FileExcelOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons';
import { impexpApi } from '@/api';
import { ResizableTable } from './ResizableTable';

const { Text } = Typography;

interface ImportExportToolbarProps {
  module: string;
  onImportSuccess?: () => void;
  showTemplate?: boolean;
  showExport?: boolean;
  showImport?: boolean;
  extraButtons?: React.ReactNode;
  params?: Record<string, any>;
}

const actionTabStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '12px 16px',
  cursor: 'pointer',
  fontSize: 14,
  color: 'rgba(0,0,0,0.65)',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'transparent',
  transition: 'color 0.2s',
  fontFamily: 'inherit',
};

const ImportExportToolbar: React.FC<ImportExportToolbarProps> = ({
  module,
  onImportSuccess,
  showTemplate = true,
  showExport = true,
  showImport = true,
  extraButtons,
  params
}) => {
  const { message } = App.useApp();
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleDownloadTemplate = () => {
    impexpApi.downloadTemplate(module, params).catch((err: any) => {
      message.error(err.message || '下载模板失败');
    });
  };

  const handleExport = () => {
    impexpApi.exportData(module, params).catch((err: any) => {
      message.error(err.message || '导出失败');
    });
  };

  const handleFileSelect = async (file: File) => {
    setParsing(true);
    setImportModalVisible(true);
    try {
      const res = await impexpApi.previewImport(module, file, params);
      setPreviewData(res);
    } catch (err: any) {
      message.error(err.message || '文件解析失败');
      setImportModalVisible(false);
    } finally {
      setParsing(false);
    }
    return false;
  };

  const handleConfirmImport = async () => {
    if (!previewData?.batch_id) return;
    setImporting(true);
    try {
      const res = await impexpApi.confirmImport(previewData.batch_id);
      message.success(res.message || '导入成功');
      setImportModalVisible(false);
      setPreviewData(null);
      onImportSuccess?.();
    } catch (err: any) {
      message.error(err.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const previewColumns = previewData?.previewColumns?.length > 0
    ? previewData.previewColumns.map((col: any) => ({
        title: col.header,
        dataIndex: col.key,
        key: col.key,
        ellipsis: true,
        width: 150
      }))
    : previewData?.preview?.[0]
    ? Object.keys(previewData.preview[0])
        .filter(k => !k.startsWith('_'))
        .map(key => ({
          title: key,
          dataIndex: key,
          key,
          ellipsis: true,
          width: 150
        }))
    : [];

  return (
    <>
      <div style={{ borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
        <Space size={0} wrap>
          {showTemplate && (
            <button
              style={actionTabStyle}
              onClick={handleDownloadTemplate}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.65)'; }}
            >
              <FileExcelOutlined /> 下载模板
            </button>
          )}
          {showExport && (
            <button
              style={actionTabStyle}
              onClick={handleExport}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.65)'; }}
            >
              <ExportOutlined /> 导出数据
            </button>
          )}
          {showImport && (
            <Upload
              accept=".xlsx,.xls"
              showUploadList={false}
              beforeUpload={handleFileSelect}
            >
              <button
                style={{ ...actionTabStyle, cursor: parsing ? 'wait' : 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#1677ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.65)'; }}
              >
                <ImportOutlined /> {parsing ? '解析中...' : '导入数据'}
              </button>
            </Upload>
          )}
          {extraButtons}
        </Space>
      </div>

      <Modal title="导入数据确认" open={importModalVisible} onCancel={() => { setImportModalVisible(false); setPreviewData(null); }} onOk={handleConfirmImport} confirmLoading={importing} okText="确认导入" cancelText="取消" destroyOnHidden
       className="modal-lg">
        {parsing ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Text>正在解析文件...</Text>
          </div>
        ) : previewData ? (
          <div>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <Alert
                type={previewData.errors?.length > 0 ? 'warning' : 'success'}
                message={previewData.message}
                showIcon
              />
              <Space>
                <Tag color="blue">总计: {previewData.total}条</Tag>
                <Tag color="green">有效: {previewData.success}条</Tag>
                {previewData.errors?.length > 0 && (
                  <Tag color="red">错误: {previewData.errors.length}条</Tag>
                )}
                {previewData.needs_approval && (
                  <Tag color="orange">审批类单据-需审批后生效</Tag>
                )}
              </Space>
              {previewData.errors?.length > 0 && (
                <Alert
                  type="error"
                  message="以下行存在错误，请修正后重新上传："
                  description={
                    <ul style={{ maxHeight: 120, overflow: 'auto', paddingLeft: 20, margin: 0 }}>
                      {previewData.errors.slice(0, 20).map((err: string, i: number) => (
                        <li key={i} style={{ fontSize: 12 }}>{err}</li>
                      ))}
                      {previewData.errors.length > 20 && <li>...还有{previewData.errors.length - 20}条错误</li>}
                    </ul>
                  }
                />
              )}
            </Space>

            {previewData.preview?.length > 0 && (
              <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>数据预览（前50条）：</Text>
                <ResizableTable
                  tableKey="import_preview"
                  size="small"
                  scroll={{ x: 'max-content', y: 300 }}
                  columns={previewColumns}
                  dataSource={previewData.preview}
                  rowKey={(r: any) => r._rowNumber || Math.random()}
                  pagination={false}
                />
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default ImportExportToolbar;
