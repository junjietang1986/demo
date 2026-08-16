import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createWorkbook, addSheet, sendWorkbook, parseUploadedFile, validateRows, ColumnDef } from '../utils/excel';
import { moduleNeedsApproval } from '../utils/version';
import { extractChineseDisplayName, findUserIdByName, getUserDisplayNameById } from '../utils/userHelper';
import dayjs from 'dayjs';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

function formatDateValue(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return dayjs(v).format('YYYY-MM-DD');
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return dayjs(d).format('YYYY-MM-DD');
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = dayjs(s);
  return d.isValid() ? d.format('YYYY-MM-DD') : s;
}

const DEPT_ENUM = ['机械设计部', '电气设计部', '测试部', '装配部', '质检部', '项目部', '管理部'];
const PROJECT_TYPE_ENUM = ['G项目-小工装', 'P项目-产线', 'P项目-实验室设备'];
const OPL_STATUS_ENUM = ['待处理', '处理中', '已完成', '已关闭'];
const ANOMALY_TYPE_ENUM = ['过程异常', '巡检问题'];
const ANOMALY_STATUS_ENUM = ['待处理', '处理中', '已完成', '已关闭'];
const PROJECT_STATUS_ENUM = ['规划中', '进行中', '已暂停', '已完成', '已关闭'];
const CE_MATERIAL_CATEGORY_ENUM = ['电气元件', '机械部件', '安全器件', '气动元件', '传感器', '控制系统', '传动部件', '其他'];
const CE_MATERIAL_STATUS_ENUM = ['有效', '停用'];

const OPL_STATUS_MAP: Record<string, string> = { '待处理': 'open', '处理中': 'processing', '已完成': 'completed', '已关闭': 'closed' };
const ANOMALY_TYPE_MAP: Record<string, string> = { '过程异常': 'process', '巡检问题': 'inspection' };
const ANOMALY_STATUS_MAP: Record<string, string> = { '待处理': 'open', '处理中': 'processing', '已完成': 'completed', '已关闭': 'closed' };
const PROJECT_STATUS_MAP: Record<string, string> = { '规划中': 'planning', '进行中': 'in_progress', '已暂停': 'paused', '已完成': 'completed', '已关闭': 'closed' };
const CE_MATERIAL_STATUS_MAP: Record<string, string> = { '有效': 'active', '停用': 'inactive' };

const TEMPLATES: Record<string, { name: string; columns: ColumnDef[] }> = {
  project: {
    name: '项目导入模板',
    columns: [
      { key: 'project_code', header: '项目编码', required: true, width: 18 },
      { key: 'project_name', header: '项目名称', required: true, width: 24 },
      { key: 'project_type', header: '项目类型', required: true, width: 18, enum: PROJECT_TYPE_ENUM },
      { key: 'customer', header: '客户', width: 18 },
      { key: 'project_priority', header: '优先级', width: 10, enum: ['高', '中', '低'] },
      { key: 'kickoff_date', header: '启动日期', width: 14 },
      { key: 'planned_fat_date', header: '计划FAT日期', width: 14 },
      { key: 'planned_sop_date', header: '计划SOP日期', width: 14 },
      { key: 'contract_amount', header: '合同金额(元)', width: 14, type: 'number' },
      { key: 'project_manager', header: '项目经理', width: 12 },
      { key: 'mech_designer', header: '机械设计负责人', width: 14 },
      { key: 'elec_designer', header: '电气设计负责人', width: 14 },
      { key: 'test_designer', header: '测试设计负责人', width: 14 },
      { key: 'electrician_lead', header: '电工负责人', width: 12 },
      { key: 'fitter_lead', header: '钳工负责人', width: 12 },
      { key: 'assembly_team', header: '装配团队', width: 16 },
      { key: 'status', header: '状态', width: 10, enum: PROJECT_STATUS_ENUM },
      { key: 'description', header: '项目描述', width: 30 },
      { key: 'customer_requirements', header: '客户需求(VOC)', width: 40 }
    ]
  },
  workstation: {
    name: '工位配置导入模板',
    columns: [
      { key: 'item', header: '序号', width: 8, type: 'number' },
      { key: 'process_code', header: '工序代码', required: true, width: 14 },
      { key: 'station_name', header: '工位名称（中文）', required: true, width: 36 },
      { key: 'mech_designer', header: '机械设计', width: 12 },
      { key: 'elec_designer', header: '电气设计', width: 12 },
      { key: 'meas_control_designer', header: '测控设计', width: 12 },
      { key: 'description', header: '描述', width: 24 }
    ]
  },
  opl: {
    name: 'OPL单点课程导入模板',
    columns: [
      { key: 'occurrence_date', header: '发生日期', required: true, width: 14, type: 'date' },
      { key: 'project_code', header: '项目编码', width: 18 },
      { key: 'station_code', header: '工位编码', width: 14 },
      { key: 'responsible_dept', header: '责任部门', required: true, width: 14, enum: DEPT_ENUM },
      { key: 'responsible_person', header: '责任人', width: 12 },
      { key: 'handler', header: '处理人', width: 12 },
      { key: 'problem_description', header: '问题现象描述', required: true, width: 36 },
      { key: 'solution_plan', header: '解决方案计划', width: 36 },
      { key: 'planned_completion_date', header: '计划完成日期', width: 14, type: 'date' },
      { key: 'actual_completion_date', header: '实际完成日期', width: 14, type: 'date' },
      { key: 'status', header: '状态', width: 10, enum: OPL_STATUS_ENUM }
    ]
  },
  anomaly: {
    name: '过程异常巡检导入模板',
    columns: [
      { key: 'occurrence_date', header: '发生日期', required: true, width: 14, type: 'date' },
      { key: 'anomaly_type', header: '异常类型', required: true, width: 12, enum: ANOMALY_TYPE_ENUM },
      { key: 'project_code', header: '项目编码', width: 18 },
      { key: 'station_code', header: '工位编码', width: 14 },
      { key: 'responsible_dept', header: '责任部门', required: true, width: 14, enum: DEPT_ENUM },
      { key: 'responsible_person', header: '责任人', width: 12 },
      { key: 'designer', header: '设计责任人', width: 12 },
      { key: 'part_number', header: '零件品号', width: 16 },
      { key: 'part_spec', header: '零件规格', width: 16 },
      { key: 'supplier', header: '供应商', width: 16 },
      { key: 'problem_description', header: '问题现象描述', required: true, width: 36 },
      { key: 'solution_plan', header: '解决方案计划', width: 36 },
      { key: 'planned_completion_date', header: '计划完成日期', width: 14, type: 'date' },
      { key: 'actual_completion_date', header: '实际完成日期', width: 14, type: 'date' },
      { key: 'status', header: '状态', width: 10, enum: ANOMALY_STATUS_ENUM }
    ]
  },
  ce_material: {
    name: 'CE物料存档库导入模板',
    columns: [
      { key: 'item', header: '序号', width: 8, type: 'number' },
      { key: 'material_code', header: '物料编码', width: 16 },
      { key: 'material_name', header: '物料名称', required: true, width: 28 },
      { key: 'specification', header: '规格型号', width: 20 },
      { key: 'brand', header: '品牌/制造商', width: 16 },
      { key: 'category', header: '物料类别', width: 12, enum: CE_MATERIAL_CATEGORY_ENUM },
      { key: 'certificate_no', header: 'CE证书编号', width: 20 },
      { key: 'cert_standard', header: '认证标准', width: 20 },
      { key: 'cert_body', header: '认证机构', width: 14 },
      { key: 'cert_issue_date', header: '证书签发日期', width: 14, type: 'date' },
      { key: 'cert_expiry_date', header: '证书有效期至', width: 14, type: 'date' },
      { key: 'supplier', header: '供应商', width: 16 },
      { key: 'applicable_scope', header: '适用机型/范围', width: 24 },
      { key: 'remarks', header: '备注', width: 24 },
      { key: 'status', header: '状态', width: 8, enum: CE_MATERIAL_STATUS_ENUM }
    ]
  }
};

const ACCEPTANCE_CONFIG_COLUMNS: ColumnDef[] = [
  { key: 'project_type', header: '项目类型', required: true, width: 18, enum: PROJECT_TYPE_ENUM },
  { key: 'category', header: '类别', required: true, width: 14 },
  { key: 'item_name', header: '验收项目名称', required: true, width: 24 },
  { key: 'item_description', header: '项目描述', width: 24 },
  { key: 'standard', header: '验收标准', width: 30 },
  { key: 'method', header: '检验方法', width: 20 },
  { key: 'sort_order', header: '排序', width: 8, type: 'number' }
];

function findProjectByCode(db: any, code: string): any {
  if (!code || !code.trim()) return null;
  return db.prepare('SELECT id, project_name FROM projects WHERE project_code = ?').get(code.trim()) as any;
}

function findStationByCode(db: any, projectId: number | null, code: string): any {
  if (!code || !code.trim() || !projectId) return null;
  return db.prepare('SELECT id, station_name FROM workstations WHERE project_id = ? AND station_code = ?').get(projectId, code.trim()) as any;
}

function getUserNameById(db: any, id: number | null): string {
  return getUserDisplayNameById(db, id);
}

function getProjectCodeById(db: any, id: number | null): string {
  if (!id) return '';
  const p = db.prepare('SELECT project_code FROM projects WHERE id = ?').get(id) as any;
  return p?.project_code || '';
}

function getStationCodeById(db: any, id: number | null): string {
  if (!id) return '';
  const s = db.prepare('SELECT station_code FROM workstations WHERE id = ?').get(id) as any;
  return s?.station_code || '';
}

router.get('/template/:module', async (req: Request, res: Response) => {
  try {
    const { module } = req.params;
    let template = TEMPLATES[module];
    let columns = template?.columns;

    if (module === 'acceptance_config') {
      template = { name: '验收配置导入模板', columns: ACCEPTANCE_CONFIG_COLUMNS };
      columns = ACCEPTANCE_CONFIG_COLUMNS;
    }

    if (!columns) {
      res.status(404).json({ code: 1, message: '未找到该模块的导入模板' });
      return;
    }
    const wb = createWorkbook();
    addSheet(wb, template.name, columns);
    await sendWorkbook(wb, res, `${template.name}_${dayjs().format('YYYYMMDD')}.xlsx`);
  } catch (err: any) {
    res.status(500).json({ code: 1, message: err.message || '模板导出失败' });
  }
});

router.get('/export/:module', async (req: Request, res: Response) => {
  try {
    const { module } = req.params;
    const db = getDb();
    const wb = createWorkbook();

    if (module === 'project') {
      const cols = TEMPLATES.project.columns;
      const projects = db.prepare(`
        SELECT p.* FROM projects p ORDER BY p.created_at DESC
      `).all() as any[];
      const rows = projects.map(p => ({
        project_code: p.project_code,
        project_name: p.project_name,
        project_type: p.project_type,
        customer: p.customer,
        project_priority: p.project_priority === 'high' ? '高' : p.project_priority === 'low' ? '低' : '中',
        kickoff_date: p.kickoff_date,
        planned_fat_date: p.planned_fat_date,
        planned_sop_date: p.planned_sop_date,
        contract_amount: p.contract_amount,
        project_manager: getUserNameById(db, p.project_manager_id),
        mech_designer: getUserNameById(db, p.mech_designer_id),
        elec_designer: getUserNameById(db, p.elec_designer_id),
        test_designer: getUserNameById(db, p.test_designer_id),
        electrician_lead: getUserNameById(db, p.electrician_lead_id),
        fitter_lead: getUserNameById(db, p.fitter_lead_id),
        assembly_team: p.assembly_team,
        status: Object.entries(PROJECT_STATUS_MAP).find(([_, v]) => v === p.status)?.[0] || p.status,
        description: p.description,
        customer_requirements: p.customer_requirements
      }));
      addSheet(wb, '项目列表', cols, rows);
    } else if (module === 'workstation') {
      const projectId = req.query.project_id ? parseInt(req.query.project_id as string) : null;
      const cols = TEMPLATES.workstation.columns;
      let sql = `SELECT w.* FROM workstations w`;
      const params: any[] = [];
      if (projectId) {
        sql += ` WHERE w.project_id = ?`;
        params.push(projectId);
      }
      sql += ` ORDER BY w.sort_order ASC, w.id ASC`;
      const stations = db.prepare(sql).all(...params) as any[];
      const rows = stations.map((s, idx) => ({
        item: s.sort_order || (idx + 1),
        process_code: s.station_code,
        station_name: s.station_name,
        mech_designer: s.mech_designer_name || getUserNameById(db, s.mech_designer_id),
        elec_designer: s.elec_designer_name || getUserNameById(db, s.elec_designer_id),
        meas_control_designer: s.meas_control_designer_name || getUserNameById(db, s.meas_control_designer_id),
        description: s.description
      }));
      addSheet(wb, '工位配置', cols, rows);
    } else if (module === 'opl') {
      const cols = TEMPLATES.opl.columns;
      const opls = db.prepare(`SELECT * FROM opl_records ORDER BY occurrence_date DESC`).all() as any[];
      const rows = opls.map(o => ({
        occurrence_date: o.occurrence_date,
        project_code: o.project_code || getProjectCodeById(db, o.project_id),
        station_code: o.station_code || getStationCodeById(db, o.workstation_id),
        responsible_dept: o.responsible_dept,
        responsible_person: getUserNameById(db, o.responsible_person_id),
        handler: getUserNameById(db, o.handler_id),
        problem_description: o.problem_description,
        solution_plan: o.solution_plan,
        planned_completion_date: o.planned_completion_date,
        actual_completion_date: o.actual_completion_date,
        status: Object.entries(OPL_STATUS_MAP).find(([_, v]) => v === o.status)?.[0] || o.status
      }));
      addSheet(wb, 'OPL记录', cols, rows);
    } else if (module === 'anomaly') {
      const cols = TEMPLATES.anomaly.columns;
      const anomalies = db.prepare(`SELECT * FROM anomaly_records ORDER BY occurrence_date DESC`).all() as any[];
      const rows = anomalies.map(a => ({
        occurrence_date: a.occurrence_date,
        anomaly_type: Object.entries(ANOMALY_TYPE_MAP).find(([_, v]) => v === a.anomaly_type)?.[0] || a.anomaly_type,
        project_code: a.project_code || getProjectCodeById(db, a.project_id),
        station_code: a.station_code || getStationCodeById(db, a.workstation_id),
        responsible_dept: a.responsible_dept,
        responsible_person: getUserNameById(db, a.responsible_person_id),
        designer: getUserNameById(db, a.designer_id),
        part_number: a.part_number,
        part_spec: a.part_spec,
        supplier: a.supplier,
        problem_description: a.problem_description,
        solution_plan: a.solution_plan,
        planned_completion_date: a.planned_completion_date,
        actual_completion_date: a.actual_completion_date,
        status: Object.entries(ANOMALY_STATUS_MAP).find(([_, v]) => v === a.status)?.[0] || a.status
      }));
      addSheet(wb, '异常记录', cols, rows);
    } else if (module === 'ce_material') {
      const cols = TEMPLATES.ce_material.columns;
      const materials = db.prepare(`SELECT * FROM ce_materials ORDER BY sort_order ASC, id DESC`).all() as any[];
      const rows = materials.map((m, idx) => ({
        item: m.sort_order || (idx + 1),
        material_code: m.material_code,
        material_name: m.material_name,
        specification: m.specification,
        brand: m.brand,
        category: m.category,
        certificate_no: m.certificate_no,
        cert_standard: m.cert_standard,
        cert_body: m.cert_body,
        cert_issue_date: m.cert_issue_date,
        cert_expiry_date: m.cert_expiry_date,
        supplier: m.supplier,
        applicable_scope: m.applicable_scope,
        remarks: m.remarks,
        status: Object.entries(CE_MATERIAL_STATUS_MAP).find(([_, v]) => v === m.status)?.[0] || (m.status === 'active' ? '有效' : '停用')
      }));
      addSheet(wb, 'CE物料存档库', cols, rows);
    } else if (module === 'acceptance_config') {
      const configs = db.prepare(`
        SELECT project_type, category, item_name, item_description, standard, method, sort_order
        FROM acceptance_configs WHERE is_active = 1 ORDER BY project_type, sort_order
      `).all();
      addSheet(wb, '验收配置', ACCEPTANCE_CONFIG_COLUMNS, configs);
    } else {
      res.status(404).json({ code: 1, message: '不支持导出该模块' });
      return;
    }

    await sendWorkbook(wb, res, `${module}_导出_${dayjs().format('YYYYMMDD')}.xlsx`);
  } catch (err: any) {
    res.status(500).json({ code: 1, message: err.message || '导出失败' });
  }
});

router.post('/preview/:module', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { module } = req.params;
    const projectId = req.query.project_id ? parseInt(req.query.project_id as string) : null;
    if (!req.file) {
      res.status(400).json({ code: 1, message: '请上传文件' });
      return;
    }

    if (module === 'workstation' && !projectId) {
      res.status(400).json({ code: 1, message: '工位导入需要指定项目ID' });
      return;
    }

    let columns: ColumnDef[] = TEMPLATES[module]?.columns || [];
    if (module === 'acceptance_config') {
      columns = ACCEPTANCE_CONFIG_COLUMNS;
    }
    if (columns.length === 0) {
      res.status(404).json({ code: 1, message: '未找到该模块的导入配置' });
      return;
    }

    const { rows, errors: parseErrors } = await parseUploadedFile(req.file.buffer);
    const { valid, errors: validationErrors } = validateRows(rows, columns);
    const allErrors = [...parseErrors, ...validationErrors];

    const needsApproval = moduleNeedsApproval(module.replace(/-/g, '_'));

    const db = getDb();

    if (module === 'workstation' && projectId) {
      const projExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!projExists) {
        res.status(400).json({ code: 1, message: '指定项目不存在' });
        return;
      }
    }

    const nameErrors: string[] = [];
    valid.forEach((row: any, idx: number) => {
      const rowNum = row._rowNumber || idx + 2;
      let nameFields: string[] = [];
      if (module === 'workstation') {
        nameFields = ['mech_designer', 'elec_designer', 'meas_control_designer'];
      } else if (module === 'ce_material' || module === 'acceptance_config') {
        nameFields = [];
      } else {
        nameFields = ['project_manager', 'mech_designer', 'elec_designer', 'test_designer', 'electrician_lead', 'fitter_lead', 'responsible_person', 'handler', 'designer'];
      }
      nameFields.forEach(field => {
        if (row[field]) {
          const uid = findUserIdByName(db, row[field]);
          if (!uid) {
            nameErrors.push(`第${rowNum}行: 「${columns.find(c => c.key === field)?.header || field}」中"${row[field]}"在系统用户中不存在`);
          }
        }
      });
      if (module === 'workstation' && projectId) {
        row._project_id = projectId;
      }
      if (row.project_code && module !== 'project' && module !== 'workstation' && module !== 'ce_material' && module !== 'acceptance_config') {
        const proj = findProjectByCode(db, row.project_code);
        if (!proj) {
          nameErrors.push(`第${rowNum}行: 项目编码"${row.project_code}"不存在`);
        }
      }
    });

    const finalErrors = [...allErrors, ...nameErrors];
    const finalValid = nameErrors.length === 0 ? valid : valid;

    const batchResult = db.prepare(
      `INSERT INTO import_batches (module, file_name, total_rows, success_rows, error_rows, errors, status, requires_confirm, batch_data, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      module,
      Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      rows.length,
      finalValid.length,
      finalErrors.length,
      JSON.stringify(finalErrors),
      finalErrors.length > 0 ? 'error' : 'pending',
      1,
      JSON.stringify(finalValid),
      (req as any).user?.id
    );

    res.json({
      code: 0,
      data: {
        batch_id: Number(batchResult.lastInsertRowid),
        total: rows.length,
        success: finalValid.length,
        errors: finalErrors,
        preview: finalValid.slice(0, 50),
        previewColumns: columns.filter(c => !c.key.startsWith('_')).map(c => ({ key: c.key, header: c.header })),
        requires_confirm: true,
        needs_approval: needsApproval,
        message: finalErrors.length > 0
          ? `解析完成，${finalValid.length}条有效，${finalErrors.length}条错误`
          : `解析完成，共${finalValid.length}条数据待确认导入`
      }
    });
  } catch (err: any) {
    res.status(500).json({ code: 1, message: err.message || '解析失败' });
  }
});

router.post('/confirm/:batchId', async (req: Request, res: Response) => {
  try {
    const batchId = parseInt(req.params.batchId);
    const userId = (req as any).user?.id;
    const db = getDb();

    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batchId) as any;
    if (!batch) {
      res.status(404).json({ code: 1, message: '导入批次不存在' });
      return;
    }
    if (batch.status !== 'pending') {
      res.status(400).json({ code: 1, message: '该批次已处理' });
      return;
    }

    const data = JSON.parse(batch.batch_data || '[]');
    const module = batch.module;
    let imported = 0;
    const insertErrors: string[] = [];

    const trx = db.transaction((items: any[]) => {
      items.forEach((item: any, idx: number) => {
        try {
          if (module === 'project') {
            const pm_id = findUserIdByName(db, item.project_manager);
            const md_id = findUserIdByName(db, item.mech_designer);
            const ed_id = findUserIdByName(db, item.elec_designer);
            const td_id = findUserIdByName(db, item.test_designer);
            const el_id = findUserIdByName(db, item.electrician_lead);
            const fl_id = findUserIdByName(db, item.fitter_lead);
            const status = item.status ? (PROJECT_STATUS_MAP[item.status] || item.status) : 'planning';
            const priority = item.project_priority === '高' ? 'high' : item.project_priority === '低' ? 'low' : 'medium';
            const kickoff = item.kickoff_date ? formatDateValue(item.kickoff_date) : null;
            const fatDate = item.planned_fat_date ? formatDateValue(item.planned_fat_date) : null;
            const sopDate = item.planned_sop_date ? formatDateValue(item.planned_sop_date) : null;
            const contractAmt = item.contract_amount ? Number(item.contract_amount) : 0;

            const exists = db.prepare('SELECT id FROM projects WHERE project_code = ?').get(item.project_code);
            if (exists) {
              db.prepare(
                `UPDATE projects SET project_name=?, project_type=?, customer=?, project_priority=?, kickoff_date=?,
                 planned_fat_date=?, planned_sop_date=?, contract_amount=?,
                 project_manager_id=?, mech_designer_id=?, elec_designer_id=?, test_designer_id=?,
                 electrician_lead_id=?, fitter_lead_id=?, assembly_team=?,
                 status=?, description=?, customer_requirements=?, updated_at=datetime('now','localtime') WHERE project_code=?`
              ).run(item.project_name, item.project_type, item.customer || null, priority, kickoff, fatDate, sopDate, contractAmt,
                    pm_id, md_id, ed_id, td_id, el_id, fl_id,
                    item.assembly_team || null, status, item.description || null, item.customer_requirements || null, item.project_code);
            } else {
              db.prepare(
                `INSERT INTO projects (project_code, project_name, project_type, customer, project_priority, kickoff_date,
                 planned_fat_date, planned_sop_date, contract_amount,
                 project_manager_id, mech_designer_id, elec_designer_id, test_designer_id,
                 electrician_lead_id, fitter_lead_id, assembly_team, status, description, customer_requirements,
                 apqp_phase, apqp_status, health_status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'in_progress', 'green', ?)`
              ).run(item.project_code, item.project_name, item.project_type, item.customer || null, priority, kickoff, fatDate, sopDate, contractAmt,
                    pm_id, md_id, ed_id, td_id, el_id, fl_id,
                    item.assembly_team || null, status, item.description || null, item.customer_requirements || null, userId);
            }
            imported++;
          } else if (module === 'opl') {
            let projectId = null;
            let projectName = null;
            if (item.project_code) {
              const proj = findProjectByCode(db, item.project_code);
              projectId = proj?.id || null;
              projectName = proj?.project_name || null;
            }
            let stationId = null;
            let stationName = null;
            if (item.station_code && projectId) {
              const st = findStationByCode(db, projectId, item.station_code);
              stationId = st?.id || null;
              stationName = st?.station_name || null;
            }
            const rp_id = findUserIdByName(db, item.responsible_person);
            const hd_id = findUserIdByName(db, item.handler);
            const status = item.status ? (OPL_STATUS_MAP[item.status] || item.status) : 'open';

            db.prepare(
              `INSERT INTO opl_records (occurrence_date, project_id, project_code, project_name, workstation_id, station_code, station_name,
                responsible_dept, responsible_person_id, handler_id, problem_description, solution_plan,
                planned_completion_date, actual_completion_date, status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              item.occurrence_date, projectId, item.project_code || null, projectName, stationId, item.station_code || null, stationName,
              item.responsible_dept, rp_id, hd_id, item.problem_description, item.solution_plan || null,
              item.planned_completion_date || null, item.actual_completion_date || null, status, userId
            );
            imported++;
          } else if (module === 'anomaly') {
            let projectId = null;
            let projectName = null;
            if (item.project_code) {
              const proj = findProjectByCode(db, item.project_code);
              projectId = proj?.id || null;
              projectName = proj?.project_name || null;
            }
            let stationId = null;
            let stationName = null;
            if (item.station_code && projectId) {
              const st = findStationByCode(db, projectId, item.station_code);
              stationId = st?.id || null;
              stationName = st?.station_name || null;
            }
            const rp_id = findUserIdByName(db, item.responsible_person);
            const ds_id = findUserIdByName(db, item.designer);
            const pmId = projectId ? (db.prepare('SELECT project_manager_id FROM projects WHERE id = ?').get(projectId) as any)?.project_manager_id || null : null;
            const anomalyType = item.anomaly_type ? (ANOMALY_TYPE_MAP[item.anomaly_type] || item.anomaly_type) : 'process';
            const status = item.status ? (ANOMALY_STATUS_MAP[item.status] || item.status) : 'open';

            db.prepare(
              `INSERT INTO anomaly_records (occurrence_date, anomaly_type, project_id, project_code, project_name, workstation_id, station_code, station_name,
                responsible_dept, responsible_person_id, project_manager_id, designer_id, part_number, part_spec, supplier,
                problem_description, solution_plan, planned_completion_date, actual_completion_date, status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              item.occurrence_date, anomalyType, projectId, item.project_code || null, projectName, stationId, item.station_code || null, stationName,
              item.responsible_dept, rp_id, pmId, ds_id, item.part_number || null, item.part_spec || null, item.supplier || null,
              item.problem_description, item.solution_plan || null, item.planned_completion_date || null,
              item.actual_completion_date || null, status, userId
            );
            imported++;
          } else if (module === 'acceptance_config') {
            const exists = db.prepare(
              'SELECT id FROM acceptance_configs WHERE project_type = ? AND category = ? AND item_name = ? AND is_active = 1'
            ).get(item.project_type, item.category, item.item_name);
            if (exists) {
              db.prepare(
                `UPDATE acceptance_configs SET item_description=?, standard=?, method=?, sort_order=?, updated_at=datetime('now','localtime') WHERE id=?`
              ).run(item.item_description || null, item.standard || null, item.method || null, item.sort_order || 0, (exists as any).id);
            } else {
              db.prepare(
                `INSERT INTO acceptance_configs (project_type, category, item_name, item_description, standard, method, sort_order, is_active, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
              ).run(item.project_type, item.category, item.item_name, item.item_description || null, item.standard || null,
                    item.method || null, item.sort_order || 0, userId);
            }
            imported++;
          } else if (module === 'workstation') {
            const wsProjectId = item._project_id;
            if (!wsProjectId) {
              throw new Error('缺少项目ID');
            }
            const md_id = findUserIdByName(db, item.mech_designer);
            const ed_id = findUserIdByName(db, item.elec_designer);
            const mcd_id = findUserIdByName(db, item.meas_control_designer);
            const md_name = md_id ? getUserDisplayNameById(db, md_id) : (item.mech_designer || null);
            const ed_name = ed_id ? getUserDisplayNameById(db, ed_id) : (item.elec_designer || null);
            const mcd_name = mcd_id ? getUserDisplayNameById(db, mcd_id) : (item.meas_control_designer || null);
            const sortOrder = item.item ? parseInt(item.item) : 0;

            const exists = db.prepare(
              'SELECT id FROM workstations WHERE project_id = ? AND station_code = ?'
            ).get(wsProjectId, item.process_code);
            if (exists) {
              db.prepare(
                `UPDATE workstations SET station_name=?, description=?, mech_designer_id=?, mech_designer_name=?,
                 elec_designer_id=?, elec_designer_name=?, meas_control_designer_id=?, meas_control_designer_name=?,
                 sort_order=?, updated_at=datetime('now','localtime') WHERE id=?`
              ).run(item.station_name, item.description || null, md_id, md_name, ed_id, ed_name, mcd_id, mcd_name,
                    sortOrder || 0, (exists as any).id);
            } else {
              db.prepare(
                `INSERT INTO workstations (project_id, station_code, station_name, description, sort_order,
                  mech_designer_id, mech_designer_name, elec_designer_id, elec_designer_name,
                  meas_control_designer_id, meas_control_designer_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(wsProjectId, item.process_code, item.station_name, item.description || null, sortOrder || 0,
                    md_id, md_name, ed_id, ed_name, mcd_id, mcd_name);
            }
            imported++;
          } else if (module === 'ce_material') {
            const sortOrder = item.item ? parseInt(item.item) : 0;
            const statusVal = item.status ? (CE_MATERIAL_STATUS_MAP[item.status] || 'active') : 'active';

            let existing = null;
            if (item.material_code) {
              existing = db.prepare('SELECT id FROM ce_materials WHERE material_code = ?').get(item.material_code.trim());
            }
            if (!existing && item.certificate_no) {
              existing = db.prepare('SELECT id FROM ce_materials WHERE certificate_no = ?').get(item.certificate_no.trim());
            }

            if (existing) {
              db.prepare(
                `UPDATE ce_materials SET material_name=?, specification=?, brand=?, category=?,
                 certificate_no=?, cert_standard=?, cert_body=?, cert_issue_date=?, cert_expiry_date=?,
                 supplier=?, applicable_scope=?, remarks=?, status=?, sort_order=?,
                 updated_at=datetime('now','localtime') WHERE id=?`
              ).run(
                item.material_name, item.specification || null, item.brand || null, item.category || null,
                item.certificate_no || null, item.cert_standard || null, item.cert_body || null,
                item.cert_issue_date || null, item.cert_expiry_date || null,
                item.supplier || null, item.applicable_scope || null, item.remarks || null,
                statusVal, sortOrder || 0, (existing as any).id
              );
            } else {
              db.prepare(
                `INSERT INTO ce_materials (sort_order, material_code, material_name, specification, brand, category,
                  certificate_no, cert_standard, cert_body, cert_issue_date, cert_expiry_date,
                  supplier, applicable_scope, remarks, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(
                sortOrder || 0,
                item.material_code || null,
                item.material_name,
                item.specification || null,
                item.brand || null,
                item.category || null,
                item.certificate_no || null,
                item.cert_standard || null,
                item.cert_body || null,
                item.cert_issue_date || null,
                item.cert_expiry_date || null,
                item.supplier || null,
                item.applicable_scope || null,
                item.remarks || null,
                statusVal,
                userId
              );
            }
            imported++;
          }
        } catch (e: any) {
          insertErrors.push(`第${idx + 2}行: ${e.message}`);
        }
      });
    });

    trx(data);

    db.prepare(
      `UPDATE import_batches SET status = ?, success_rows = ?, error_rows = ?, errors = ?, confirmed_at = datetime('now','localtime') WHERE id = ?`
    ).run(insertErrors.length > 0 ? 'partial' : 'confirmed', imported, insertErrors.length, JSON.stringify(insertErrors), batchId);

    res.json({
      code: 0,
      data: {
        imported,
        errors: insertErrors,
        message: insertErrors.length > 0
          ? `导入完成：成功${imported}条，失败${insertErrors.length}条`
          : `成功导入${imported}条数据`
      }
    });
  } catch (err: any) {
    res.status(500).json({ code: 1, message: err.message || '导入失败' });
  }
});

router.get('/versions/:module/:recordId', async (req: Request, res: Response) => {
  try {
    const { module, recordId } = req.params;
    const db = getDb();
    const versions = db.prepare(
      `SELECT v.*, u.name as creator_name
       FROM document_versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.module = ? AND v.record_id = ?
       ORDER BY v.version_no DESC`
    ).all(module, recordId);
    res.json({ code: 0, data: versions });
  } catch (err: any) {
    res.status(500).json({ code: 1, message: err.message });
  }
});

router.get('/batch/:batchId', async (req: Request, res: Response) => {
  try {
    const batch = getDb().prepare('SELECT * FROM import_batches WHERE id = ?').get(req.params.batchId);
    res.json({ code: 0, data: batch });
  } catch (err: any) {
    res.status(500).json({ code: 1, message: err.message });
  }
});

export default router;
