import React, { useState, useRef, useCallback } from 'react';
import { Upload, Button, Space, Modal, message, Tag, Tooltip } from 'antd';
import {
  UploadOutlined, DownloadOutlined, DeleteOutlined, EyeOutlined,
  FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FilePptOutlined,
  FileImageOutlined, FileOutlined, PlusOutlined, InboxOutlined
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { getFileUrl, getFileIcon, isImageFile, isPdfFile, isOfficeFile, formatFileSize, getPreviewUrl, downloadFile } from '@/api';

interface AttachmentFile {
  id?: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  uploader_name?: string;
  created_at?: string;
}

interface AttachmentUploaderProps {
  accept?: string;
  multiple?: boolean;
  maxCount?: number;
  disabled?: boolean;
  readOnly?: boolean;
  listStyle?: 'table' | 'list';
  onUpload?: (file: File) => Promise<AttachmentFile>;
  onDelete?: (attachId: number, attach: AttachmentFile) => Promise<void>;
  value?: AttachmentFile[];
  onChange?: (files: AttachmentFile[]) => void;
}

const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.webp',
  multiple = true,
  maxCount,
  disabled = false,
  readOnly = false,
  listStyle = 'list',
  onUpload,
  onDelete,
  value,
  onChange
}) => {
  const [fileList, setFileList] = useState<AttachmentFile[]>(value || []);
  const [uploading, setUploading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (value) {
      setFileList(value);
    }
  }, [value]);

  const updateFiles = (files: AttachmentFile[]) => {
    setFileList(files);
    onChange?.(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    const newFiles: AttachmentFile[] = [...fileList];

    for (let i = 0; i < files.length; i++) {
      if (maxCount && newFiles.length >= maxCount) {
        message.warning(`最多只能上传 ${maxCount} 个文件`);
        break;
      }
      try {
        const result = await onUpload!(files[i]);
        newFiles.push(result);
        message.success(`${files[i].name} 上传成功`);
      } catch (err: any) {
        message.error(`${files[i].name} 上传失败: ${err.message || '未知错误'}`);
      }
    }

    updateFiles(newFiles);
    setUploading(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !readOnly && onUpload) setIsDragOver(true);
  }, [disabled, readOnly, onUpload]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || readOnly || !onUpload) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(multiple ? files : [files[0]]);
    }
  }, [disabled, readOnly, onUpload, multiple, fileList, maxCount]);

  const handleDelete = async (attach: AttachmentFile, index: number) => {
    try {
      if (attach.id && onDelete) {
        await onDelete(attach.id, attach);
      }
      const newFiles = fileList.filter((_, i) => i !== index);
      updateFiles(newFiles);
      message.success('删除成功');
    } catch (err: any) {
      message.error(`删除失败: ${err.message || '未知错误'}`);
    }
  };

  const handlePreview = (attach: AttachmentFile) => {
    setPreviewFile(attach);
    if (isImageFile(attach.file_name)) {
      setImagePreviewVisible(true);
    } else {
      setPreviewVisible(true);
    }
  };

  const getFileIconComponent = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const style = { fontSize: 18 };
    if (ext === 'pdf') return <FilePdfOutlined style={{ ...style, color: '#ff4d4f' }} />;
    if (['doc', 'docx'].includes(ext)) return <FileWordOutlined style={{ ...style, color: '#1677ff' }} />;
    if (['xls', 'xlsx'].includes(ext)) return <FileExcelOutlined style={{ ...style, color: '#52c41a' }} />;
    if (['ppt', 'pptx'].includes(ext)) return <FilePptOutlined style={{ ...style, color: '#fa8c16' }} />;
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return <FileImageOutlined style={{ ...style, color: '#722ed1' }} />;
    return <FileOutlined style={{ ...style, color: '#8c8c8c' }} />;
  };

  const renderFileItem = (attach: AttachmentFile, index: number) => (
    <div
      key={attach.id || `${attach.file_name}-${index}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        marginBottom: 8,
        background: '#fff',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <Space size="middle" style={{ flex: 1, minWidth: 0 }}>
        {getFileIconComponent(attach.file_name)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {attach.file_name}
          </div>
          <Space size="small" style={{ fontSize: 12, color: '#8c8c8c' }}>
            {attach.file_size !== undefined && <span>{formatFileSize(attach.file_size)}</span>}
            {attach.uploader_name && <span>上传人: {attach.uploader_name}</span>}
            {attach.created_at && <span>{attach.created_at?.slice(0, 16)}</span>}
          </Space>
        </div>
      </Space>
      <Space size={4}>
        <Tooltip title="预览">
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(attach)} />
        </Tooltip>
        <Tooltip title="下载">
          <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => downloadFile(attach.file_name, attach.file_path)} />
        </Tooltip>
        {!disabled && !readOnly && onDelete && (
          <Tooltip title="删除">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(attach, index)} />
          </Tooltip>
        )}
      </Space>
    </div>
  );

  const renderPreviewContent = () => {
    if (!previewFile) return null;

    if (isImageFile(previewFile.file_name)) {
      return (
        <img
          alt={previewFile.file_name}
          src={getFileUrl(previewFile.file_path)}
          style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
        />
      );
    }

    if (isPdfFile(previewFile.file_name)) {
      return (
        <iframe
          src={getFileUrl(previewFile.file_path)}
          style={{ width: '100%', height: '75vh', border: 'none' }}
          title={previewFile.file_name}
        />
      );
    }

    if (isOfficeFile(previewFile.file_name)) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            {getFileIconComponent(previewFile.file_name)}
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 500 }}>{previewFile.file_name}</div>
            <div style={{ color: '#8c8c8c', marginTop: 4 }}>
              {previewFile.file_size !== undefined && formatFileSize(previewFile.file_size)}
            </div>
          </div>
          <Space size="middle" direction="vertical">
            <div style={{ color: '#8c8c8c' }}>Office 文件请使用 Microsoft Office Online 预览，或下载后查看</div>
            <Space>
              <Button type="primary" icon={<EyeOutlined />} onClick={() => window.open(getPreviewUrl(previewFile!.file_name, previewFile!.file_path), '_blank')}>
                在线预览（Office Online）
              </Button>
              <Button icon={<DownloadOutlined />} onClick={() => downloadFile(previewFile!.file_name, previewFile!.file_path)}>
                下载文件
              </Button>
            </Space>
          </Space>
        </div>
      );
    }

    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        {getFileIconComponent(previewFile.file_name)}
        <div style={{ marginTop: 16, fontSize: 16 }}>{previewFile.file_name}</div>
        <div style={{ marginTop: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile(previewFile!.file_name, previewFile!.file_path)}>
            下载文件
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {!disabled && !readOnly && onUpload && (!maxCount || fileList.length < maxCount) && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragOver ? '#1677ff' : '#d9d9d9'}`,
            borderRadius: 8,
            padding: '16px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: fileList.length > 0 ? 8 : 0,
            backgroundColor: isDragOver ? 'rgba(22, 119, 255, 0.06)' : '#fafafa',
            transition: 'all 0.3s'
          }}
        >
          <p style={{ margin: 0, fontSize: 28, color: isDragOver ? '#1677ff' : '#999' }}>
            <InboxOutlined />
          </p>
          <p style={{ margin: '4px 0 0', color: isDragOver ? '#1677ff' : '#666' }}>
            {uploading ? '上传中...' : '点击或拖拽文件到此区域上传'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#999' }}>
            支持 PDF、Word、Excel、PPT、图片等格式
          </p>
        </div>
      )}

      {fileList.length > 0 && (
        <div>
          {fileList.map((attach, index) => renderFileItem(attach, index))}
        </div>
      )}

      <Modal
        title={previewFile?.file_name || '文件预览'}
        open={previewVisible}
        onCancel={() => { setPreviewVisible(false); setPreviewFile(null); }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => previewFile && downloadFile(previewFile.file_name, previewFile.file_path)}>
            下载
          </Button>,
          <Button key="close" onClick={() => { setPreviewVisible(false); setPreviewFile(null); }}>
            关闭
          </Button>
        ]}
        width={isPdfFile(previewFile?.file_name || '') ? 900 : 680}
        destroyOnHidden
        className="modal-xl"
      >
        {renderPreviewContent()}
      </Modal>

      <Modal
        open={imagePreviewVisible}
        title={previewFile?.file_name}
        onCancel={() => { setImagePreviewVisible(false); setPreviewFile(null); }}
        footer={null}
        destroyOnHidden
        className="modal-lg"
      >
        {previewFile && isImageFile(previewFile.file_name) && (
          <img
            alt={previewFile.file_name}
            src={getFileUrl(previewFile.file_path)}
            style={{ maxWidth: '100%', maxHeight: '75vh' }}
          />
        )}
      </Modal>
    </div>
  );
};

export default AttachmentUploader;
