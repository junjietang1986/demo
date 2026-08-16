import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Card,
  Row,
  Col,
  Popconfirm,
  App,
  Upload,
  Statistic,
  Tabs,
  Drawer,
  Switch,
  Alert,
  Descriptions,
  Checkbox,
  Tooltip,
  Dropdown,
  Progress
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
  UploadOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  InboxOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ClusterOutlined,
  SendOutlined,
  LinkOutlined,
  CloseCircleOutlined,
  MenuOutlined,
  DownOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import type { UploadProps, TabsProps } from 'antd';
import { ceMaterialApi } from '@/api';
import { useAppStore } from '@/store';
import {
  CEMaterial, CEDocType, CEArchive,
  CE_MATERIAL_CATEGORIES,
  NANDE_STATUS_MAP, OUCE_STATUS_MAP,
  COMPLIANCE_STATUS_MAP, ARCHIVE_STATUS_MANUAL_MAP,
  CE_APPROVAL_STATUS_MAP,
  NANDE_STATUS_OPTIONS, OUCE_STATUS_OPTIONS,
  COMPLIANCE_STATUS_OPTIONS, ARCHIVE_STATUS_MANUAL_OPTIONS
} from '@/types';
import CeBomTab from './project/CeBomTab';
import { ResizableTable } from '@/components/ResizableTable';

const { TextArea } = Input;

const StatusTag: React.FC<{ status?: string; map: Record<string, { label: string; color: string }>; defaultLabel?: string }> = ({ status, map, defaultLabel = '-' }) => {
  const info = map[status || ''] || { label: status || defaultLabel, color: 'default' };
  return <Tag color={info.color as any}>{info.label}</Tag>;
};

const CEMaterialPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const user = useAppStore(s => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [materialForm] = Form.useForm();
  const [archiveForm] = Form.useForm();
  const [docTypeForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('materials');
  const [loading, setLoading] = useState(false);
  const [docTypesLoading, setDocTypesLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [data, setData] = useState<CEMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [docTypes, setDocTypes] = useState<CEDocType[]>([]);
  const [docTypeTotal, setDocTypeTotal] = useState(0);
  const [docTypePagination, setDocTypePagination] = useState({ current: 1, pageSize: 10 });
  const [pendingArchives, setPendingArchives] = useState<any[]>([]);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [approvingArchive, setApprovingArchive] = useState<any>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveForm] = Form.useForm();
  const [stats, setStats] = useState({ total: 0, pending: 0, partial: 0, completed: 0, approved: 0, pendingApproval: 0 });
  const pendingMaterialRef = useRef<CEMaterial | null>(null);
  const pendingDocTypeRef = useRef<CEDocType | null>(null);
  const [filters, setFilters] = useState({
    keyword: '',
    category: undefined as string | undefined,
    archive_status: undefined as string | undefined,
    compliance_status: undefined as string | undefined,
    nande_status: undefined as string | undefined,
    ouce_status: undefined as string | undefined
  });

  const [materialModalVisible, setMaterialModalVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<CEMaterial | null>(null);

  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyMaterial, setHistoryMaterial] = useState<CEMaterial | null>(null);
  const [changeHistory, setChangeHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [bulkImportVisible, setBulkImportVisible] = useState(false);
  const [bulkExcelFile, setBulkExcelFile] = useState<File | null>(null);
  const [bulkFolderFiles, setBulkFolderFiles] = useState<File[]>([]);
  const [bulkFolderName, setBulkFolderName] = useState<string>('');
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number; percent: number }>({ current: 0, total: 0, percent: 0 });
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<any>(null);

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentMaterial, setCurrentMaterial] = useState<CEMaterial | null>(null);
  const [materialArchives, setMaterialArchives] = useState<CEArchive[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<number[]>([]);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'upload' | 'bind'>('upload');
  const [changingArchive, setChangingArchive] = useState<CEArchive | null>(null);
  const [bindSearchKeyword, setBindSearchKeyword] = useState('');
  const [bindSearchDocType, setBindSearchDocType] = useState<number | undefined>(undefined);
  const [bindSearchResults, setBindSearchResults] = useState<any[]>([]);
  const [bindSearchTotal, setBindSearchTotal] = useState(0);
  const [bindSearchPage, setBindSearchPage] = useState(1);
  const [bindSearchLoading, setBindSearchLoading] = useState(false);
  const [selectedBindArchiveId, setSelectedBindArchiveId] = useState<number | null>(null);
  const [bindDragOver, setBindDragOver] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const uploadModalTitleRef = useRef<HTMLDivElement | null>(null);
  const previewingRef = useRef<Set<number>>(new Set());

  const resetDragOffset = () => setDragOffset({ x: 0, y: 0 });

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.ant-modal-close')) return;
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, baseX: dragOffset.x, baseY: dragOffset.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragStartRef.current) return;
      setDragOffset({
        x: dragStartRef.current.baseX + (ev.clientX - dragStartRef.current.startX),
        y: dragStartRef.current.baseY + (ev.clientY - dragStartRef.current.startY)
      });
    };
    const onUp = () => {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [dragOffset]);

  const [docTypeModalVisible, setDocTypeModalVisible] = useState(false);
  const [editingDocType, setEditingDocType] = useState<CEDocType | null>(null);

  const fetchData = async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        page_size: pageSize,
        keyword: filters.keyword || undefined,
        category: filters.category,
        archive_status: filters.archive_status,
        compliance_status: filters.compliance_status,
        nande_status: filters.nande_status,
        ouce_status: filters.ouce_status
      };
      const res = await ceMaterialApi.list(params);
      setData(res.list || []);
      setTotal(res.total || 0);
      setPagination({ current: page, pageSize });
    } catch (error: any) {
      message.error(error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await ceMaterialApi.getStats();
      setStats(res || { total: 0, pending: 0, partial: 0, completed: 0, approved: 0, pendingApproval: 0 });
    } catch (error) {
      console.error('加载统计数据失败', error);
    }
  };

  const fetchDocTypes = async () => {
    setDocTypesLoading(true);
    try {
      const res = await ceMaterialApi.getDocTypes();
      const list = Array.isArray(res) ? res : (res.list || res);
      setDocTypes(list);
      setDocTypeTotal(Array.isArray(res) ? res.length : (res.total || list.length));
    } catch (error: any) {
      message.error(error.message || '加载文档类型失败');
    } finally {
      setDocTypesLoading(false);
    }
  };

  const fetchPending = async () => {
    setPendingLoading(true);
    try {
      const res: any = await ceMaterialApi.getPendingArchives();
      setPendingArchives(Array.isArray(res) ? res : (res.data || res.list || []));
    } catch (error: any) {
      message.error(error.message || '加载待审批数据失败');
    } finally {
      setPendingLoading(false);
    }
  };

  const fetchMaterialArchives = async (materialId: number) => {
    setDrawerLoading(true);
    try {
      const res = await ceMaterialApi.get(materialId);
      setCurrentMaterial(res);
      setMaterialArchives(res.archives || []);
      setSelectedArchiveIds([]);
    } catch (error: any) {
      message.error(error.message || '加载存档列表失败');
    } finally {
      setDrawerLoading(false);
    }
  };

  useEffect(() => {
    fetchDocTypes();
    fetchData(1);
    fetchStats();
    fetchPending();
  }, []);

  useEffect(() => {
    const matIdParam = searchParams.get('materialId');
    if (matIdParam) {
      const matId = parseInt(matIdParam, 10);
      if (!isNaN(matId)) {
        setActiveTab('materials');
        setDrawerVisible(true);
        fetchMaterialArchives(matId);
        setSearchParams({}, { replace: true });
      }
    }
  }, []);

  const handleSearch = () => {
    fetchData(1, pagination.pageSize);
  };

  const handleReset = () => {
    setFilters({
      keyword: '',
      category: undefined,
      archive_status: undefined,
      compliance_status: undefined,
      nande_status: undefined,
      ouce_status: undefined
    });
    setTimeout(() => fetchData(1, pagination.pageSize), 0);
  };

  const handleAddMaterial = () => {
    pendingMaterialRef.current = null;
    setEditingMaterial(null);
    setMaterialModalVisible(true);
  };

  const handleMaterialModalAfterOpen = (open: boolean) => {
    if (!open) return;
    setTimeout(() => {
      const record = pendingMaterialRef.current;
      if (record) {
        materialForm.setFieldsValue({
          ...record,
          alternative_model: (record as any).alternative_model || (record as any).alternative_suggestion || ''
        });
      } else {
        materialForm.resetFields();
        materialForm.setFieldsValue({
          nande_status: 'pending',
          ouce_status: 'pending',
          compliance_status: 'pending',
          archive_status_manual: 'not_archived'
        });
      }
    }, 50);
  };

  const handleEditMaterial = (record: CEMaterial) => {
    pendingMaterialRef.current = record;
    setEditingMaterial(record);
    setMaterialModalVisible(true);
  };

  const handleDeleteMaterial = async (id: number) => {
    try {
      await ceMaterialApi.delete(id);
      message.success('删除成功');
      fetchData();
      fetchStats();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleMaterialModalOk = async () => {
    try {
      const values = await materialForm.validateFields();
      if (editingMaterial) {
        const res: any = await ceMaterialApi.update(editingMaterial.id, values);
        if (res?.require_approval) {
          message.warning(res.message || '该物料已受控，信息变更已提交审批，审批通过后生效');
        } else {
          message.success('更新成功');
        }
      } else {
        await ceMaterialApi.create(values);
        message.success('创建成功');
      }
      setMaterialModalVisible(false);
      fetchData();
      fetchStats();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '保存失败');
    }
  };

  const handleViewArchives = (record: CEMaterial) => {
    setDrawerVisible(true);
    fetchMaterialArchives(record.id);
  };

  const handleViewChangeHistory = async (record: CEMaterial) => {
    setHistoryMaterial(record);
    setHistoryModalVisible(true);
    setHistoryLoading(true);
    try {
      const data = await ceMaterialApi.getChangeHistory(record.id);
      setChangeHistory(data || []);
    } catch (error: any) {
      message.error(error.message || '获取变更历史失败');
      setChangeHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenBulkImport = () => {
    setBulkExcelFile(null);
    setBulkFolderFiles([]);
    setBulkFolderName('');
    setBulkUploadProgress({ current: 0, total: 0, percent: 0 });
    setBulkImportResult(null);
    setBulkImportVisible(true);
  };

  const handleBulkImport = async () => {
    if (!bulkExcelFile) { message.warning('请选择Excel清单文件'); return; }
    if (bulkFolderFiles.length === 0) { message.warning('请选择包含文件的文件夹'); return; }

    const batchId = `batch_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    const totalFiles = bulkFolderFiles.length;
    const BATCH_SIZE = 10;
    setBulkImporting(true);
    setBulkUploadProgress({ current: 0, total: totalFiles, percent: 0 });

    try {
      // 第1批：上传Excel + 前10个文件
      const firstBatch = bulkFolderFiles.slice(0, BATCH_SIZE);
      await ceMaterialApi.bulkImportArchivesUpload(batchId, bulkExcelFile, firstBatch, (batchPercent) => {
        const overall = Math.round(Math.min(BATCH_SIZE, totalFiles) / totalFiles * batchPercent);
        setBulkUploadProgress({ current: Math.min(BATCH_SIZE, totalFiles), total: totalFiles, percent: overall });
      });

      // 后续批次：每批10个文件
      for (let i = BATCH_SIZE; i < totalFiles; i += BATCH_SIZE) {
        const batch = bulkFolderFiles.slice(i, i + BATCH_SIZE);
        const batchEnd = Math.min(i + BATCH_SIZE, totalFiles);
        await ceMaterialApi.bulkImportArchivesUpload(batchId, null, batch, (batchPercent) => {
          const overall = Math.round((i / totalFiles) * 100 + (batch.length / totalFiles) * batchPercent);
          setBulkUploadProgress({ current: batchEnd, total: totalFiles, percent: overall });
        });
        setBulkUploadProgress({ current: batchEnd, total: totalFiles, percent: Math.round((batchEnd / totalFiles) * 100) });
      }

      // 全部上传完毕，调用处理接口
      message.loading({ content: '文件上传完毕，正在处理...', key: 'processing', duration: 0 });
      const res: any = await ceMaterialApi.bulkImportArchivesProcess(batchId);
      message.destroy('processing');

      setBulkImportResult(res);
      if (res?.fail === 0) {
        message.success(`批量导入完成：成功${res.success}条物料，共导入${res.imported_files}个文件`);
      } else {
        message.warning(`批量导入完成：成功${res.success}条，失败${res.fail}条，请查看详情`);
      }
      fetchData(); fetchStats();
    } catch (error: any) {
      try { await ceMaterialApi.bulkImportArchivesCancel(batchId); } catch {}
      message.error(error.message || '批量导入失败');
    } finally {
      setBulkImporting(false);
      setBulkUploadProgress({ current: 0, total: 0, percent: 0 });
    }
  };

  const handleDownloadBulkTemplate = () => {
    const token = localStorage.getItem('token');
    fetch(ceMaterialApi.getBulkImportArchivesTemplateUrl(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(r => {
      if (!r.ok) throw new Error('下载失败');
      return r.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'CE物料文档批量导入模板.xlsx'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch((e: any) => message.error(e.message || '下载模板失败'));
  };

  const handleOpenUploadModal = () => {
    setUploadFile(null);
    setUploadMode('upload');
    setChangingArchive(null);
    setBindSearchKeyword('');
    setBindSearchDocType(undefined);
    setBindSearchResults([]);
    setBindSearchTotal(0);
    setBindSearchPage(1);
    setSelectedBindArchiveId(null);
    resetDragOffset();
    setUploadModalVisible(true);
  };

  const handleOpenChangeModal = (archive: CEArchive) => {
    setUploadFile(null);
    setUploadMode('upload');
    setChangingArchive(archive);
    setBindSearchKeyword('');
    setBindSearchDocType(undefined);
    setBindSearchResults([]);
    setBindSearchTotal(0);
    setBindSearchPage(1);
    setSelectedBindArchiveId(null);
    resetDragOffset();
    setUploadModalVisible(true);
  };

  const handleUploadModalAfterOpen = (open: boolean) => {
    if (!open) return;
    setTimeout(() => {
      archiveForm.resetFields();
      if (changingArchive) {
        const oldVer = changingArchive.version_no || '1.0';
        const verMatch = oldVer.match(/(\d+)(?:\.(\d+))?$/);
        let nextVer = '2.0';
        if (verMatch) {
          nextVer = `${parseInt(verMatch[1]) + 1}.0`;
        }
        archiveForm.setFieldsValue({
          doc_type_id: changingArchive.doc_type_id,
          cert_no: changingArchive.cert_no || '',
          version_no: nextVer,
          change_remark: '',
          remarks: ''
        });
      } else {
        archiveForm.setFieldsValue({ version_no: '1.0' });
      }
    }, 50);
  };

  const handleDocTypeChangeForVersion = useCallback(async (docTypeId: number) => {
    if (!currentMaterial || !docTypeId || changingArchive) return;
    try {
      const res = await ceMaterialApi.getMaxVersion(currentMaterial.id, docTypeId);
      const nextVer = res?.next_version || '1.0';
      archiveForm.setFieldsValue({ version_no: nextVer });
    } catch (e) {
      archiveForm.setFieldsValue({ version_no: '1.0' });
    }
  }, [currentMaterial, changingArchive, archiveForm]);

  const fetchBindArchives = useCallback(async (page = 1) => {
    if (!currentMaterial) return;
    setBindSearchLoading(true);
    try {
      const params: any = {
        keyword: bindSearchKeyword,
        doc_type_id: bindSearchDocType || '',
        page,
        pageSize: 8
      };
      if (!changingArchive) {
        params.exclude_material_id = currentMaterial.id;
      }
      const res: any = await ceMaterialApi.searchArchivesForBind(params);
      setBindSearchResults(res?.list || []);
      setBindSearchTotal(res?.total || 0);
      setBindSearchPage(page);
    } catch (e: any) {
      message.error(e.message || '搜索失败');
    } finally {
      setBindSearchLoading(false);
    }
  }, [bindSearchKeyword, bindSearchDocType, currentMaterial, changingArchive]);

  const handleBindSearch = () => {
    fetchBindArchives(1);
  };

  const selectBindArchive = (rec: any) => {
    if (!rec) return;
    setSelectedBindArchiveId(rec.id);
    // 绑定已有文件：版本号、编码完全复用源文件，不递增、不生成新版本
    const bindVer = rec.version_no || '1.0';
    archiveForm.setFieldsValue({
      doc_type_id: rec.doc_type_id,
      cert_no: rec.cert_no || '',
      version_no: bindVer,
      remarks: rec.remarks || ''
    });
  };

  const handleBindRowDragStart = (e: React.DragEvent, rec: any) => {
    e.dataTransfer.setData('application/x-bind-archive-id', String(rec.id));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleBindDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setBindDragOver(true);
  };

  const handleBindDragLeave = () => setBindDragOver(false);

  const handleBindDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setBindDragOver(false);
    const archiveId = parseInt(e.dataTransfer.getData('application/x-bind-archive-id'));
    if (archiveId) {
      const rec = bindSearchResults.find(r => r.id === archiveId);
      if (rec) selectBindArchive(rec);
    }
  };

  const handleUploadArchive = async () => {
    if (!currentMaterial) return;
    try {
      setUploading(true);
      const isChange = !!changingArchive;
      if (isChange && uploadMode === 'bind') {
        if (!selectedBindArchiveId) {
          message.warning('请选择要绑定的已有存档文件');
          return;
        }
        const values = await archiveForm.validateFields(['cert_no', 'version_no', 'change_remark', 'remarks']);
        await ceMaterialApi.changeBindArchive(currentMaterial.id, changingArchive!.id, {
          source_archive_id: selectedBindArchiveId,
          cert_no: values.cert_no,
          version_no: values.version_no,
          change_remark: values.change_remark,
          remarks: values.remarks
        });
        message.success(`新版本${values.version_no}已绑定现有文件，提交审批通过后将自动替换旧版本`);
      } else if (isChange) {
        if (!uploadFile) {
          message.warning('请选择要上传的新版本文件');
          return;
        }
        const values = await archiveForm.validateFields(['cert_no', 'version_no', 'change_remark', 'remarks']);
        const fm = new FormData();
        fm.append('file', uploadFile);
        if (values.cert_no) fm.append('cert_no', values.cert_no);
        if (values.version_no) fm.append('version_no', values.version_no);
        if (values.change_remark) fm.append('change_remark', values.change_remark);
        if (values.remarks) fm.append('remarks', values.remarks);
        const res = await ceMaterialApi.changeArchive(currentMaterial.id, changingArchive!.id, fm);
        const newName = res?.file_name || '';
        const newVer = res?.version_no || values.version_no;
        message.success(newName ? `新版本${newVer}已上传（${newName}），提交审批通过后将自动替换旧版本` : '新版本上传成功');
      } else if (uploadMode === 'bind') {
        if (!selectedBindArchiveId) {
          message.warning('请选择要绑定的已有存档文件');
          return;
        }
        const sourceRec = bindSearchResults.find(r => r.id === selectedBindArchiveId);
        const values = await archiveForm.validateFields(['cert_no', 'version_no', 'remarks']);
        await ceMaterialApi.bindArchive(currentMaterial.id, {
          source_archive_id: selectedBindArchiveId,
          doc_type_id: sourceRec?.doc_type_id,
          cert_no: values.cert_no,
          version_no: values.version_no,
          remarks: values.remarks
        });
        message.success('已绑定现有文件');
      } else {
        if (!uploadFile) {
          message.warning('请选择要上传的文件');
          return;
        }
        const values = await archiveForm.validateFields();
        const fm = new FormData();
        fm.append('file', uploadFile);
        fm.append('doc_type_id', values.doc_type_id);
        if (values.cert_no) fm.append('cert_no', values.cert_no);
        if (values.version_no) fm.append('version_no', values.version_no);
        if (values.remarks) fm.append('remarks', values.remarks);
        const res = await ceMaterialApi.uploadArchive(currentMaterial.id, fm);
        const newName = res?.file_name || '';
        message.success(newName ? `文件已按编码规则重命名为 ${newName} 并存档` : '上传成功');
      }
      setUploadModalVisible(false);
      setUploadFile(null);
      setSelectedBindArchiveId(null);
      setChangingArchive(null);
      setUploadMode('upload');
      archiveForm.resetFields();
      resetDragOffset();
      fetchMaterialArchives(currentMaterial.id);
      fetchData();
      fetchStats();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitArchive = async (archiveId: number) => {
    try {
      await ceMaterialApi.submitArchive(archiveId);
      message.success('已提交审批');
      if (currentMaterial) {
        fetchMaterialArchives(currentMaterial.id);
      }
      fetchPending();
      fetchData();
      fetchStats();
    } catch (error: any) {
      message.error(error.message || '提交审批失败');
    }
  };

  const handleBatchSubmit = async () => {
    if (!currentMaterial) return;
    if (selectedArchiveIds.length === 0) {
      message.warning('请选择要提交审批的存档');
      return;
    }
    setBatchSubmitting(true);
    try {
      await ceMaterialApi.batchSubmit(currentMaterial.id, {
        archive_ids: selectedArchiveIds,
        title: `${currentMaterial.part_name}-CE认证资料审批`
      });
      message.success(`已批量提交 ${selectedArchiveIds.length} 份存档审批`);
      setSelectedArchiveIds([]);
      fetchMaterialArchives(currentMaterial.id);
      fetchPending();
      fetchData();
      fetchStats();
    } catch (error: any) {
      message.error(error.message || '批量提交审批失败');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleDeleteArchive = async (archiveId: number) => {
    try {
      await ceMaterialApi.deleteArchive(archiveId);
      message.success('删除成功');
      if (currentMaterial) {
        fetchMaterialArchives(currentMaterial.id);
        fetchData();
        fetchStats();
        fetchPending();
      }
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleOpenApproveModal = (record: any) => {
    setApprovingArchive(record);
    approveForm.resetFields();
    approveForm.setFieldsValue({
      nande_status: 'approved',
      ouce_status: 'approved',
      archive_status_manual: 'archived'
    });
    setApproveModalVisible(true);
  };

  const handleDirectApprove = async (action: 'approve' | 'reject') => {
    if (!approvingArchive) return;
    try {
      const values = await approveForm.validateFields();
      if (action === 'reject' && !values.approval_remark?.trim()) {
        message.warning('驳回时请填写驳回原因');
        return;
      }
      setApproveLoading(true);
      await ceMaterialApi.directApproveArchive(approvingArchive.id, {
        action,
        reject_reason: action === 'reject' ? values.approval_remark : null,
        ...values
      });
      message.success(action === 'approve' ? '审批通过' : '已驳回');
      setApproveModalVisible(false);
      setApprovingArchive(null);
      approveForm.resetFields();
      fetchPending();
      fetchStats();
      fetchData();
      if (currentMaterial) fetchMaterialArchives(currentMaterial.id);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error.message || '操作失败');
    } finally {
      setApproveLoading(false);
    }
  };

  const handlePreviewArchive = async (id: number) => {
    if (previewingRef.current.has(id)) return;
    previewingRef.current.add(id);
    try {
      await ceMaterialApi.previewArchive(id);
    } catch (e: any) {
      message.error(e?.message || '预览失败');
    } finally {
      setTimeout(() => previewingRef.current.delete(id), 2000);
    }
  };

  const handleDownloadArchive = async (id: number) => {
    try {
      await ceMaterialApi.downloadArchive(id);
    } catch (e: any) {
      message.error(e?.message || '下载失败');
    }
  };

  const handleAddDocType = () => {
    pendingDocTypeRef.current = null;
    setEditingDocType(null);
    setDocTypeModalVisible(true);
  };

  const handleEditDocType = (record: CEDocType) => {
    pendingDocTypeRef.current = record;
    setEditingDocType(record);
    setDocTypeModalVisible(true);
  };

  const handleDocTypeModalAfterOpen = (open: boolean) => {
    if (!open) return;
    setTimeout(() => {
      const record = pendingDocTypeRef.current;
      if (record) {
        docTypeForm.setFieldsValue({
          type_code: record.type_code,
          type_name: record.type_name,
          description: record.description,
          code_prefix: record.code_prefix,
          sort_order: record.sort_order,
          seq_length: record.seq_length,
          current_seq: record.current_seq,
          is_enabled: record.is_enabled === 1
        });
      } else {
        docTypeForm.resetFields();
        docTypeForm.setFieldsValue({ seq_length: 6, current_seq: 1, is_enabled: true });
      }
    }, 50);
  };

  const handleDeleteDocType = async (id: number) => {
    try {
      await ceMaterialApi.deleteDocType(id);
      message.success('删除成功');
      fetchDocTypes();
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleGenerateCode = async (record: CEDocType) => {
    try {
      const res = await ceMaterialApi.generateCode(record.id);
      const code = res.next_code || res.code || res;
      modal.success({
        title: '编码生成成功',
        content: `下一个编码：${code}`,
      });
      fetchDocTypes();
    } catch (error: any) {
      message.error(error.message || '生成编码失败');
    }
  };

  const handleDocTypeModalOk = async () => {
    try {
      const values = await docTypeForm.validateFields();
      const submitData = {
        ...values,
        is_enabled: values.is_enabled ? 1 : 0
      };
      if (editingDocType) {
        await ceMaterialApi.updateDocType(editingDocType.id, submitData);
        message.success('更新成功');
      } else {
        await ceMaterialApi.createDocType(submitData);
        message.success('创建成功');
      }
      setDocTypeModalVisible(false);
      fetchDocTypes();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error(error.message || '保存失败');
    }
  };

  const getExampleCode = (prefix: string, seqLength: number, currentSeq: number) => {
    if (!prefix) return '-';
    const seqStr = String(currentSeq).padStart(seqLength || 6, '0');
    return prefix + seqStr;
  };

  const handleExportMaterials = (type: 'simple' | 'doc' = 'doc') => {
    if (type === 'doc') {
      const params = {
        keyword: filters.keyword || undefined,
        category: filters.category,
        archive_status: filters.archive_status
      };
      // 同步调用，保持用户手势链，避免window.open被浏览器拦截
      ceMaterialApi.exportMaterials(params, 'doc');
      message.success('已开始打包下载，请在浏览器下载中查看进度');
    } else {
      (async () => {
        try {
          const params = {
            keyword: filters.keyword || undefined,
            category: filters.category,
            archive_status: filters.archive_status
          };
          await ceMaterialApi.exportMaterialsSimple(params);
          message.success('导出成功');
        } catch (error: any) {
          message.error(error.message || '导出失败');
        }
      })();
    }
  };

  const handleClearAll = () => {
    modal.confirm({
      title: '确认清空所有CE物料数据？',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p style={{ color: '#ff4d4f', marginBottom: 8 }}>此操作将清空以下数据：</p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li>所有CE物料清单</li>
            <li>所有上传的存档文件</li>
            <li>所有存档审批记录</li>
            <li>重置所有文档类型当前序列号为0</li>
          </ul>
          <p style={{ color: '#ff4d4f', marginTop: 8 }}>此操作不可恢复，请谨慎操作！</p>
        </div>
      ),
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await ceMaterialApi.clearAll();
          message.success('CE物料数据已全部清空');
          fetchData(1);
          fetchStats();
          fetchDocTypes();
          fetchPending();
        } catch (error: any) {
          message.error(error.message || '清空失败');
        }
      }
    });
  };

  const importCustomRequest: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    const fm = new FormData();
    fm.append('file', file as Blob);
    try {
      const res = await ceMaterialApi.importMaterials(fm);
      const { inserted = 0, updated = 0 } = res || {};
      message.success(`导入完成：新增${inserted}条，更新${updated}条`);
      onSuccess?.(res, file as any);
      fetchData(1);
      fetchStats();
    } catch (e: any) {
      onError?.(e as Error);
      message.error(e?.message || '导入失败');
    }
  };

  const archiveUploadProps: UploadProps = {
    beforeUpload: (file) => {
      setUploadFile(file);
      return false;
    },
    onRemove: () => {
      setUploadFile(null);
    },
    maxCount: 1,
    fileList: uploadFile ? [uploadFile as any] : [],
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,.rar'
  };

  const materialColumnsRaw: any[] = [
    {
      title: '序号',
      dataIndex: 'sort_no',
      key: 'sort_no',
      width: 50,
      render: (v: number, _r: any, idx: number) => v || idx + 1
    },
    {
      title: '新增日期',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      ellipsis: true,
      render: (text: string) => {
        if (!text) return '-';
        const d = new Date(text);
        return isNaN(d.getTime()) ? text : `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      }
    },
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 65,
      render: (cat: string) => cat ? <Tag color="blue" style={{ margin: 0 }}>{cat}</Tag> : '-'
    },
    {
      title: '物料品号',
      dataIndex: 'part_code',
      key: 'part_code',
      width: 120,
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '物料品名',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 150,
      ellipsis: true
    },
    {
      title: '物料规格',
      dataIndex: 'spec',
      key: 'spec',
      width: 130,
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '替代型号',
      dataIndex: 'alternative_model',
      key: 'alternative_model',
      width: 130,
      ellipsis: true,
      render: (_: any, record: any) => record.alternative_model || record.alternative_suggestion || '-'
    },
    {
      title: '品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 80,
      render: (text: string) => text || '-'
    },
    {
      title: '选型负责人',
      dataIndex: 'selector_name',
      key: 'selector_name',
      width: 90,
      render: (text: string) => text || '-'
    },
    {
      title: '采购',
      dataIndex: 'purchaser_name',
      key: 'purchaser_name',
      width: 70,
      render: (text: string) => text || '-'
    },
    {
      title: 'CE认证报告',
      dataIndex: 'ce_cert_code',
      key: 'ce_cert_code',
      width: 110,
      ellipsis: true,
      render: (text: string) => text ? <Tooltip title={text}><span style={{ fontSize: 12, color: '#1677ff' }}>{text}</span></Tooltip> : <span style={{ color: '#999' }}>-</span>
    },
    {
      title: 'DOC自我声明',
      dataIndex: 'doc_code',
      key: 'doc_code',
      width: 110,
      ellipsis: true,
      render: (text: string) => text ? <Tooltip title={text}><span style={{ fontSize: 12, color: '#1677ff' }}>{text}</span></Tooltip> : <span style={{ color: '#999' }}>-</span>
    },
    {
      title: '英文说明书',
      dataIndex: 'manual_code',
      key: 'manual_code',
      width: 110,
      ellipsis: true,
      render: (text: string) => text ? <Tooltip title={text}><span style={{ fontSize: 12, color: '#1677ff' }}>{text}</span></Tooltip> : <span style={{ color: '#999' }}>-</span>
    },
    {
      title: '测试报告',
      dataIndex: 'test_report_code',
      key: 'test_report_code',
      width: 110,
      ellipsis: true,
      render: (text: string) => text ? <Tooltip title={text}><span style={{ fontSize: 12, color: '#1677ff' }}>{text}</span></Tooltip> : <span style={{ color: '#999' }}>-</span>
    },
    {
      title: '是否存档',
      dataIndex: 'archive_status_manual',
      key: 'archive_status_manual',
      width: 90,
      render: (status: string) => <StatusTag status={status} map={ARCHIVE_STATUS_MANUAL_MAP} defaultLabel="未存档" />
    },
    {
      title: '南德',
      dataIndex: 'nande_status',
      key: 'nande_status',
      width: 70,
      render: (status: string) => <StatusTag status={status} map={NANDE_STATUS_MAP} />
    },
    {
      title: '欧测',
      dataIndex: 'ouce_status',
      key: 'ouce_status',
      width: 70,
      render: (status: string) => <StatusTag status={status} map={OUCE_STATUS_MAP} />
    },
    {
      title: '是否合规',
      dataIndex: 'compliance_status',
      key: 'compliance_status',
      width: 80,
      render: (status: string) => <StatusTag status={status} map={COMPLIANCE_STATUS_MAP} defaultLabel="待确认" />
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 110,
      ellipsis: true,
      render: (text: string) => {
        return text ? (
          <Tooltip title={text}>
            <span>{text}</span>
          </Tooltip>
        ) : '-';
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: CEMaterial) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditMaterial(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<FolderOpenOutlined />} onClick={() => handleViewArchives(record)}>
            存档
          </Button>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => handleViewChangeHistory(record)}>
            历史
          </Button>
          <Popconfirm title="确定删除该物料?" onConfirm={() => handleDeleteMaterial(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const archiveColumnsRaw: any[] = [
    {
      title: '选择',
      key: 'select',
      width: 50,
      render: (_: any, record: CEArchive) => {
        const canSelect = ['draft', 'rejected'].includes(record.approval_status || '');
        return canSelect ? (
          <Checkbox
            checked={selectedArchiveIds.includes(record.id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedArchiveIds([...selectedArchiveIds, record.id]);
              } else {
                setSelectedArchiveIds(selectedArchiveIds.filter(id => id !== record.id));
              }
            }}
          />
        ) : null;
      }
    },
    {
      title: '文档类型',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 120,
      render: (text: string) => text || '-'
    },
    {
      title: '文件名',
      dataIndex: 'original_name',
      key: 'original_name',
      width: 280,
      ellipsis: true,
      render: (_: any, r: any) => {
        const ext = r.file_name?.includes('.') ? r.file_name.substring(r.file_name.lastIndexOf('.')) : '';
        const name = r.archive_code ? `${r.archive_code}${ext}` : (r.original_name || '-');
        return (
          <span>
            {name}
            {r.replaces_archive_id && (
              <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>变更版</Tag>
            )}
            {r.is_bound && (
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>绑定</Tag>
            )}
          </span>
        );
      }
    },
    {
      title: '证书号',
      dataIndex: 'cert_no',
      key: 'cert_no',
      width: 120,
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '版本',
      dataIndex: 'version_no',
      key: 'version_no',
      width: 70,
      render: (text: string) => text || '-'
    },
    {
      title: '审批状态',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: 90,
      render: (status: string) => {
        const info = CE_APPROVAL_STATUS_MAP[status] || { label: status || '草稿', color: 'default' };
        return <Tag color={info.color as any}>{info.label}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); handlePreviewArchive(record.id); }}>
            预览
          </Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={(e) => { e.stopPropagation(); handleDownloadArchive(record.id); }}>
            下载
          </Button>
          {(record.approval_status === 'draft' || record.approval_status === 'rejected') && !record.replaces_archive_id && (
            <Button type="link" size="small" icon={<SendOutlined />} onClick={() => handleSubmitArchive(record.id)}>
              提交
            </Button>
          )}
          {record.replaces_archive_id && (record.approval_status === 'draft' || record.approval_status === 'rejected') && (
            <Button type="link" size="small" icon={<SendOutlined />} onClick={() => handleSubmitArchive(record.id)}>
              提交变更
            </Button>
          )}
          {record.approval_status === 'approved' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenChangeModal(record)}>
              变更
            </Button>
          )}
          {(record.approval_status === 'draft' || record.approval_status === 'rejected') && (
            <Popconfirm title={record.replaces_archive_id ? "确定删除该变更版本？旧版本不受影响。" : "确定删除该存档?"} onConfirm={() => handleDeleteArchive(record.id)} okText="确定" cancelText="取消">
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  const docTypeColumnsRaw: any[] = [
    {
      title: '编码',
      dataIndex: 'type_code',
      key: 'type_code',
      width: 100
    },
    {
      title: '名称',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 140
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 180,
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '编码前缀',
      dataIndex: 'code_prefix',
      key: 'code_prefix',
      width: 90
    },
    {
      title: '序列长度',
      dataIndex: 'seq_length',
      key: 'seq_length',
      width: 80
    },
    {
      title: '当前序列号',
      dataIndex: 'current_seq',
      key: 'current_seq',
      width: 100
    },
    {
      title: '示例编码',
      key: 'example',
      width: 130,
      render: (_: any, record: CEDocType) => (
        <span style={{ fontFamily: 'monospace' }}>
          {getExampleCode(record.code_prefix, record.seq_length, record.current_seq)}
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      width: 80,
      render: (val: number) => (
        <Tag color={val === 1 ? 'success' : 'default'}>
          {val === 1 ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: CEDocType) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleGenerateCode(record)}>
            生成编码
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditDocType(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除该文档类型?" onConfirm={() => handleDeleteDocType(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const pendingColumnsRaw: any[] = [
    {
      title: '存档编码',
      dataIndex: 'archive_code',
      key: 'archive_code',
      width: 130
    },
    {
      title: '物料信息',
      key: 'material_info',
      width: 240,
      render: (_: any, record: any) => (
        <div>
          <div>{record.part_code || '-'}</div>
          <div style={{ color: '#666', fontSize: 12 }}>{record.part_name || '-'} / {record.brand || '-'}</div>
        </div>
      )
    },
    {
      title: '文档类型',
      dataIndex: 'type_name',
      key: 'type_name',
      width: 120,
      render: (text: string) => text || '-'
    },
    {
      title: '文件名',
      dataIndex: 'original_name',
      key: 'original_name',
      width: 200,
      ellipsis: true,
      render: (_: any, r: any) => {
        const ext = r.file_name?.includes('.') ? r.file_name.substring(r.file_name.lastIndexOf('.')) : '';
        return r.archive_code ? `${r.archive_code}${ext}` : (r.original_name || '-');
      }
    },
    {
      title: '批次号',
      dataIndex: 'batch_code',
      key: 'batch_code',
      width: 130,
      render: (text: string) => text || '-'
    },
    {
      title: '提交人',
      dataIndex: 'submitter_name',
      key: 'submitter_name',
      width: 90,
      render: (text: string) => text || '-'
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (text: string) => text || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreviewArchive(record.id)}>
            预览
          </Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadArchive(record.id)}>
            下载
          </Button>
          <Button type="link" size="small" onClick={() => {
            if (record.material_id) {
              setActiveTab('materials');
              setDrawerVisible(true);
              fetchMaterialArchives(record.material_id);
            }
          }}>
            查看物料
          </Button>
        </Space>
      )
    }
  ];

  const selectableArchives = materialArchives.filter(a => ['draft', 'rejected'].includes(a.approval_status || ''));

  const tabItems: TabsProps['items'] = [
    {
      key: 'materials',
      label: (
        <span>
          <InboxOutlined />
          物料清单
        </span>
      ),
      children: (
        <Card styles={{ body: { padding: '12px 16px' } }}>
          <Row gutter={[12, 8]} style={{ marginBottom: 8 }} align="middle">
            <Col flex="260px">
              <Input.Search
                placeholder="品号/品名/规格/品牌/替代/选型人/采购/证书号等"
                value={filters.keyword}
                onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                onSearch={handleSearch}
                allowClear
                size="small"
              />
            </Col>
            <Col flex="110px">
              <Select
                style={{ width: '100%' }}
                placeholder="物料类别"
                allowClear
                showSearch
                size="small"
                optionFilterProp="children"
                value={filters.category}
                onChange={(v) => setFilters({ ...filters, category: v })}
              >
                {CE_MATERIAL_CATEGORIES.map(cat => (
                  <Select.Option key={cat} value={cat}>{cat}</Select.Option>
                ))}
              </Select>
            </Col>
            <Col flex="110px">
              <Select
                style={{ width: '100%' }}
                placeholder="存档状态"
                allowClear
                size="small"
                value={filters.archive_status}
                onChange={(v) => setFilters({ ...filters, archive_status: v })}
                options={ARCHIVE_STATUS_MANUAL_OPTIONS}
              />
            </Col>
            <Col flex="110px">
              <Select
                style={{ width: '100%' }}
                placeholder="合规状态"
                allowClear
                size="small"
                value={filters.compliance_status}
                onChange={(v) => setFilters({ ...filters, compliance_status: v })}
                options={COMPLIANCE_STATUS_OPTIONS}
              />
            </Col>
            <Col flex="90px">
              <Select
                style={{ width: '100%' }}
                placeholder="南德"
                allowClear
                size="small"
                value={filters.nande_status}
                onChange={(v) => setFilters({ ...filters, nande_status: v })}
                options={NANDE_STATUS_OPTIONS}
              />
            </Col>
            <Col flex="90px">
              <Select
                style={{ width: '100%' }}
                placeholder="欧测"
                allowClear
                size="small"
                value={filters.ouce_status}
                onChange={(v) => setFilters({ ...filters, ouce_status: v })}
                options={OUCE_STATUS_OPTIONS}
              />
            </Col>
            <Col>
              <Space size={4}>
                <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>
                  搜索
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>
                  重置
                </Button>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddMaterial}>
                  新增物料
                </Button>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'tpl_material',
                        icon: <DownloadOutlined />,
                        label: '批量导入物料清单模版',
                        onClick: () => {
                          ceMaterialApi.downloadMaterialTemplate().catch((e: any) => message.error(e?.message || '下载模板失败'));
                        }
                      },
                      {
                        key: 'import_material',
                        icon: <UploadOutlined />,
                        label: (
                          <Upload
                            accept=".xlsx,.xls"
                            showUploadList={false}
                            customRequest={importCustomRequest}
                          >
                            <span style={{ display: 'block', width: '100%' }}>批量导入物料清单</span>
                          </Upload>
                        )
                      },
                      { type: 'divider' as const },
                      {
                        key: 'tpl_doc',
                        icon: <DownloadOutlined />,
                        label: '批量导入文档模版',
                        onClick: () => {
                          ceMaterialApi.downloadDocumentTemplate().catch((e: any) => message.error(e?.message || '下载模板失败'));
                        }
                      },
                      {
                        key: 'import_doc',
                        icon: <UploadOutlined />,
                        label: '批量导入文档',
                        onClick: handleOpenBulkImport
                      },
                      { type: 'divider' as const },
                      {
                        key: 'export_material',
                        icon: <DownloadOutlined />,
                        label: '批量导出物料清单',
                        onClick: () => handleExportMaterials('simple')
                      },
                      {
                        key: 'export_doc',
                        icon: <DownloadOutlined />,
                        label: '批量导出文档',
                        onClick: () => handleExportMaterials('doc')
                      }
                    ]
                  }}
                >
                  <Button size="small" icon={<DownOutlined />}>
                    更多操作
                  </Button>
                </Dropdown>
                {user?.role === 'admin' && (
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={handleClearAll}>
                    一键清空
                  </Button>
                )}
              </Space>
            </Col>
          </Row>

          <ResizableTable
            tableKey="ce_materials"
            columns={materialColumnsRaw}
            dataSource={data}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              ...pagination,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page, pageSize) => fetchData(page, pageSize),
              size: 'small'
            }}
            scroll={{ x: 2200 }}
          />
        </Card>
      )
    },
    {
      key: 'doctypes',
      label: (
        <span>
          <FileTextOutlined />
          文档类型配置
        </span>
      ),
      children: (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDocType}>
              新增文档类型
            </Button>
          </div>
          <ResizableTable
            tableKey="ce_doc_types"
            columns={docTypeColumnsRaw}
            dataSource={docTypes}
            rowKey="id"
            loading={docTypesLoading}
            pagination={false}
            scroll={{ x: 1100 }}
          />
        </Card>
      )
    },
    {
      key: 'ce-bom',
      label: (
        <span>
          <ClusterOutlined />
          项目BOM匹配
        </span>
      ),
      children: <CeBomTab />
    },
    {
      key: 'pending',
      label: (
        <span>
          <ClockCircleOutlined />
          待审批存档
          {pendingArchives.length > 0 && (
            <Tag color="red" style={{ marginLeft: 4 }}>{pendingArchives.length}</Tag>
          )}
        </span>
      ),
      children: (
        <Card>
          <Alert
            message="提示"
            description="此页面展示所有待审批的存档记录，仅作查看使用。审批操作请前往「审批管理 → 审批记录」页面进行审批，审批时可人工确认南德/欧测/存档状态，填写替代品号/规格建议。审批通过后物料自动标记为合规。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <ResizableTable
            tableKey="ce_pending"
            columns={pendingColumnsRaw}
            dataSource={pendingArchives}
            rowKey="id"
            loading={pendingLoading}
            pagination={false}
            scroll={{ x: 1200 }}
          />
        </Card>
      )
    }
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={5}>
          <Card>
            <Statistic
              title="物料总数"
              value={stats.total}
              prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="待补充认证资料"
              value={stats.pending}
              prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="待确认(有存档)"
              value={stats.partial}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="已存档合规"
              value={stats.completed}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="审批中"
              value={stats.pendingApproval}
              prefix={<ClockCircleOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal title={editingMaterial ? '编辑物料' : '新增物料'} open={materialModalVisible} onOk={handleMaterialModalOk} onCancel={() => setMaterialModalVisible(false)} afterOpenChange={handleMaterialModalAfterOpen} destroyOnHidden
       className="modal-lg">
        <Form form={materialForm} layout="vertical" preserve={false}>
          {editingMaterial && (editingMaterial as any).approved_archive_count > 0 && (
            <Alert
              message="受控物料变更需审批"
              description="该物料已有受控文档，修改基本信息后将提交至质量部审批，审批通过后变更才会生效。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          {!editingMaterial && (
            <Alert
              message="提示"
              description="南德、欧测、存档状态由审批人在审批时人工确认；合规状态根据审批结果自动判定（通过→合规，驳回→不合规）。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
          <Row gutter={16}>
            <Col span={4}>
              <Form.Item name="sort_no" label="排序号">
                <Input type="number" placeholder="排序号" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="part_code" label="物料品号">
                <Input placeholder="请输入物料品号" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                name="part_name"
                label="物料品名"
                rules={[{ required: true, message: '请输入物料品名' }]}
              >
                <Input placeholder="请输入物料品名" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="spec" label="规格">
                <Input placeholder="请输入规格" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="brand" label="品牌">
                <Input placeholder="请输入品牌" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="类别">
                <Select placeholder="请选择类别" allowClear>
                  {CE_MATERIAL_CATEGORIES.map(cat => (
                    <Select.Option key={cat} value={cat}>{cat}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="alternative_model" label="替代品号/规格">
                <Input placeholder="请输入替代品号/规格" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="selector_name" label="选型人">
                <Input placeholder="请输入选型人" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="purchaser_name" label="采购">
                <Input placeholder="请输入采购" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`变更历史 - ${historyMaterial?.part_name || ''}（${historyMaterial?.part_code || ''}）`}
        open={historyModalVisible}
        onCancel={() => { setHistoryModalVisible(false); setChangeHistory([]); }}
        footer={[<Button key="close" onClick={() => { setHistoryModalVisible(false); setChangeHistory([]); }}>关闭</Button>]}
        width={800}
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
        ) : changeHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>暂无变更记录</div>
        ) : (
          <div>
            {changeHistory.map((v, idx) => {
              const data = v.snapshot_data || {};
              const approval = v.approval_record;
              const approverName = approval?.approver_name || '';
              const rejectReason = approval?.reject_reason || approval?.approval_comment || '';
              const statusColor = v.status === 'approved' ? 'success' : v.status === 'pending' ? 'processing' : v.status === 'rejected' ? 'error' : 'default';
              const statusText = v.status === 'approved' ? '已生效' : v.status === 'pending' ? '审批中' : v.status === 'rejected' ? '已驳回' : v.status;
              return (
                <Card
                  key={v.id}
                  size="small"
                  style={{ marginBottom: 12 }}
                  title={
                    <Space>
                      <Tag color={statusColor}>{v.version_label}</Tag>
                      <Tag color={statusColor}>{statusText}</Tag>
                      <span style={{ fontWeight: 'normal', fontSize: 13, color: '#666' }}>
                        {v.change_summary || '信息变更'}
                      </span>
                    </Space>
                  }
                  extra={
                    <span style={{ fontSize: 12, color: '#999' }}>
                      {v.created_by_name || ''} 提交于 {v.created_at}
                      {approverName && v.status === 'approved' && ` · ${approverName} 批准于 ${v.approved_at}`}
                      {approverName && v.status === 'rejected' && ` · ${approverName} 驳回于 ${v.approved_at}`}
                    </span>
                  }
                >
                  <Descriptions size="small" column={2} bordered>
                    <Descriptions.Item label="排序号">{data.sort_no ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="物料品号">{data.part_code || '-'}</Descriptions.Item>
                    <Descriptions.Item label="物料品名">{data.part_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="规格">{data.spec || '-'}</Descriptions.Item>
                    <Descriptions.Item label="品牌">{data.brand || '-'}</Descriptions.Item>
                    <Descriptions.Item label="类别">{data.category || '-'}</Descriptions.Item>
                    <Descriptions.Item label="替代品号/规格" span={2}>{data.alternative_model || '-'}</Descriptions.Item>
                    <Descriptions.Item label="选型人">{data.selector_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="采购">{data.purchaser_name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="备注" span={2}>{data.remarks || '-'}</Descriptions.Item>
                  </Descriptions>
                  {v.status === 'rejected' && rejectReason && (
                    <Alert message={`驳回原因：${rejectReason}`} type="error" showIcon style={{ marginTop: 8 }} />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        title="批量导入文件资料"
        open={bulkImportVisible}
        onCancel={() => { setBulkImportVisible(false); setBulkImportResult(null); }}
        onOk={handleBulkImport}
        confirmLoading={bulkImporting}
        okText="开始导入"
        width={720}
        destroyOnHidden
      >
        <Alert
          message="使用说明"
          description={
            <div>
              <div>1. 下载模板，按照模板填写Excel清单（物料品号必填，CE证书/DOC/英文说明书/检测报告列填写对应文件名）</div>
              <div>2. 选择填写好的Excel清单和包含所有待导入文件的文件夹（支持子文件夹，系统按文件名自动查找）</div>
              <div>3. 点击"开始导入"，文件将分批上传并自动处理</div>
              <div>4. 系统按物料品号唯一匹配，找到的文件将按编码规则自动重命名并存档</div>
              <div>5. 导入的存档默认为已审核状态（仅系统管理员可操作）</div>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadBulkTemplate}>
              下载导入模板
            </Button>
          </div>
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small" title="Excel清单文件（.xlsx）">
                <Upload
                  accept=".xlsx,.xls"
                  maxCount={1}
                  fileList={bulkExcelFile ? [{ uid: 'excel', name: bulkExcelFile.name, status: 'done' }] : []}
                  beforeUpload={(f) => { setBulkExcelFile(f); return false; }}
                  onRemove={() => setBulkExcelFile(null)}
                >
                  <Button icon={<UploadOutlined />} block disabled={bulkImporting}>选择Excel文件</Button>
                </Upload>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title={`待导入文件文件夹${bulkFolderFiles.length > 0 ? `（${bulkFolderFiles.length}个文件）` : ''}`}>
                <input
                  type="file"
                  // @ts-ignore
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  style={{ display: 'none' }}
                  ref={(input) => { if (input) (window as any)._bulkFolderInput = input; }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      const folderPath = (files[0] as any).webkitRelativePath || '';
                      const folderName = folderPath.split('/')[0] || '已选择文件夹';
                      setBulkFolderName(folderName);
                      setBulkFolderFiles(files);
                    }
                    e.target.value = '';
                  }}
                />
                <Button
                  icon={<UploadOutlined />}
                  block
                  disabled={bulkImporting}
                  onClick={() => { (window as any)._bulkFolderInput?.click(); }}
                >
                  {bulkFolderName ? `已选择: ${bulkFolderName}` : '选择文件夹'}
                </Button>
              </Card>
            </Col>
          </Row>
          {bulkImporting && bulkUploadProgress.total > 0 && (
            <Card size="small">
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                正在上传: {bulkUploadProgress.current}/{bulkUploadProgress.total} 文件 ({bulkUploadProgress.percent}%)
              </div>
              <Progress percent={bulkUploadProgress.percent} status="active" />
            </Card>
          )}
          {bulkImportResult && (
            <Card size="small" title={`导入结果（共${bulkImportResult.total}条物料，成功${bulkImportResult.success}条，失败${bulkImportResult.fail}条，共导入${bulkImportResult.imported_files || 0}个文件）`} extra={(
              <Space>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => {
                  const details = bulkImportResult.details || [];
                  // 按导入模板格式输出所有物料详细信息，并增加错误原因列
                  const wsData = [
                    ['序号','新增日期','类别','物料品号','物料品名','物料规格','替代型号','品牌','选型负责人','采购','CE认证报告','DOC自我声明','英文说明书','测试报告','是否存档','是否合规','南德','欧测','状态','备注','导入结果','错误原因'],
                    ...details.map((r: any) => [
                      r.row,
                      r.data?.new_date || '',
                      r.data?.category || '',
                      r.data?.material || '',
                      r.data?.material_name || '',
                      r.data?.spec || '',
                      r.data?.alternative || '',
                      r.data?.brand || '',
                      r.data?.selector || '',
                      r.data?.purchaser || '',
                      r.data?.ce_report || '',
                      r.data?.doc || '',
                      r.data?.manual || '',
                      r.data?.test_report || '',
                      r.data?.archive_status || '',
                      r.data?.compliance || '',
                      r.data?.nande || '',
                      r.data?.ouce || '',
                      r.data?.status || '',
                      r.data?.remark || '',
                      r.success ? '成功' : '失败',
                      r.success ? (r.data?.files?.length ? `成功导入${r.data.files.length}个文件` : '成功') : (r.message || '')
                    ])
                  ];
                  const ws = XLSX.utils.aoa_to_sheet(wsData);
                  ws['!cols'] = [
                    {wch:6}, {wch:12}, {wch:8}, {wch:16}, {wch:28}, {wch:24}, {wch:18}, {wch:10},
                    {wch:12}, {wch:10}, {wch:28}, {wch:28}, {wch:28}, {wch:28}, {wch:10}, {wch:10},
                    {wch:8}, {wch:8}, {wch:8}, {wch:24}, {wch:10}, {wch:60}
                  ];
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, '导入物料清单');
                  XLSX.writeFile(wb, `CE物料文档导入清单_${new Date().toISOString().slice(0, 10)}.xlsx`);
                }}>按模板导出全部</Button>
                {bulkImportResult.fail > 0 && (
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => {
                    const failed = (bulkImportResult.details || []).filter((r: any) => !r.success);
                    const wsData = [
                      ['序号','新增日期','类别','物料品号','物料品名','物料规格','替代型号','品牌','选型负责人','采购','CE认证报告','DOC自我声明','英文说明书','测试报告','是否存档','是否合规','南德','欧测','状态','备注','错误原因'],
                      ...failed.map((r: any) => [
                        r.row,
                        r.data?.new_date || '',
                        r.data?.category || '',
                        r.data?.material || '',
                        r.data?.material_name || '',
                        r.data?.spec || '',
                        r.data?.alternative || '',
                        r.data?.brand || '',
                        r.data?.selector || '',
                        r.data?.purchaser || '',
                        r.data?.ce_report || '',
                        r.data?.doc || '',
                        r.data?.manual || '',
                        r.data?.test_report || '',
                        r.data?.archive_status || '',
                        r.data?.compliance || '',
                        r.data?.nande || '',
                        r.data?.ouce || '',
                        r.data?.status || '',
                        r.data?.remark || '',
                        r.message || ''
                      ])
                    ];
                    const ws = XLSX.utils.aoa_to_sheet(wsData);
                    ws['!cols'] = [
                      {wch:6}, {wch:12}, {wch:8}, {wch:16}, {wch:28}, {wch:24}, {wch:18}, {wch:10},
                      {wch:12}, {wch:10}, {wch:28}, {wch:28}, {wch:28}, {wch:28}, {wch:10}, {wch:10},
                      {wch:8}, {wch:8}, {wch:8}, {wch:24}, {wch:60}
                    ];
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, '导入失败清单');
                    XLSX.writeFile(wb, `CE物料文档导入失败清单_${new Date().toISOString().slice(0, 10)}.xlsx`);
                  }}>导出失败清单</Button>
                )}
              </Space>
            )}>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <Table
                  size="small"
                  dataSource={bulkImportResult.details || []}
                  rowKey={(r: any) => r.row}
                  pagination={false}
                  columns={[
                    { title: '行号', dataIndex: 'row', width: 60 },
                    { title: '状态', dataIndex: 'success', width: 70, render: (v: boolean) => v ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag> },
                    { title: '物料品号', dataIndex: ['data', 'material'], width: 140, render: (_: any, r: any) => r.data?.material || '-' },
                    { title: '物料名称', dataIndex: ['data', 'material_name'], width: 160, render: (_: any, r: any) => r.data?.material_name || '-' },
                    { title: '物料规格', dataIndex: ['data', 'spec'], width: 160, render: (_: any, r: any) => r.data?.spec || '-' },
                    { title: '导入文件数', width: 90, render: (_: any, r: any) => r.success ? (r.data?.files?.length || 0) + '个' : '-' },
                    { title: '错误原因/说明', dataIndex: 'message', ellipsis: true, render: (v: string, r: any) => r.success ? v : <span style={{ color: '#ff4d4f' }}>{v || '导入失败'}</span> }
                  ]}
                />
              </div>
            </Card>
          )}
        </Space>
      </Modal>

      <Drawer
        title="物料存档详情"
        width={960}
        open={drawerVisible}
        onClose={() => { setDrawerVisible(false); setSelectedArchiveIds([]); }}
        extra={
          <Space>
            {selectedArchiveIds.length > 0 && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={batchSubmitting}
                onClick={handleBatchSubmit}
              >
                批量提交审批 ({selectedArchiveIds.length})
              </Button>
            )}
            <Button type="primary" icon={<UploadOutlined />} onClick={handleOpenUploadModal}>
              上传存档
            </Button>
          </Space>
        }
        destroyOnHidden
      >
        {currentMaterial && (
          <div>
            <Descriptions
              title="物料信息"
              bordered
              size="small"
              column={3}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="物料品号">{currentMaterial.part_code || '-'}</Descriptions.Item>
              <Descriptions.Item label="物料品名" span={2}>{currentMaterial.part_name}</Descriptions.Item>
              <Descriptions.Item label="规格">{currentMaterial.spec || '-'}</Descriptions.Item>
              <Descriptions.Item label="品牌">{currentMaterial.brand || '-'}</Descriptions.Item>
              <Descriptions.Item label="类别">{currentMaterial.category || '-'}</Descriptions.Item>
              <Descriptions.Item label="存档状态">
                <StatusTag status={currentMaterial.archive_status_manual} map={ARCHIVE_STATUS_MANUAL_MAP} defaultLabel="未存档" />
              </Descriptions.Item>
              <Descriptions.Item label="南德">
                <StatusTag status={currentMaterial.nande_status} map={NANDE_STATUS_MAP} />
              </Descriptions.Item>
              <Descriptions.Item label="欧测">
                <StatusTag status={currentMaterial.ouce_status} map={OUCE_STATUS_MAP} />
              </Descriptions.Item>
              <Descriptions.Item label="合规状态">
                <StatusTag status={currentMaterial.compliance_status} map={COMPLIANCE_STATUS_MAP} defaultLabel="待确认" />
              </Descriptions.Item>
              {(currentMaterial.alternative_model || currentMaterial.alternative_suggestion) && (
                <Descriptions.Item label="替代品号/规格" span={3}>
                  {currentMaterial.alternative_model || currentMaterial.alternative_suggestion}
                </Descriptions.Item>
              )}
            </Descriptions>

            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>存档记录列表</h4>
              {selectableArchives.length > 0 && (
                <Checkbox
                  indeterminate={selectedArchiveIds.length > 0 && selectedArchiveIds.length < selectableArchives.length}
                  checked={selectedArchiveIds.length === selectableArchives.length}
                  onChange={(e) => {
                    setSelectedArchiveIds(e.target.checked ? selectableArchives.map(a => a.id) : []);
                  }}
                >
                  全选可提交项 ({selectableArchives.length})
                </Checkbox>
              )}
            </div>
            <ResizableTable
              tableKey="ce_archives"
              columns={archiveColumnsRaw}
              dataSource={materialArchives}
              rowKey="id"
              loading={drawerLoading}
              size="small"
              pagination={false}
              scroll={{ x: 1100 }}
              excludeKeys={['select']}
            />
          </div>
        )}
      </Drawer>

      <Modal title={
          <div
            ref={uploadModalTitleRef}
            onMouseDown={handleDragStart}
            style={{ cursor: 'move', userSelect: 'none' }}
          >
            {changingArchive ? '变更上传新版本' : '上传存档'}
          </div>
        } open={uploadModalVisible} onOk={handleUploadArchive} onCancel={() => { setUploadModalVisible(false); setUploadFile(null); setSelectedBindArchiveId(null); setChangingArchive(null); resetDragOffset(); }} afterOpenChange={handleUploadModalAfterOpen} confirmLoading={uploading} destroyOnHidden
         centered={false} style={{ top: 80, left: 60, margin: 0, transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, transition: 'none' }} styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflow: 'auto' } }} okText={
          changingArchive
            ? (uploadMode === 'bind' ? '确认变更绑定' : '提交变更')
            : (uploadMode === 'bind' ? '确认绑定' : '确定上传')
        } className="modal-lg">
        <Form form={archiveForm} layout="vertical" preserve={false}>
        {changingArchive && (
          <Alert
            message="变更上传"
            description={`正在变更「${changingArchive.type_name || ''}」当前版本 ${changingArchive.version_no || '1.0'}（${changingArchive.archive_code || changingArchive.original_name || ''}）。上传或绑定的新版本将提交审批，审批通过后旧版本将自动被替换。`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Tabs
          activeKey={uploadMode}
          onChange={(k) => {
            setUploadMode(k as 'upload' | 'bind');
            setSelectedBindArchiveId(null);
          }}
          destroyOnHidden
          items={[
            {
              key: 'upload',
              label: <span><UploadOutlined /> {changingArchive ? '上传新文件' : '上传新文件'}</span>,
              children: (
                <>
                  <Form.Item
                    name="doc_type_id"
                    label="文档类型"
                    rules={changingArchive ? [] : [{ required: true, message: '请选择文档类型' }]}
                  >
                    <Select
                      placeholder={changingArchive ? '自动继承原文档类型' : '请选择文档类型'}
                      disabled={!!changingArchive}
                      allowClear={!changingArchive}
                      onChange={handleDocTypeChangeForVersion}
                    >
                      {docTypes.filter(d => d.is_enabled === 1).map(dt => (
                        <Select.Option key={dt.id} value={dt.id}>{dt.type_name}（{dt.code_prefix}）</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="cert_no" label="证书号">
                        <Input placeholder="请输入证书号" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="version_no" label={changingArchive ? '新版本号' : '版本号'} rules={[{ required: true, message: '请输入版本号' }]}>
                        <Input placeholder="请输入版本号" />
                      </Form.Item>
                    </Col>
                  </Row>
                  {changingArchive && (
                    <Form.Item name="change_remark" label="变更说明" rules={[{ required: true, message: '请填写变更说明' }]}>
                      <TextArea rows={2} placeholder="请说明变更原因，如：证书到期换发、版本更新、错误更正等" />
                    </Form.Item>
                  )}
                  <Form.Item name="remarks" label="备注">
                    <TextArea rows={2} placeholder="请输入备注" />
                  </Form.Item>
                  <Form.Item label={changingArchive ? '选择新版本文件' : '选择文件'} required>
                    <Upload.Dragger {...archiveUploadProps}>
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                      <p className="ant-upload-hint">
                        支持 PDF、Word、Excel、图片、压缩包等格式，单个文件
                      </p>
                    </Upload.Dragger>
                    {uploadFile && (
                      <div style={{ marginTop: 8, color: '#52c41a' }}>
                        已选择：{uploadFile.name}（{(uploadFile.size / 1024).toFixed(1)} KB）
                      </div>
                    )}
                  </Form.Item>
                </>
              )
            },
            {
              key: 'bind',
              label: <span><LinkOutlined /> 绑定已有文件</span>,
              children: (
                <div>
                  <Alert
                    message={changingArchive ? '变更绑定已有文件' : '绑定已有文件'}
                    description={changingArchive
                      ? '选择其他物料已经上传审批通过的CE证书/说明书等文件作为新版本，关联到当前物料进行变更替换，无需重复上传。审批通过后旧版本将自动被替换。'
                      : '选择其他物料已经上传审批通过的CE证书/说明书等文件，直接关联到当前物料，无需重复上传。多个物料共用同一物理文件。'}
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                  />
                  <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                    <Select
                      placeholder="文档类型（可选）"
                      allowClear
                      style={{ width: 200 }}
                      value={bindSearchDocType}
                      onChange={(v) => setBindSearchDocType(v)}
                    >
                      {docTypes.filter(d => d.is_enabled === 1).map(dt => (
                        <Select.Option key={dt.id} value={dt.id}>{dt.type_name}</Select.Option>
                      ))}
                    </Select>
                    <Input
                      placeholder="搜索文件名/证书号/品号/品名..."
                      value={bindSearchKeyword}
                      onChange={(e) => setBindSearchKeyword(e.target.value)}
                      onPressEnter={handleBindSearch}
                      style={{ width: 'calc(100% - 300px)' }}
                    />
                    <Button type="primary" icon={<SearchOutlined />} onClick={handleBindSearch} loading={bindSearchLoading}>搜索</Button>
                  </Space.Compact>
                  <div
                    onDragOver={handleBindDragOver}
                    onDragLeave={handleBindDragLeave}
                    onDrop={handleBindDrop}
                    style={{
                      border: `2px dashed ${bindDragOver ? '#1677ff' : (selectedBindArchiveId ? '#52c41a' : '#d9d9d9')}`,
                      borderRadius: 8,
                      padding: selectedBindArchiveId ? '12px 16px' : '20px',
                      textAlign: 'center',
                      marginBottom: 12,
                      backgroundColor: bindDragOver ? 'rgba(22,119,255,0.06)' : (selectedBindArchiveId ? 'rgba(82,196,26,0.04)' : '#fafafa'),
                      transition: 'all 0.3s',
                      cursor: 'copy'
                    }}
                  >
                    {selectedBindArchiveId ? (() => {
                      const sel = bindSearchResults.find(r => r.id === selectedBindArchiveId);
                      if (!sel) return <div style={{ color: '#999' }}>拖拽下方文件行到此处选择绑定</div>;
                      return (
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space>
                              <FileTextOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                              <span style={{ fontWeight: 600 }}>{sel.original_name}</span>
                              <Tag color="blue">{sel.type_name}</Tag>
                              {sel.cert_no && <Tag>证书: {sel.cert_no}</Tag>}
                              <Tag color="green">V{sel.version_no || '1.0'}</Tag>
                            </Space>
                            <Button size="small" type="text" danger icon={<CloseCircleOutlined />} onClick={(e) => { e.stopPropagation(); setSelectedBindArchiveId(null); }}>清除选择</Button>
                          </div>
                          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                            所属物料：{sel.source_part_code || ''} {sel.source_part_name || ''} {sel.source_brand ? `(${sel.source_brand})` : ''}
                          </div>
                        </div>
                      );
                    })() : (
                      <>
                        <p style={{ margin: 0, fontSize: 24, color: bindDragOver ? '#1677ff' : '#999' }}>
                          <LinkOutlined />
                        </p>
                        <p style={{ margin: '4px 0 0', color: bindDragOver ? '#1677ff' : '#666' }}>
                          {bindDragOver ? '释放鼠标选择此文件' : '拖拽下方文件行到此处，或点击单选按钮选择'}
                        </p>
                      </>
                    )}
                  </div>
                  <ResizableTable
                    tableKey="ce_bind_search"
                    size="small"
                    loading={bindSearchLoading}
                    dataSource={bindSearchResults}
                    rowKey="id"
                    pagination={{
                      current: bindSearchPage,
                      total: bindSearchTotal,
                      pageSize: 8,
                      size: 'small',
                      onChange: (p) => fetchBindArchives(p)
                    }}
                    rowSelection={{
                      type: 'radio',
                      selectedRowKeys: selectedBindArchiveId ? [selectedBindArchiveId] : [],
                      onChange: (keys) => {
                        const id = keys[0] as number | undefined;
                        if (id) {
                          const rec = bindSearchResults.find(r => r.id === id);
                          if (rec) selectBindArchive(rec);
                        } else {
                          setSelectedBindArchiveId(null);
                        }
                      }
                    }}
                    onRow={(record) => ({
                      draggable: true,
                      onDragStart: (e) => handleBindRowDragStart(e, record),
                      style: { cursor: 'grab' }
                    })}
                    columns={[
                      {
                        title: '',
                        key: 'drag_handle',
                        width: 32,
                        render: () => <MenuOutlined style={{ color: '#bbb', fontSize: 12, cursor: 'grab' }} />
                      },
                      { title: '文档类型', dataIndex: 'type_name', key: 'type_name', width: 90 },
                      { title: '文件名', dataIndex: 'original_name', key: 'original_name', width: 160, ellipsis: true },
                      { title: '编码', dataIndex: 'archive_code', key: 'archive_code', width: 110 },
                      { title: '证书号', dataIndex: 'cert_no', key: 'cert_no', width: 110 },
                      { title: '版本', dataIndex: 'version_no', key: 'version_no', width: 50 },
                      { title: '所属物料', key: 'source_material', width: 160,
                        render: (_: any, r: any) => `${r.source_part_code || ''} ${r.source_part_name || ''} ${r.source_brand ? '(' + r.source_brand + ')' : ''}`.trim() || '-'
                      }
                    ]}
                    scroll={{ x: 720 }}
                  />
                  <Row gutter={16} style={{ marginTop: 12 }}>
                    <Col span={12}>
                      <Form.Item name="cert_no" label="证书号（可覆盖）">
                        <Input placeholder="请输入证书号" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="version_no" label={changingArchive ? '新版本号（可覆盖）' : '版本号（可覆盖）'} rules={[{ required: true, message: '请输入版本号' }]}>
                        <Input placeholder="请输入版本号" />
                      </Form.Item>
                    </Col>
                  </Row>
                  {changingArchive && (
                    <Form.Item name="change_remark" label="变更说明" rules={[{ required: true, message: '请填写变更说明' }]}>
                      <TextArea rows={2} placeholder="请说明变更原因，如：证书到期换发、版本更新、错误更正等" />
                    </Form.Item>
                  )}
                  <Form.Item name="remarks" label="备注">
                    <TextArea rows={2} placeholder="请输入备注" />
                  </Form.Item>
                </div>
              )
            }
          ]}
        />
        </Form>
      </Modal>

      <Modal title={editingDocType ? '编辑文档类型' : '新增文档类型'} open={docTypeModalVisible} onOk={handleDocTypeModalOk} onCancel={() => setDocTypeModalVisible(false)} afterOpenChange={handleDocTypeModalAfterOpen} destroyOnHidden
       className="modal-md">
        <Form form={docTypeForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type_code"
                label="编码"
                rules={[{ required: true, message: '请输入编码' }]}
              >
                <Input placeholder="请输入编码" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type_name"
                label="名称"
                rules={[{ required: true, message: '请输入名称' }]}
              >
                <Input placeholder="请输入名称" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="请输入描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code_prefix"
                label="编码前缀"
                rules={[{ required: true, message: '请输入编码前缀' }]}
              >
                <Input placeholder="如 CE" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort_order" label="排序">
                <Input type="number" placeholder="排序号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="seq_length" label="序列长度" initialValue={6}>
                <Input type="number" min={1} max={10} placeholder="默认6" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="current_seq" label="当前序列号" initialValue={1}>
                <Input type="number" min={1} placeholder="默认1" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="is_enabled" label="启用状态" valuePropName="checked" initialValue={true}>
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal title={<span><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />CE存档审批</span>} open={approveModalVisible} onCancel={() => { setApproveModalVisible(false); setApprovingArchive(null); approveForm.resetFields(); }} footer={[
          <Button key="cancel" onClick={() => { setApproveModalVisible(false); setApprovingArchive(null); }}>
            取消
          </Button>,
          <Button key="reject" danger loading={approveLoading} onClick={() => handleDirectApprove('reject')}>
            驳回
          </Button>,
          <Button key="approve" type="primary" loading={approveLoading} onClick={() => handleDirectApprove('approve')}>
            审批通过
          </Button>
        ]} destroyOnHidden
       className="modal-md">
        {approvingArchive && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
            <div><strong>{approvingArchive.type_name}</strong> · {approvingArchive.original_name}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              物料：{approvingArchive.part_code} {approvingArchive.part_name} {approvingArchive.brand ? `(${approvingArchive.brand})` : ''}
              {approvingArchive.replaces_archive_id && <Tag color="orange" style={{ marginLeft: 8 }}>变更版本</Tag>}
            </div>
          </div>
        )}
        <Form form={approveForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="nande_status" label="南德认证状态" initialValue="approved">
                <Select options={NANDE_STATUS_OPTIONS.filter(o => o.value !== 'na')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ouce_status" label="欧测认证状态" initialValue="approved">
                <Select options={OUCE_STATUS_OPTIONS.filter(o => o.value !== 'na')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="archive_status_manual" label="存档状态" initialValue="archived">
                <Select options={ARCHIVE_STATUS_MANUAL_OPTIONS.filter(o => o.value !== 'not_archived')} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="alternative_suggestion" label="替代品号/规格建议">
            <Input placeholder="如物料不合规需替换，请填写推荐替代品号或规格" />
          </Form.Item>
          <Form.Item
            name="approval_remark"
            label="审批备注"
          >
            <Input.TextArea rows={3} placeholder="审批通过时填写备注说明（选填），驳回时请填写驳回原因（必填）" />
          </Form.Item>
          <Form.Item
            name="reject_reason"
            label="驳回原因"
            noStyle
          >
            <Input type="hidden" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CEMaterialPage;
