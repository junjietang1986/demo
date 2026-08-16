import React, { useState, useEffect } from 'react';
import { Upload, Button, message, Space } from 'antd';
import { UploadOutlined, DownloadOutlined, DeleteOutlined, FileOutlined, PictureOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import api from '@/api';

interface UploadedFile {
  uid: string;
  id?: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  url?: string;
}

interface FileUploadProps {
  multiple?: boolean;
  accept?: string;
  listType?: 'text' | 'picture';
  maxCount?: number;
  uploadUrl: string;
  value?: UploadedFile[];
  onChange?: (files: UploadedFile[]) => void;
  onUploaded?: (file: UploadedFile) => void;
  onRemoved?: (file: UploadedFile) => void;
  disabled?: boolean;
  extraData?: Record<string, any>;
}

const FileUpload: React.FC<FileUploadProps> = ({
  multiple = false,
  accept,
  listType = 'text',
  maxCount,
  uploadUrl,
  value,
  onChange,
  onUploaded,
  onRemoved,
  disabled = false,
  extraData = {}
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  useEffect(() => {
    if (value) {
      const antFiles: UploadFile[] = value.map((f, idx) => ({
        uid: f.uid || `existing-${idx}-${f.file_name}`,
        name: f.file_name,
        status: 'done',
        url: f.url || `/uploads/${f.file_path}`,
        size: f.file_size,
        type: f.file_type,
        response: f
      }));
      setFileList(antFiles);
    } else {
      setFileList([]);
    }
  }, [value]);

  const syncFiles = (newFileList: UploadFile[]) => {
    const uploadedFiles: UploadedFile[] = newFileList
      .filter(f => f.status === 'done')
      .map(f => {
        const resp = f.response;
        if (resp && resp.file_name) {
          return {
            uid: f.uid,
            id: resp.id,
            file_name: resp.file_name,
            file_path: resp.file_path,
            file_size: resp.file_size,
            file_type: resp.file_type,
            url: `/uploads/${resp.file_path}`
          } as UploadedFile;
        }
        return {
          uid: f.uid,
          file_name: f.name,
          file_path: f.name,
          url: f.url,
          file_size: f.size,
          file_type: f.type
        } as UploadedFile;
      });
    onChange?.(uploadedFiles);
  };

  const customRequest: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError, onProgress } = options;
    const formData = new FormData();
    formData.append('file', file as File);

    Object.entries(extraData).forEach(([key, val]) => {
      formData.append(key, String(val));
    });

    try {
      const res: any = await api.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total) {
            onProgress?.({ percent: Math.round((event.loaded / event.total) * 100) });
          }
        }
      });

      const fileInfo: UploadedFile = {
        uid: (file as File).name + Date.now(),
        id: res.id,
        file_name: res.file_name || (file as File).name,
        file_path: res.file_path || (file as File).name,
        file_size: res.file_size || (file as File).size,
        file_type: res.file_type || (file as File).type,
        url: `/uploads/${res.file_path || (file as File).name}`
      };

      onSuccess?.(fileInfo, new XMLHttpRequest());
      onUploaded?.(fileInfo);
      message.success(`${(file as File).name} 上传成功`);
    } catch (err: any) {
      onError?.(err as Error);
      message.error(`${(file as File).name} 上传失败`);
    }
  };

  const handleChange: UploadProps['onChange'] = (info) => {
    let newFileList = [...info.fileList];

    newFileList = newFileList.map(file => {
      if (file.response && file.status === 'done') {
        const resp = file.response;
        file.url = `/uploads/${resp.file_path || file.name}`;
        file.name = resp.file_name || file.name;
      }
      return file;
    });

    setFileList(newFileList);
    syncFiles(newFileList);
  };

  const handleRemove = (file: UploadFile) => {
    const resp = file.response;
    if (resp && resp.file_name) {
      onRemoved?.({
        uid: file.uid,
        id: resp.id,
        file_name: resp.file_name,
        file_path: resp.file_path,
        file_size: resp.file_size,
        file_type: resp.file_type,
        url: file.url
      });
    } else {
      onRemoved?.({
        uid: file.uid,
        file_name: file.name,
        file_path: file.name,
        url: file.url
      });
    }
    const newList = fileList.filter(f => f.uid !== file.uid);
    setFileList(newList);
    syncFiles(newList);
  };

  const handleDownload = (file: UploadFile) => {
    const url = file.url || `/uploads/${file.response?.file_path || file.name}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const itemRender = (originNode: React.ReactElement, file: UploadFile) => {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          marginBottom: 8,
          background: file.status === 'uploading' ? '#fafafa' : '#fff'
        }}
      >
        <Space size="middle" style={{ flex: 1, minWidth: 0 }}>
          {listType === 'picture' ? <PictureOutlined style={{ fontSize: 16 }} /> : <FileOutlined style={{ fontSize: 16 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          {file.status === 'uploading' && (
            <span style={{ color: '#1677ff', fontSize: 12 }}>{file.percent}%</span>
          )}
          {file.status === 'error' && (
            <span style={{ color: '#ff4d4f', fontSize: 12 }}>上传失败</span>
          )}
        </Space>
        <Space size="small">
          {file.status === 'done' && (
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(file);
              }}
            />
          )}
          {!disabled && (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(file);
              }}
            />
          )}
        </Space>
      </div>
    );
  };

  const uploadButton = (
    <Button icon={<UploadOutlined />} disabled={disabled}>
      点击上传
    </Button>
  );

  return (
    <div>
      <Upload
        customRequest={customRequest}
        onChange={handleChange}
        fileList={fileList}
        multiple={multiple}
        accept={accept}
        maxCount={maxCount}
        disabled={disabled}
        itemRender={itemRender}
        showUploadList={false}
      >
        {maxCount && fileList.length >= maxCount ? null : uploadButton}
      </Upload>

      {fileList.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {fileList.map(file => (
            <React.Fragment key={file.uid}>
              {itemRender(<div />, file)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
