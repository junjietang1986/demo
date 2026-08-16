import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  response => {
    const res = response.data;
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 0) {
        return res.data !== undefined ? res.data : res;
      } else {
        return Promise.reject(new Error(res.message || '请求失败'));
      }
    }
    return res;
  },
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;

export const authApi = {
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  feishuLogin: (code: string) => api.post('/auth/feishu', { code })
};

export const userApi = {
  list: (params?: any) => api.get('/users', { params }),
  all: () => api.get('/users/all'),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
  resetPassword: (id: number, password: string) => api.post(`/users/${id}/reset-password`, { password }),
  changePassword: (data: { oldPassword: string; newPassword: string }) => api.post('/users/change-password', data),
  departmentTree: () => api.get('/users/department-tree'),
  rolesList: () => api.get('/users/roles/list'),
  updateRole: (id: number, role: string) => api.put(`/users/${id}/role`, { role }),
  batchUpdateRole: (userIds: number[], role: string) => api.post('/users/batch-role', { userIds, role })
};

export const projectApi = {
  list: (params?: any) => api.get('/projects', { params }),
  get: (id: number) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: number, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  addWorkstation: (projectId: number, data: any) => api.post(`/projects/${projectId}/workstations`, data),
  updateWorkstation: (id: number, data: any) => api.put(`/projects/workstations/${id}`, data),
  deleteWorkstation: (id: number) => api.delete(`/projects/workstations/${id}`),
  getApqpPhases: (id: number) => api.get(`/projects/${id}/apqp/phases`),
  getGateByPhase: (id: number, phaseNo: number) => api.get(`/projects/${id}/apqp/gates/by-phase/${phaseNo}`),
  initGateDraft: (id: number, phaseNo: number) => api.post(`/projects/${id}/apqp/gates/init-draft`, { phase_no: phaseNo }),
  submitGate: (id: number, data: any) => api.post(`/projects/${id}/apqp/gates`, data),
  listGateAttachments: (gateId: number, checkitemId: number) => api.get(`/projects/gates/${gateId}/checkitems/${checkitemId}/attachments`),
  uploadGateAttachment: (gateId: number, checkitemId: number, formData: FormData) =>
    api.post(`/projects/gates/${gateId}/checkitems/${checkitemId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteGateAttachment: (attachId: number) => api.delete(`/projects/gates/attachments/${attachId}`),
  getBomSummary: (id: number) => api.get(`/projects/${id}/bom-summary`),
  listRisks: (id: number) => api.get(`/projects/${id}/risks`),
  addRisk: (id: number, data: any) => api.post(`/projects/${id}/risks`, data),
  updateRisk: (riskId: number, data: any) => api.put(`/projects/risks/${riskId}`, data),
  deleteRisk: (riskId: number) => api.delete(`/projects/risks/${riskId}`),
  listVocAttachments: (projectId: number) => api.get(`/projects/${projectId}/voc-attachments`),
  uploadVocAttachment: (projectId: number, formData: FormData) =>
    api.post(`/projects/${projectId}/voc-attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteVocAttachment: (attachId: number) => api.delete(`/projects/voc-attachments/${attachId}`)
};

export const customerApi = {
  list: (params?: any) => api.get('/customers', { params }),
  get: (id: number) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: number, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: number) => api.delete(`/customers/${id}`)
};

export const planApi = {
  list: (params?: any) => api.get('/plans', { params }),
  get: (id: number) => api.get(`/plans/${id}`),
  create: (data: any) => api.post('/plans', data),
  update: (id: number, data: any) => api.put(`/plans/${id}`, data),
  delete: (id: number) => api.delete(`/plans/${id}`),
  submit: (id: number) => api.post(`/plans/${id}/submit`),
  saveBatch: (id: number, tasks: any[]) => api.post(`/plans/${id}/save`, { tasks }),
  addTask: (planId: number, data: any) => api.post(`/plans/${planId}/tasks`, data),
  updateTask: (taskId: number, data: any) => api.put(`/plans/tasks/${taskId}`, data),
  deleteTask: (taskId: number) => api.delete(`/plans/tasks/${taskId}`),
  updateTaskProgress: (taskId: number, data: any) => api.put(`/plans/tasks/${taskId}/progress`, data),
  gantt: (planId: number) => api.get(`/plans/${planId}/gantt`),
  export: (planId: number, format: string, viewType?: string) => api.get(`/plans/${planId}/export`, { params: { format, view_type: viewType }, responseType: 'blob' })
};

export const qmsApi = {
  oplList: (params?: any) => api.get('/qms/opl', { params }),
  oplCreate: (data: any) => api.post('/qms/opl', data),
  oplUpdate: (id: number, data: any) => api.put(`/qms/opl/${id}`, data),
  oplDelete: (id: number) => api.delete(`/qms/opl/${id}`),
  anomalyList: (params?: any) => api.get('/qms/anomaly', { params }),
  anomalyCreate: (data: any) => api.post('/qms/anomaly', data),
  anomalyUpdate: (id: number, data: any) => api.put(`/qms/anomaly/${id}`, data),
  anomalyDelete: (id: number) => api.delete(`/qms/anomaly/${id}`)
};

export const acceptanceApi = {
  configs: (params?: any) => api.get('/acceptance/configs', { params }),
  createConfig: (data: any) => api.post('/acceptance/configs', data),
  updateConfig: (id: number, data: any) => api.put(`/acceptance/configs/${id}`, data),
  deleteConfig: (id: number) => api.delete(`/acceptance/configs/${id}`),
  forms: (params?: any) => api.get('/acceptance/forms', { params }),
  getForm: (id: number) => api.get(`/acceptance/forms/${id}`),
  createForm: (data: any) => api.post('/acceptance/forms', data),
  updateForm: (id: number, data: any) => api.put(`/acceptance/forms/${id}`, data),
  submitForm: (id: number) => api.post(`/acceptance/forms/${id}/submit`),
  deleteForm: (id: number) => api.delete(`/acceptance/forms/${id}`),
  generateForm: (projectId: number) => api.post(`/acceptance/generate/${projectId}`),
  plans: (params?: any) => api.get('/acceptance/plans', { params }),
  getPlan: (id: number) => api.get(`/acceptance/plans/${id}`),
  createPlan: (data: any) => api.post('/acceptance/plans', data),
  updatePlan: (id: number, data: any) => api.put(`/acceptance/plans/${id}`, data),
  submitPlan: (id: number) => api.post(`/acceptance/plans/${id}/submit`),
  deletePlan: (id: number) => api.delete(`/acceptance/plans/${id}`),
  updatePlanItem: (itemId: number, data: any) => api.put(`/acceptance/plans/items/${itemId}`, data),
  exportForm: (id: number, format: string) => api.get(`/acceptance/forms/${id}/export`, { params: { format }, responseType: 'blob' }),
  exportPlan: (id: number, format: string) => api.get(`/acceptance/plans/${id}/export`, { params: { format }, responseType: 'blob' }),
  uploadAttachment: (formId: number, formData: FormData) => api.post(`/acceptance/forms/${formId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
};

export const approvalApi = {
  flows: (params?: any) => api.get('/approval/flows', { params }),
  createFlow: (data: any) => api.post('/approval/flows', data),
  updateFlow: (id: number, data: any) => api.put(`/approval/flows/${id}`, data),
  deleteFlow: (id: number) => api.delete(`/approval/flows/${id}`),
  records: (params?: any) => api.get('/approval/records', { params }),
  getRecord: (id: number) => api.get(`/approval/records/${id}`),
  myPending: () => api.get('/approval/my-pending'),
  approve: (id: number, data: any) => api.post(`/approval/records/${id}/approve`, data),
  reject: (id: number, data: any) => api.post(`/approval/records/${id}/reject`, data)
};

export const improvementApi = {
  list: (params?: any) => api.get('/improvement', { params }),
  get: (id: number) => api.get(`/improvement/${id}`),
  create: (data: any) => api.post('/improvement', data),
  update: (id: number, data: any) => api.put(`/improvement/${id}`, data),
  updateStep: (id: number, data: any) => api.put(`/improvement/${id}/step`, data),
  delete: (id: number) => api.delete(`/improvement/${id}`),
  fromOpl: (oplId: number) => api.post(`/improvement/from-opl/${oplId}`),
  fromAnomaly: (anomalyId: number) => api.post(`/improvement/from-anomaly/${anomalyId}`)
};

export const reportApi = {
  oplReport: (params: any) => api.get('/reports/opl', { params }),
  anomalyReport: (params: any) => api.get('/reports/anomaly', { params }),
  projectReport: (projectId: number) => api.get(`/reports/project/${projectId}`),
  exportOpl: (params: any, format: string) => api.get('/reports/opl/export', { params: { ...params, format }, responseType: 'blob' }),
  exportAnomaly: (params: any, format: string) => api.get('/reports/anomaly/export', { params: { ...params, format }, responseType: 'blob' })
};

export const impexpApi = {
  downloadTemplate: (module: string, params?: Record<string, any>) => {
    const token = localStorage.getItem('token');
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetch(`/api/impexp/template/${module}${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (!res.ok) throw new Error('下载模板失败');
      return res.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${module}_模板.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
  exportData: (module: string, params?: Record<string, any>) => {
    const token = localStorage.getItem('token');
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return fetch(`/api/impexp/export/${module}${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (!res.ok) throw new Error('导出失败');
      return res.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${module}_导出.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
  previewImport: (module: string, file: File, params?: Record<string, any>) => {
    const formData = new FormData();
    formData.append('file', file);
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return api.post(`/impexp/preview/${module}${qs}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }) as Promise<any>;
  },
  confirmImport: (batchId: number) => api.post(`/impexp/confirm/${batchId}`) as Promise<any>,
  getVersions: (module: string, recordId: number) => api.get(`/impexp/versions/${module}/${recordId}`) as Promise<any>,
  getBatch: (batchId: number) => api.get(`/impexp/batch/${batchId}`) as Promise<any>
};

export const feishuApi = {
  getStatus: () => api.get('/feishu/status') as Promise<any>,
  saveConfig: (data: { app_id?: string; app_secret?: string; auto_sync_interval?: number }) => api.post('/feishu/config', data) as Promise<any>,
  getDepartments: () => api.get('/feishu/departments') as Promise<any>,
  getDeptUsers: (deptId: string) => api.get(`/feishu/departments/${deptId}/users`) as Promise<any>,
  getUsers: (params?: { keyword?: string }) => api.get('/feishu/users', { params }) as Promise<any>,
  searchUsers: (keyword: string) => api.get('/feishu/users/search', { params: { keyword } }) as Promise<any>,
  syncUsers: () => api.post('/feishu/sync-users') as Promise<any>
};

export const ceMaterialApi = {
  list: (params?: any) => api.get('/ce-materials', { params }),
  listAll: () => api.get('/ce-materials?pageSize=9999'),
  get: (id: number) => api.get(`/ce-materials/${id}`),
  getBatch: (id: number) => api.get(`/ce-materials/batches/${id}`),
  create: (data: any) => api.post('/ce-materials', data),
  update: (id: number, data: any) => api.put(`/ce-materials/${id}`, data),
  delete: (id: number) => api.delete(`/ce-materials/${id}`),
  getStats: () => api.get('/ce-materials/stats/summary'),
  getPendingArchives: () => api.get('/ce-materials/pending-archives/list'),
  directApproveArchive: (archiveId: number, data: any) => api.post(`/ce-materials/archives/${archiveId}/direct-approve`, data),
  importMaterials: (formData: FormData) => api.post('/ce-materials/import-materials', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getDocTypes: () => api.get('/ce-materials/doc-types'),
  createDocType: (data: any) => api.post('/ce-materials/doc-types', data),
  updateDocType: (id: number, data: any) => api.put(`/ce-materials/doc-types/${id}`, data),
  deleteDocType: (id: number) => api.delete(`/ce-materials/doc-types/${id}`),
  generateCode: (id: number) => api.get(`/ce-materials/doc-types/${id}/next-code`),
  importBom: (projectId: number, formData: FormData) => api.post(`/ce-materials/projects/${projectId}/import-bom`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getBomItems: (projectId: number, params?: any) => api.get(`/ce-materials/projects/${projectId}/bom-items`, { params }),
  matchBomItem: (itemId: number, ceMaterialId: number) => api.post(`/ce-materials/bom-items/${itemId}/match`, { ce_material_id: ceMaterialId }),
  addBomItemsToCe: (projectId: number, ids: number[]) => api.post(`/ce-materials/projects/${projectId}/bom-items/add-to-ce`, { ids }),
  getProjects: () => api.get('/projects?pageSize=999'),
  getWorkstations: (projectId: number) => api.get(`/ce-materials/projects/${projectId}/workstations`),
  uploadArchive: (materialId: number, formData: FormData) => api.post(`/ce-materials/${materialId}/archives`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  searchArchivesForBind: (params: any) => api.get('/ce-materials/archives/search', { params }),
  bindArchive: (materialId: number, data: any) => api.post(`/ce-materials/${materialId}/archives/bind`, data),
  changeArchive: (materialId: number, archiveId: number, formData: FormData) => api.post(`/ce-materials/${materialId}/archives/${archiveId}/change`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  changeBindArchive: (materialId: number, archiveId: number, data: any) => api.post(`/ce-materials/${materialId}/archives/${archiveId}/change-bind`, data),
  deleteArchive: (archiveId: number) => api.delete(`/ce-materials/archives/${archiveId}`),
  submitArchive: (archiveId: number) => api.post(`/ce-materials/archives/${archiveId}/submit`),
  batchSubmit: (materialId: number, data: any) => api.post(`/ce-materials/${materialId}/batch-submit`, data),
  getArchiveDownloadUrl: (id: number) => `/api/ce-materials/archives/${id}/download`,
  getArchivePreviewUrl: (id: number) => `/api/ce-materials/archives/${id}/preview`,
  downloadArchive: async (id: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/ce-materials/archives/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    let fileName = `archive_${id}`;
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) fileName = decodeURIComponent(m[1]);
    else { const m2 = /filename="([^"]+)"/i.exec(cd); if (m2) fileName = m2[1]; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  previewArchive: async (id: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/ce-materials/archives/${id}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error('预览失败');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const ct = res.headers.get('Content-Type') || '';
    let fileName = `archive_${id}`;
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) fileName = decodeURIComponent(m[1]);
    const previewable = /pdf|image\/|text\/|svg/i.test(ct);
    if (!previewable) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      throw new Error('该文件类型浏览器暂不支持在线预览，已改为下载');
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  },
  downloadMaterialTemplate: () => {
    const token = localStorage.getItem('token');
    return fetch('/api/ce-materials/import-materials/template', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'CE物料清单导入模板.xlsx'; a.click(); URL.revokeObjectURL(url);
      });
  },
  downloadBomTemplate: (projectId: number) => {
    const token = localStorage.getItem('token');
    return fetch(`/api/ce-materials/projects/${projectId}/import-bom/template`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = 'CE项目BOM导入模板.xlsx'; a.click(); URL.revokeObjectURL(url);
      });
  },
  exportMaterials: async (params?: any, type?: string) => {
    const token = localStorage.getItem('token');
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      });
    }
    if (type) cleanParams.type = type;

    // 文档打包导出（大文件）使用隐藏iframe在后台下载
    if (type === 'doc') {
      cleanParams.token = token || '';
      const usp = new URLSearchParams(cleanParams);
      const url = `/api/ce-materials/export?${usp.toString()}`;
      // 使用唯一的隐藏iframe接收下载，保持当前页面不变，不打开新标签
      const iframeName = '__ce_material_export_' + Date.now();
      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;display:none;';
      document.body.appendChild(iframe);
      // 在iframe中触发下载
      const a = document.createElement('a');
      a.href = url;
      a.target = iframeName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 30秒后清理iframe（下载仍在后台进行）
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 30000);
      return;
    }

    // 物料清单导出（小文件）使用 fetch + blob
    const usp = new URLSearchParams(cleanParams);
    const qs = usp.toString() ? '?' + usp.toString() : '';
    const res = await fetch(`/api/ce-materials/export${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const defaultName = `CE物料清单_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const fileName = m ? decodeURIComponent(m[1]) : defaultName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  exportMaterialsSimple: async (params?: any) => {
    const token = localStorage.getItem('token');
    let qs = '';
    if (params) {
      const cleanParams: Record<string, string> = {};
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      });
      const usp = new URLSearchParams(cleanParams);
      qs = usp.toString() ? '?' + usp.toString() : '';
    }
    const res = await fetch(`/api/ce-materials/export-simple${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const fileName = m ? decodeURIComponent(m[1]) : `CE物料清单_${new Date().toISOString().slice(0,10)}.xlsx`;
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  downloadDocumentTemplate: async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/ce-materials/export', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('下载模板失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `CE物料文档导入模板_${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  exportBom: async (projectId: number, params?: any) => {
    const token = localStorage.getItem('token');
    let qs = '';
    if (params) {
      const cleanParams: Record<string, string> = {};
      Object.keys(params).forEach(k => {
        const v = params[k];
        if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
      });
      const usp = new URLSearchParams(cleanParams);
      qs = usp.toString() ? '?' + usp.toString() : '';
    }
    const res = await fetch(`/api/ce-materials/projects/${projectId}/export-bom${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const fileName = m ? decodeURIComponent(m[1]) : `CE-BOM_${new Date().toISOString().slice(0,10)}.xlsx`;
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  clearAll: () => api.delete('/ce-materials/clear-all'),
  getMaxVersion: (materialId: number, docTypeId: number) => api.get(`/ce-materials/${materialId}/max-version/${docTypeId}`),
  getChangeHistory: (materialId: number) => api.get(`/ce-materials/${materialId}/change-history`),
  // 分批上传模式 - 上传一批文件（Excel或存档文件）
  bulkImportArchivesUpload: async (batchId: string, excelFile: File | null, files: File[], onProgress?: (currentBatchPercent: number) => void) => {
    const token = localStorage.getItem('token');
    const BACKEND_BASE = (window as any).__BACKEND_BASE__ || 'http://localhost:3001';
    const formData = new FormData();
    formData.append('batchId', batchId);
    if (excelFile) formData.append('excel', excelFile);
    files.forEach(f => formData.append('files', f, (f as any).webkitRelativePath || f.name));
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BACKEND_BASE}/api/ce-materials/bulk-import-archives-upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (onProgress) {
        let lastPercent = -1;
        let lastTime = 0;
        xhr.upload.onprogress = (e) => {
          if (e.total > 0) {
            const percent = Math.round((e.loaded / e.total) * 100);
            const now = Date.now();
            if (percent !== lastPercent && now - lastTime >= 100) {
              lastPercent = percent;
              lastTime = now;
              onProgress(percent);
            }
          }
        };
      }
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (result.code === 0) resolve(result.data);
          else reject(new Error(result.message || '上传失败'));
        } catch { reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText.substring(0, 200)}`)); }
      };
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(formData);
    });
  },
  // 分批上传模式 - 取消上传
  bulkImportArchivesCancel: async (batchId: string) => {
    const token = localStorage.getItem('token');
    const BACKEND_BASE = (window as any).__BACKEND_BASE__ || 'http://localhost:3001';
    const params = new URLSearchParams();
    params.append('batchId', batchId);
    const res = await fetch(`${BACKEND_BASE}/api/ce-materials/bulk-import-archives-cancel`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    return res.json();
  },
  // 分批上传模式 - 处理已上传的所有文件
  bulkImportArchivesProcess: async (batchId: string) => {
    const token = localStorage.getItem('token');
    const BACKEND_BASE = (window as any).__BACKEND_BASE__ || 'http://localhost:3001';
    const params = new URLSearchParams();
    params.append('batchId', batchId);
    const res = await fetch(`${BACKEND_BASE}/api/ce-materials/bulk-import-archives-process`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const contentType = res.headers.get('content-type') || '';
    let result;
    if (contentType.includes('application/json')) {
      result = await res.json();
    } else {
      const text = await res.text();
      try { result = JSON.parse(text); } catch { result = { code: res.ok ? 0 : -1, message: text }; }
    }
    if (result && typeof result === 'object' && 'code' in result) {
      if (result.code === 0) return result.data !== undefined ? result.data : result;
      throw new Error(result.message || '处理失败');
    }
    if (!res.ok) throw new Error(result?.message || `HTTP ${res.status}`);
    return result;
  },
  getBulkImportArchivesTemplateUrl: () => '/api/ce-materials/bulk-import-archives/template',
  getBomInfo: (projectId: number, workstationId?: number | null) => api.get(`/ce-materials/projects/${projectId}/bom`, { params: { workstation_id: workstationId || undefined } }),
  clearBom: (projectId: number, workstationId?: number | null) => api.delete(`/ce-materials/projects/${projectId}/bom/clear`, { params: { workstation_id: workstationId || undefined } }),
  deleteBomItem: (itemId: number, reason?: string) => api.delete(`/ce-materials/bom-items/${itemId}`, { data: { reason } }),
  restoreBomItem: (itemId: number) => api.post(`/ce-materials/bom-items/${itemId}/restore`),
  submitBomApproval: (projectId: number, data: { workstation_id?: number | null; remarks?: string; change_reason?: string }) => api.post(`/ce-materials/projects/${projectId}/bom/submit`, data),
  getBomVersions: (projectId: number, workstationId?: number | null) => api.get(`/ce-materials/projects/${projectId}/bom/versions`, { params: { workstation_id: workstationId || undefined } }),
  getBomVersionDetail: (versionId: number) => api.get(`/ce-materials/bom/versions/${versionId}`),
  rollbackBomVersion: (versionId: number, reason?: string) => api.post(`/ce-materials/bom/versions/${versionId}/rollback`, { reason }),
  startBomChange: (projectId: number, data: { workstation_id?: number | null; change_reason?: string }) => api.post(`/ce-materials/projects/${projectId}/bom/change`, data),
  getDeletedBomItems: (projectId: number, workstationId?: number | null) => api.get(`/ce-materials/projects/${projectId}/bom/deleted-items`, { params: { workstation_id: workstationId || undefined } })
};

export const ceComplianceApi = {
  // 国际法规清单
  getRegulations: (params?: any) => api.get('/ce-compliance/regulations', { params }) as Promise<any>,
  getRegulation: (id: number) => api.get(`/ce-compliance/regulations/${id}`) as Promise<any>,
  createRegulation: (data: any) => api.post('/ce-compliance/regulations', data) as Promise<any>,
  updateRegulation: (id: number, data: any) => api.put(`/ce-compliance/regulations/${id}`, data) as Promise<any>,
  deleteRegulation: (id: number) => api.delete(`/ce-compliance/regulations/${id}`) as Promise<any>,
  checkRegulationUpdates: () => api.post('/ce-compliance/regulations/check-updates') as Promise<any>,
  getRegulationOptions: () => api.get('/ce-compliance/regulation-options') as Promise<any>,
  uploadRegulationAttachment: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/ce-compliance/regulations/${id}/attachment`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }) as Promise<any>;
  },
  deleteRegulationAttachment: (id: number) => api.delete(`/ce-compliance/regulations/${id}/attachment`) as Promise<any>,

  // 进出口管控清单
  getExportControls: (params?: any) => api.get('/ce-compliance/export-controls', { params }) as Promise<any>,
  getExportControl: (id: number) => api.get(`/ce-compliance/export-controls/${id}`) as Promise<any>,
  createExportControl: (data: any) => api.post('/ce-compliance/export-controls', data) as Promise<any>,
  updateExportControl: (id: number, data: any) => api.put(`/ce-compliance/export-controls/${id}`, data) as Promise<any>,
  deleteExportControl: (id: number) => api.delete(`/ce-compliance/export-controls/${id}`) as Promise<any>,
  checkControlUpdates: () => api.post('/ce-compliance/export-controls/check-updates') as Promise<any>,
  uploadControlAttachment: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/ce-compliance/export-controls/${id}/attachment`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }) as Promise<any>;
  },
  deleteControlAttachment: (id: number) => api.delete(`/ce-compliance/export-controls/${id}/attachment`) as Promise<any>,
  getControlOptions: () => api.get('/ce-compliance/control-options') as Promise<any>,
  checkBomCompliance: (items: any[]) => api.post('/ce-compliance/export-controls/check-bom', { items }) as Promise<any>,

  // 外部数据源配置
  getDataSources: (params?: any) => api.get('/ce-compliance/data-sources', { params }) as Promise<any>,
  getDataSource: (id: number) => api.get(`/ce-compliance/data-sources/${id}`) as Promise<any>,
  createDataSource: (data: any) => api.post('/ce-compliance/data-sources', data) as Promise<any>,
  updateDataSource: (id: number, data: any) => api.put(`/ce-compliance/data-sources/${id}`, data) as Promise<any>,
  deleteDataSource: (id: number) => api.delete(`/ce-compliance/data-sources/${id}`) as Promise<any>,
  toggleDataSource: (id: number) => api.post(`/ce-compliance/data-sources/${id}/toggle`) as Promise<any>,
  checkDataSource: (id: number) => api.post(`/ce-compliance/data-sources/${id}/check`) as Promise<any>,
  checkAllDataSources: () => api.post('/ce-compliance/data-sources/check-all') as Promise<any>,
  getUpdateLogs: (params?: any) => api.get('/ce-compliance/update-logs', { params }) as Promise<any>,
  getComplianceStatus: () => api.get('/ce-compliance/compliance-status') as Promise<any>
};

export const permissionApi = {
  getModules: () => api.get('/permissions/modules') as Promise<any>,
  getRoles: () => api.get('/permissions/roles') as Promise<any>,
  createRole: (data: { code: string; name: string; description?: string; dept_id?: string; dept_name?: string; sort_order?: number }) => api.post('/permissions/roles', data) as Promise<any>,
  updateRole: (code: string, data: any) => api.put(`/permissions/roles/${code}`, data) as Promise<any>,
  deleteRole: (code: string) => api.delete(`/permissions/roles/${code}`) as Promise<any>,
  syncFeishuRoles: () => api.post('/permissions/sync-feishu-roles') as Promise<any>,
  getAll: () => api.get('/permissions/all') as Promise<{ modules: any[]; roles: any[] }>,
  getMyPermissions: () => api.get('/permissions/my') as Promise<any>,
  saveRolePermissions: (role: string, permissions: any[]) => api.post(`/permissions/save/${role}`, { permissions }) as Promise<any>,
  downloadTemplate: () => {
    const token = localStorage.getItem('token');
    return fetch('/api/permissions/template', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (!res.ok) throw new Error('下载模板失败');
      return res.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '权限配置模板.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  },
  exportPermissions: () => {
    const token = localStorage.getItem('token');
    return fetch('/api/permissions/export', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (!res.ok) throw new Error('导出失败');
      return res.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `权限配置_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
  importPermissions: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/permissions/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }) as Promise<any>;
  }
};

export const planTemplateApi = {
  list: (params?: any) => api.get('/plan-templates', { params }),
  get: (id: number) => api.get(`/plan-templates/${id}`),
  create: (data: any) => api.post('/plan-templates', data),
  update: (id: number, data: any) => api.put(`/plan-templates/${id}`, data),
  delete: (id: number) => api.delete(`/plan-templates/${id}`),
  apply: (templateId: number, planId: number, data?: any) => api.post(`/plan-templates/${templateId}/apply/${planId}`, data || { replace: true }),
  saveFromPlan: (planId: number, data: any) => api.post(`/plan-templates/save-from-plan/${planId}`, data)
};

export const bomApi = {
  categories: () => api.get('/bom/categories'),
  listByProject: (projectId: number) => api.get(`/bom/project/${projectId}`),
  get: (id: number) => api.get(`/bom/${id}`),
  create: (data: any) => api.post('/bom', data),
  update: (id: number, data: any) => api.put(`/bom/${id}`, data),
  delete: (id: number) => api.delete(`/bom/${id}`),
  uploadAttachment: (itemId: number, formData: FormData) =>
    api.post(`/bom/${itemId}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment: (attachId: number) => api.delete(`/bom/attachments/${attachId}`),
  import: (file: File, projectId: number) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/bom/import?project_id=${projectId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};

export const qualityApi = {
  fmea: {
    listByProject: (projectId: number) => api.get(`/quality/fmea/project/${projectId}`),
    get: (id: number) => api.get(`/quality/fmea/${id}`),
    create: (data: any) => api.post('/quality/fmea', data),
    update: (id: number, data: any) => api.put(`/quality/fmea/${id}`, data),
    delete: (id: number) => api.delete(`/quality/fmea/${id}`)
  },
  dvpr: {
    listByProject: (projectId: number) => api.get(`/quality/dvpr/project/${projectId}`),
    get: (id: number) => api.get(`/quality/dvpr/${id}`),
    create: (data: any) => api.post('/quality/dvpr', data),
    update: (id: number, data: any) => api.put(`/quality/dvpr/${id}`, data),
    delete: (id: number) => api.delete(`/quality/dvpr/${id}`)
  },
  cp: {
    listByProject: (projectId: number) => api.get(`/quality/cp/project/${projectId}`),
    get: (id: number) => api.get(`/quality/cp/${id}`),
    create: (data: any) => api.post('/quality/cp', data),
    update: (id: number, data: any) => api.put(`/quality/cp/${id}`, data),
    delete: (id: number) => api.delete(`/quality/cp/${id}`)
  },
  eco: {
    listByProject: (projectId: number) => api.get(`/quality/eco/project/${projectId}`),
    get: (id: number) => api.get(`/quality/eco/${id}`),
    create: (data: any) => api.post('/quality/eco', data),
    update: (id: number, data: any) => api.put(`/quality/eco/${id}`, data),
    delete: (id: number) => api.delete(`/quality/eco/${id}`)
  },
  ppap: {
    listByProject: (projectId: number) => api.get(`/quality/ppap/project/${projectId}`),
    get: (id: number) => api.get(`/quality/ppap/${id}`),
    create: (data: any) => api.post('/quality/ppap', data),
    update: (id: number, data: any) => api.put(`/quality/ppap/${id}`, data),
    delete: (id: number) => api.delete(`/quality/ppap/${id}`),
    init: (projectId: number) => api.post(`/quality/ppap/init/${projectId}`),
    updateElement: (elementId: number, data: any) => api.put(`/quality/ppap/elements/${elementId}`, data)
  },
  msa: {
    listByProject: (projectId: number) => api.get(`/quality/msa/project/${projectId}`),
    get: (id: number) => api.get(`/quality/msa/${id}`),
    create: (data: any) => api.post('/quality/msa', data),
    update: (id: number, data: any) => api.put(`/quality/msa/${id}`, data),
    delete: (id: number) => api.delete(`/quality/msa/${id}`)
  },
  spc: {
    listByProject: (projectId: number) => api.get(`/quality/spc/project/${projectId}`),
    get: (id: number) => api.get(`/quality/spc/${id}`),
    create: (data: any) => api.post('/quality/spc', data),
    update: (id: number, data: any) => api.put(`/quality/spc/${id}`, data),
    delete: (id: number) => api.delete(`/quality/spc/${id}`),
    getDataPoints: (id: number) => api.get(`/quality/spc/${id}/datapoints`),
    addDataPoint: (id: number, data: any) => api.post(`/quality/spc/${id}/datapoints`, data)
  },
  vda: {
    listByProject: (projectId: number) => api.get(`/quality/vda/project/${projectId}`),
    get: (id: number) => api.get(`/quality/vda/${id}`),
    create: (data: any) => api.post('/quality/vda', data),
    update: (id: number, data: any) => api.put(`/quality/vda/${id}`, data),
    delete: (id: number) => api.delete(`/quality/vda/${id}`),
    getFindings: (auditId: number) => api.get(`/quality/vda/${auditId}/findings`),
    createFinding: (auditId: number, data: any) => api.post(`/quality/vda/${auditId}/findings`, data),
    updateFinding: (findingId: number, data: any) => api.put(`/quality/vda/findings/${findingId}`, data),
    deleteFinding: (findingId: number) => api.delete(`/quality/vda/findings/${findingId}`)
  },
  eightd: {
    listByProject: (projectId: number) => api.get(`/quality/8d/project/${projectId}`),
    get: (id: number) => api.get(`/quality/8d/${id}`),
    create: (data: any) => api.post('/quality/8d', data),
    update: (id: number, data: any) => api.put(`/quality/8d/${id}`, data),
    delete: (id: number) => api.delete(`/quality/8d/${id}`)
  },
  versions: {
    listByProject: (projectId: number) => api.get(`/quality/versions/project/${projectId}`),
    create: (data: any) => api.post('/quality/versions', data)
  }
};

export function getFileUrl(filePath: string): string {
  return `/uploads/${filePath}`;
}

export function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return '🖼️';
  if (['step', 'stp'].includes(ext)) return '⚙️';
  if (['dwg', 'dxf'].includes(ext)) return '📐';
  return '📎';
}

export function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext);
}

export function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

export function isOfficeFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function getPreviewUrl(fileName: string, filePath: string): string {
  if (isOfficeFile(fileName)) {
    const fileUrl = encodeURIComponent(window.location.origin + getFileUrl(filePath));
    return `https://view.officeapps.live.com/op/view.aspx?src=${fileUrl}`;
  }
  return getFileUrl(filePath);
}

export function downloadFile(fileName: string, filePath: string) {
  const token = localStorage.getItem('token');
  fetch(getFileUrl(filePath), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  }).then(res => res.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export const settingsApi = {
  getDatabaseConfig: () => api.get('/settings/database-config'),
  getTableStats: () => api.get('/settings/table-stats'),
  getTableSchema: (tableName: string) => api.get(`/settings/tables/${tableName}/schema`),
  getTableData: (tableName: string, params?: { page?: number; pageSize?: number; search?: string; sortBy?: string; sortOrder?: string }) =>
    api.get(`/settings/tables/${tableName}/data`, { params }),
  updateTableData: (tableName: string, id: string | number, data: any) => api.put(`/settings/tables/${tableName}/data/${id}`, data),
  insertTableData: (tableName: string, data: any) => api.post(`/settings/tables/${tableName}/data`, data),
  deleteTableData: (tableName: string, id: string | number) => api.delete(`/settings/tables/${tableName}/data/${id}`)
};
