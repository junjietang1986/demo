import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import XLSX from 'xlsx';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getDb } from '../db/database';
import { createApprovalRecord } from '../utils/approval';

const router = Router();
router.use(authMiddleware);

const uploadsDir = path.join(__dirname, '../../uploads');
const archivesDir = path.join(uploadsDir, 'ce_archives');
if (!fs.existsSync(archivesDir)) fs.mkdirSync(archivesDir, { recursive: true });

const archiveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, archivesDir),
    filename: (_req, file, cb) => {
      const unique = Date.now() + '_' + Math.round(Math.random() * 1e6);
      cb(null, `tmp_${unique}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ============ 状态枚举常量 ============
export const NANDE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: '未确认', color: 'cyan' },
  approved:   { label: '认可',   color: 'success' },
  deviation:  { label: '偏差认可', color: 'warning' },
  rejected:   { label: '不认可', color: 'error' },
  na:         { label: '-',      color: 'default' }
};
export const OUCE_STATUS_MAP = NANDE_STATUS_MAP;
export const COMPLIANCE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:        { label: '待确认', color: 'processing' },
  compliant:      { label: '合规',   color: 'success' },
  non_compliant:  { label: '不合规', color: 'error' },
  deviation:      { label: '偏差',   color: 'warning' },
  not_required:   { label: '不需要', color: 'default' }
};
export const ARCHIVE_STATUS_MANUAL_MAP: Record<string, { label: string; color: string }> = {
  not_archived: { label: '未存档',             color: 'default' },
  archived:     { label: '已存档',             color: 'success' },
  no_cert:      { label: '没有证书/DOC',       color: 'warning' },
  no_manual:    { label: '没有英文说明书',     color: 'warning' }
};

function generateArchiveCode(db: any, docTypeId: number): { code: string; seq: number } {
  const dt = db.prepare('SELECT * FROM ce_doc_types WHERE id = ?').get(docTypeId) as any;
  if (!dt) throw new Error('文档类型不存在');
  const nextSeq = (dt.current_seq || 0) + 1;
  const padded = String(nextSeq).padStart(dt.seq_length || 6, '0');
  const code = `${dt.code_prefix}${padded}`;
  db.prepare('UPDATE ce_doc_types SET current_seq = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(nextSeq, docTypeId);
  return { code, seq: nextSeq };
}

function generateBatchCode(db: any): string {
  const row = db.prepare("SELECT COUNT(*) c FROM ce_archive_batches").get() as any;
  const next = (row?.c || 0) + 1;
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  return `CEB${ymd}${String(next).padStart(4, '0')}`;
}

function getExt(filename: string) {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.substring(i).toLowerCase() : '';
}

// ============ 文档类型管理 ============
router.get('/doc-types', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ce_doc_types ORDER BY sort_order, id').all();
  res.json({ code: 0, data: rows });
});

router.post('/doc-types', (req: Request, res: Response) => {
  const { type_code, type_name, description, code_prefix, seq_length, sort_order, is_enabled } = req.body;
  if (!type_code || !type_name) return res.status(400).json({ code: 400, message: '类型编码和名称必填' });
  const db = getDb();
  const u = (req as any).user;
  try {
    const r = db.prepare(`INSERT INTO ce_doc_types (type_code, type_name, description, code_prefix, seq_length, sort_order, is_enabled, created_by)
      VALUES (?,?,?,?,?,?,?,?)`).run(type_code, type_name, description || '', code_prefix || '', seq_length || 6, sort_order || 0, is_enabled ? 1 : 0, u.id);
    res.json({ code: 0, data: { id: r.lastInsertRowid } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

router.put('/doc-types/:id', (req: Request, res: Response) => {
  const { type_name, description, code_prefix, seq_length, sort_order, is_enabled } = req.body;
  const db = getDb();
  db.prepare(`UPDATE ce_doc_types SET type_name=?, description=?, code_prefix=?, seq_length=?, sort_order=?, is_enabled=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(type_name, description || '', code_prefix || '', seq_length || 6, sort_order || 0, is_enabled ? 1 : 0, req.params.id);
  res.json({ code: 0 });
});

router.delete('/doc-types/:id', (req: Request, res: Response) => {
  const db = getDb();
  const used = db.prepare('SELECT COUNT(*) c FROM ce_material_archives WHERE doc_type_id=?').get(req.params.id) as any;
  if (used.c > 0) return res.status(400).json({ code: 400, message: '该类型已被存档使用，无法删除' });
  db.prepare('DELETE FROM ce_doc_types WHERE id=?').run(req.params.id);
  res.json({ code: 0 });
});

// 生成下一个编码预览
router.get('/doc-types/:id/next-code', (req: Request, res: Response) => {
  const db = getDb();
  const dt = db.prepare('SELECT * FROM ce_doc_types WHERE id=?').get(req.params.id) as any;
  if (!dt) return res.status(404).json({ code: 404, message: '类型不存在' });
  const nextSeq = (dt.current_seq || 0) + 1;
  const padded = String(nextSeq).padStart(dt.seq_length || 6, '0');
  res.json({ code: 0, data: { next_code: `${dt.code_prefix}${padded}` } });
});

// ============ 物料清单 CRUD ============
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { keyword = '', category = '', archive_status = '', compliance_status = '',
    nande_status = '', ouce_status = '', page = '1', page_size = '20' } = req.query as any;
  const p = parseInt(page) || 1, ps = parseInt(page_size) || 20;
  const where: string[] = [];
  const params: any[] = [];
  if (keyword) {
    where.push(`(COALESCE(m.part_code,m.material_code) LIKE ?
      OR COALESCE(m.part_name,m.material_name) LIKE ?
      OR m.brand LIKE ?
      OR COALESCE(m.spec,m.specification) LIKE ?
      OR m.alternative_model LIKE ?
      OR m.alternative_suggestion LIKE ?
      OR m.selector_name LIKE ?
      OR m.purchaser_name LIKE ?
      OR m.certificate_no LIKE ?
      OR m.cert_standard LIKE ?
      OR m.cert_body LIKE ?
      OR m.cert_body_nande LIKE ?
      OR m.cert_body_ouce LIKE ?
      OR m.supplier LIKE ?
      OR CAST(COALESCE(m.sort_no,m.sort_order) AS TEXT) LIKE ?)`);
    const kw = `%${keyword}%`;
    for (let i = 0; i < 15; i++) params.push(kw);
  }
  if (category) { where.push('m.category = ?'); params.push(category); }
  if (archive_status) { where.push('m.archive_status_manual = ?'); params.push(archive_status); }
  if (compliance_status) { where.push('m.compliance_status = ?'); params.push(compliance_status); }
  if (nande_status) { where.push('m.nande_status = ?'); params.push(nande_status); }
  if (ouce_status) { where.push('m.ouce_status = ?'); params.push(ouce_status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (db.prepare(`SELECT COUNT(*) c FROM ce_materials m ${whereSql}`).get(...params) as any).c;
  const list = db.prepare(`SELECT m.*,
      COALESCE(m.part_code, m.material_code) as part_code,
      COALESCE(m.part_name, m.material_name) as part_name,
      COALESCE(m.spec, m.specification) as spec,
      COALESCE(m.sort_no, m.sort_order) as sort_no,
      (SELECT COUNT(*) FROM ce_material_archives a WHERE a.material_id=m.id) archive_count,
      (SELECT COUNT(*) FROM ce_material_archives a WHERE a.material_id=m.id AND a.approval_status='approved') approved_archive_count,
      (SELECT GROUP_CONCAT(dt.type_name || ':' || a.original_name, ' | ')
         FROM ce_material_archives a JOIN ce_doc_types dt ON a.doc_type_id=dt.id
         WHERE a.material_id=m.id AND a.approval_status='approved') archive_names,
      COALESCE((SELECT a.archive_code FROM ce_material_archives a WHERE a.material_id=m.id AND a.doc_type_id=(SELECT id FROM ce_doc_types WHERE type_code='001') AND a.approval_status='approved' ORDER BY a.id DESC LIMIT 1), '') as ce_cert_code,
      COALESCE((SELECT a.archive_code FROM ce_material_archives a WHERE a.material_id=m.id AND a.doc_type_id=(SELECT id FROM ce_doc_types WHERE type_code='002') AND a.approval_status='approved' ORDER BY a.id DESC LIMIT 1), '') as doc_code,
      COALESCE((SELECT a.archive_code FROM ce_material_archives a WHERE a.material_id=m.id AND a.doc_type_id=(SELECT id FROM ce_doc_types WHERE type_code='004') AND a.approval_status='approved' ORDER BY a.id DESC LIMIT 1), '') as manual_code,
      COALESCE((SELECT a.archive_code FROM ce_material_archives a WHERE a.material_id=m.id AND a.doc_type_id=(SELECT id FROM ce_doc_types WHERE type_code='003') AND a.approval_status='approved' ORDER BY a.id DESC LIMIT 1), '') as test_report_code
    FROM ce_materials m ${whereSql} ORDER BY COALESCE(m.sort_no,m.sort_order), m.id DESC LIMIT ? OFFSET ?`)
    .all(...params, ps, (p - 1) * ps) as any[];

  res.json({ code: 0, data: { list, total, page: p, page_size: ps } });
});

router.post('/', (req: Request, res: Response) => {
  const { sort_no, part_code, part_name, spec, brand, category, alternative_model,
    selector_name, purchaser_name, remarks,
    nande_status, ouce_status, compliance_status, archive_status_manual,
    alternative_suggestion } = req.body;
  if (!part_name) return res.status(400).json({ code: 400, message: '物料品名必填' });
  const db = getDb();
  const u = (req as any).user;
  try {
    const sn = sort_no || 0;
    const pc = part_code || '';
    const pn = part_name;
    const sp = spec || '';
    const r = db.prepare(`INSERT INTO ce_materials
      (sort_no, sort_order, part_code, material_code, part_name, material_name, spec, specification,
       brand, category, alternative_model, selector_name, purchaser_name, remarks, created_by,
       nande_status, ouce_status, compliance_status, archive_status_manual, alternative_suggestion)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      sn, sn, pc, pc, pn, pn, sp, sp,
      brand || '', category || '', alternative_model || '',
      selector_name || '', purchaser_name || '', remarks || '', u.id,
      nande_status || 'pending', ouce_status || 'pending', compliance_status || 'pending',
      archive_status_manual || 'not_archived', alternative_suggestion || ''
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid } });
  } catch (e: any) {
    res.status(400).json({ code: 400, message: e.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const { sort_no, part_code, part_name, spec, brand, category, alternative_model,
    selector_name, purchaser_name, remarks,
    nande_status, ouce_status, compliance_status, archive_status_manual,
    alternative_suggestion, change_summary } = req.body;
  const db = getDb();
  const u = (req as any).user;
  const materialId = parseInt(req.params.id);

  const existing = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!existing) return res.status(404).json({ code: 404, message: '物料不存在' });

  // 检查该物料是否有已审批通过（approved）的存档
  const approvedCount = db.prepare(`SELECT COUNT(*) c FROM ce_material_archives WHERE material_id=? AND approval_status='approved'`).get(materialId) as any;
  const hasApprovedArchive = (approvedCount?.c || 0) > 0;

  // 检查是否有待审批的物料信息变更
  const pendingChange = db.prepare(`SELECT id FROM document_versions WHERE module='ce_material' AND record_id=? AND status='pending'`).get(materialId) as any;

  // 基本信息字段（这些字段变更需要审批）
  const basicFieldsChanged =
    (sort_no !== undefined && sort_no !== existing.sort_no) ||
    (part_code !== undefined && (part_code || '') !== (existing.part_code || existing.material_code || '')) ||
    (part_name !== undefined && part_name !== (existing.part_name || existing.material_name || '')) ||
    (spec !== undefined && (spec || '') !== (existing.spec || existing.specification || '')) ||
    (brand !== undefined && (brand || '') !== (existing.brand || '')) ||
    (category !== undefined && (category || '') !== (existing.category || '')) ||
    (alternative_model !== undefined && (alternative_model || '') !== (existing.alternative_model || '')) ||
    (selector_name !== undefined && (selector_name || '') !== (existing.selector_name || '')) ||
    (purchaser_name !== undefined && (purchaser_name || '') !== (existing.purchaser_name || '')) ||
    (remarks !== undefined && (remarks || '') !== (existing.remarks || ''));

  // 如果有已审批存档，且基本信息有变更，且不是来自审批流程内部调用 → 需要走审批
  const isApprovalInternal = req.headers['x-approval-internal'] === '1' || req.body._skip_approval === true;
  if (hasApprovedArchive && basicFieldsChanged && !isApprovalInternal) {
    if (pendingChange) {
      return res.status(400).json({ code: 400, message: '该物料已有待审批的信息变更，请先处理现有变更' });
    }

    // 构造变更后的数据快照（合并新基本信息 + 原有状态字段）
    const newData = {
      sort_no: sort_no !== undefined ? sort_no : (existing.sort_no || existing.sort_order || 0),
      part_code: part_code !== undefined ? (part_code || '') : (existing.part_code || existing.material_code || ''),
      part_name: part_name !== undefined ? part_name : (existing.part_name || existing.material_name || ''),
      spec: spec !== undefined ? (spec || '') : (existing.spec || existing.specification || ''),
      brand: brand !== undefined ? (brand || '') : (existing.brand || ''),
      category: category !== undefined ? (category || '') : (existing.category || ''),
      alternative_model: alternative_model !== undefined ? (alternative_model || '') : (existing.alternative_model || ''),
      selector_name: selector_name !== undefined ? (selector_name || '') : (existing.selector_name || ''),
      purchaser_name: purchaser_name !== undefined ? (purchaser_name || '') : (existing.purchaser_name || ''),
      remarks: remarks !== undefined ? (remarks || '') : (existing.remarks || '')
    };

    // 计算变更摘要
    const changedFields: string[] = [];
    const fieldLabels: Record<string, string> = {
      sort_no: '排序号', part_code: '物料品号', part_name: '物料品名',
      spec: '规格', brand: '品牌', category: '类别',
      alternative_model: '替代品号/规格', selector_name: '选型人',
      purchaser_name: '采购', remarks: '备注'
    };
    Object.keys(newData).forEach(k => {
      const oldVal: any = (existing as any)[k] || (k === 'part_code' ? existing.material_code : k === 'part_name' ? existing.material_name : k === 'spec' ? existing.specification : k === 'sort_no' ? existing.sort_order : '') || '';
      const newVal: any = (newData as any)[k];
      if (String(oldVal || '') !== String(newVal || '')) {
        changedFields.push(`${fieldLabels[k] || k}: "${oldVal || '(空)'}" → "${newVal || '(空)'}"`);
      }
    });

    try {
      const tx = db.transaction(() => {
        // 获取当前版本号
        const maxVerRow = db.prepare(`SELECT COALESCE(MAX(version_no),0) as mv FROM document_versions WHERE module='ce_material' AND record_id=?`).get(materialId) as any;
        const nextVersion = (maxVerRow?.mv || 0) + 1;

        // 创建版本快照
        const snap = db.prepare(`INSERT INTO document_versions
          (module, record_id, version_no, version_label, status, is_current, source_type, change_summary, snapshot_data, created_by, created_at)
          VALUES ('ce_material', ?, ?, ?, 'pending', 0, 'edit', ?, ?, ?, datetime('now','localtime'))`).run(
          materialId, nextVersion, `V${nextVersion}`,
          change_summary || changedFields.join('; '),
          JSON.stringify(newData), u.id
        );
        const versionId = snap.lastInsertRowid as number;

        // 创建审批记录
        const materialName = newData.part_name || existing.part_name || existing.material_name || '';
        const materialCode = newData.part_code || existing.part_code || existing.material_code || '';
        createApprovalRecord(db, {
          module: 'ce_material_change',
          business_id: versionId,
          title: `CE物料信息变更审批：${materialName}（${materialCode}）`,
          submitter_id: u.id
        });
      });
      tx();

      return res.json({
        code: 0,
        data: {
          require_approval: true,
          message: '该物料已受控，信息变更已提交审批，审批通过后生效'
        }
      });
    } catch (e: any) {
      return res.status(500).json({ code: 500, message: e.message || '提交审批失败' });
    }
  }

  // 无已审批存档，或内部审批调用，或无基本信息变更 → 直接更新
  const sn = sort_no !== undefined ? sort_no : (existing.sort_no || existing.sort_order || 0);
  const pc = part_code !== undefined ? (part_code || '') : (existing.part_code || existing.material_code || '');
  const pn = part_name !== undefined ? part_name : (existing.part_name || existing.material_name || '');
  const sp = spec !== undefined ? (spec || '') : (existing.spec || existing.specification || '');
  db.prepare(`UPDATE ce_materials SET sort_no=?, sort_order=?, part_code=?, material_code=?, part_name=?, material_name=?,
    spec=?, specification=?, brand=?, category=?,
    alternative_model=?, selector_name=?, purchaser_name=?, remarks=?,
    nande_status=?, ouce_status=?, compliance_status=?, archive_status_manual=?,
    alternative_suggestion=?,
    updated_at=datetime('now','localtime') WHERE id=?`).run(
    sn, sn, pc, pc, pn, pn, sp, sp, brand !== undefined ? (brand || '') : existing.brand,
    category !== undefined ? (category || '') : existing.category,
    alternative_model !== undefined ? (alternative_model || '') : existing.alternative_model,
    selector_name !== undefined ? (selector_name || '') : existing.selector_name,
    purchaser_name !== undefined ? (purchaser_name || '') : existing.purchaser_name,
    remarks !== undefined ? (remarks || '') : existing.remarks,
    nande_status || existing.nande_status || 'pending',
    ouce_status || existing.ouce_status || 'pending',
    compliance_status || existing.compliance_status || 'pending',
    archive_status_manual || existing.archive_status_manual || 'not_archived',
    alternative_suggestion !== undefined ? alternative_suggestion : existing.alternative_suggestion,
    materialId
  );

  // 如果是直接更新基本信息（无审批），也记录一条历史版本（直接approved状态）
  if (!hasApprovedArchive && basicFieldsChanged) {
    try {
      const maxVerRow = db.prepare(`SELECT COALESCE(MAX(version_no),0) as mv FROM document_versions WHERE module='ce_material' AND record_id=?`).get(materialId) as any;
      const nextVersion = (maxVerRow?.mv || 0) + 1;
      db.prepare(`INSERT INTO document_versions
        (module, record_id, version_no, version_label, status, is_current, source_type, change_summary, snapshot_data, created_by, created_at, approved_at)
        VALUES ('ce_material', ?, ?, ?, 'approved', 1, 'edit', ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))`).run(
        materialId, nextVersion, `V${nextVersion}`,
        change_summary || '初始编辑',
        JSON.stringify({
          sort_no: sn, part_code: pc, part_name: pn, spec: sp,
          brand: brand || '', category: category || '',
          alternative_model: alternative_model || '', selector_name: selector_name || '',
          purchaser_name: purchaser_name || '', remarks: remarks || ''
        }), u.id
      );
    } catch (e) {}
  }

  res.json({ code: 0, data: { require_approval: false } });
});

// 一键清空所有CE物料数据（必须在/:id之前，仅管理员）
router.delete('/clear-all', requireRole('admin'), async (req: Request, res: Response) => {
  const db = getDb();
  try {
    db.exec('BEGIN TRANSACTION');

    const archives = db.prepare('SELECT file_path FROM ce_material_archives').all() as any[];
    archives.forEach(a => {
      if (a.file_path && fs.existsSync(a.file_path)) {
        try { fs.unlinkSync(a.file_path); } catch {}
      }
    });

    const tmpFiles = fs.existsSync(archivesDir) ? fs.readdirSync(archivesDir) : [];
    tmpFiles.forEach(f => {
      if (f.startsWith('tmp_')) {
        try { fs.unlinkSync(path.join(archivesDir, f)); } catch {}
      }
    });

    db.exec('DELETE FROM approval_step_records WHERE approval_record_id IN (SELECT id FROM approval_records WHERE module = \'ce_archive\')');
    db.exec('DELETE FROM approval_records WHERE module = \'ce_archive\'');
    db.exec('DELETE FROM ce_material_archives');
    db.exec('DELETE FROM ce_archive_batches');
    db.exec('DELETE FROM ce_materials');
    db.exec('UPDATE ce_doc_types SET current_seq = 0');

    db.exec('COMMIT');
    res.json({ code: 0, message: 'CE物料数据已全部清空，文档类型序列号已重置' });
  } catch (err: any) {
    db.exec('ROLLBACK');
    res.status(500).json({ code: 500, message: err.message || '清空失败' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const archives = db.prepare('SELECT file_path FROM ce_material_archives WHERE material_id=? AND (is_bound IS NULL OR is_bound=0)').all(req.params.id) as any[];
  archives.forEach(a => {
    const refCount = db.prepare('SELECT COUNT(*) c FROM ce_material_archives WHERE file_path=?').get(a.file_path) as any;
    if (refCount.c <= 1) { try { fs.unlinkSync(a.file_path); } catch {} }
  });
  db.prepare('DELETE FROM ce_material_archives WHERE material_id=?').run(req.params.id);
  db.prepare('DELETE FROM ce_archive_batches WHERE material_id=?').run(req.params.id);
  db.prepare('DELETE FROM ce_project_bom_items WHERE ce_material_id=? OR material_id=?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM ce_materials WHERE id=?').run(req.params.id);
  res.json({ code: 0 });
});

// 获取审批批次详情（必须在/:id之前）
router.get('/batches/:id', (req: Request, res: Response) => {
  const db = getDb();
  const batch = db.prepare('SELECT * FROM ce_archive_batches WHERE id=?').get(req.params.id);
  if (!batch) return res.status(404).json({ code: 404, message: '批次不存在' });
  const archiveIds = JSON.parse(batch.archive_ids || '[]');
  let archives: any[] = [];
  if (archiveIds.length > 0) {
    const placeholders = archiveIds.map(() => '?').join(',');
    archives = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix
      FROM ce_material_archives a JOIN ce_doc_types dt ON a.doc_type_id=dt.id
      WHERE a.id IN (${placeholders})`).all(...archiveIds) as any[];
  }
  const material = db.prepare('SELECT *, COALESCE(part_code,material_code) as part_code, COALESCE(part_name,material_name) as part_name, COALESCE(spec,specification) as spec FROM ce_materials WHERE id=?').get(batch.material_id);
  res.json({ code: 0, data: { ...batch, archives, material } });
});

// 导出物料清单或打包文档（必须在/:id之前）
router.get('/export', async (req: Request, res: Response) => {
  const db = getDb();
  const { keyword = '', category = '', archive_status = '', type = 'material' } = req.query as any;
  const where: string[] = [];
  const params: any[] = [];
  if (keyword) {
    where.push('(COALESCE(part_code,material_code) LIKE ? OR COALESCE(part_name,material_name) LIKE ? OR brand LIKE ? OR COALESCE(spec,specification) LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) { where.push('category = ?'); params.push(category); }
  if (archive_status) { where.push('archive_status_manual = ?'); params.push(archive_status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const list = db.prepare(`SELECT *, COALESCE(part_code,material_code) as part_code,
      COALESCE(part_name,material_name) as part_name, COALESCE(spec,specification) as spec
    FROM ce_materials ${whereSql} ORDER BY COALESCE(sort_no,sort_order), id`).all(...params) as any[];

  const headers = ['序号','新增日期','类别','物料品号','物料品名','物料规格','替代型号','品牌','选型\n负责人','采购','CE认证报告','DOC自我声明','英文说明书','测试报告','是否存档','南德','欧测','是否合规','备注'];
  const data: any[][] = [headers];
  list.forEach((m, i) => {
    const archives = db.prepare(`SELECT dt.type_code, dt.type_name, a.archive_code, a.original_name, a.approval_status
      FROM ce_material_archives a JOIN ce_doc_types dt ON a.doc_type_id=dt.id
      WHERE a.material_id=? AND a.approval_status='approved' ORDER BY dt.sort_order, a.created_at`).all(m.id) as any[];
    const archMap: Record<string, string> = {};
    archives.forEach(a => {
      const key = a.type_code;
      archMap[key] = a.archive_code || '';
    });

    const ceCert = archMap['001'] || '';
    const doc = archMap['002'] || '';
    const manual = archMap['004'] || '';
    const testReport = archMap['003'] || '';

    // 格式化新增日期
    let dateStr = '';
    if (m.created_at) {
      const d = new Date(m.created_at);
      if (!isNaN(d.getTime())) dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }

    data.push([
      m.sort_no || i + 1, dateStr, m.category || '', m.part_code || '', m.part_name || '', m.spec || '',
      m.alternative_model || m.alternative_suggestion || '', m.brand || '', m.selector_name || '', m.purchaser_name || '',
      ceCert, doc, manual, testReport,
      ARCHIVE_STATUS_MANUAL_MAP[m.archive_status_manual]?.label || '未存档',
      NANDE_STATUS_MAP[m.nande_status]?.label || '未确认',
      OUCE_STATUS_MAP[m.ouce_status]?.label || '未确认',
      COMPLIANCE_STATUS_MAP[m.compliance_status]?.label || '待确认',
      m.remarks || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:6},{wch:12},{wch:8},{wch:16},{wch:28},{wch:24},{wch:18},{wch:10},{wch:12},{wch:10},
    {wch:28},{wch:28},{wch:28},{wch:28},{wch:10},{wch:8},{wch:8},{wch:10},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CE物料清单');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  if (type === 'doc') {
    // 批量导出文档模式：物料清单Excel + 所有文档文件打包成ZIP
    const today = new Date().toISOString().slice(0, 10);
    const tmpDir = path.join(uploadsDir, 'export_tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipFileName = `ce_material_docs_export_${Date.now()}.zip`;
    const zipFilePath = path.join(tmpDir, zipFileName);
    const output = fs.createWriteStream(zipFilePath);

    let clientAborted = false;
    let zipFinalizedOk = false;
    const cleanUpZip = () => { try { if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath); } catch {} };
    const sendError = (msg: string, code = 500) => {
      if (!res.headersSent && !res.writableEnded) {
        res.status(code).json({ code, message: msg });
      }
    };

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('error', (err: any) => {
      console.error('[export-doc] archiver error:', err?.message || err);
      cleanUpZip();
      sendError('打包失败: ' + (err?.message || '未知错误'));
    });
    archive.on('warning', (err: any) => {
      console.warn('[export-doc] archiver warning:', err?.message || err);
    });
    output.on('error', (err: any) => {
      console.error('[export-doc] writeStream error:', err?.message || err);
      cleanUpZip();
      sendError('磁盘写入失败');
    });
    req.on('close', () => {
      clientAborted = true;
      try { if (!output.writableEnded) output.destroy(new Error('client aborted')); } catch {}
      try { if (!(archive as any)._finalized) archive.abort?.(); } catch {}
    });

    output.on('close', () => {
      if (clientAborted) { cleanUpZip(); return; }
      if (res.headersSent || res.writableEnded) { cleanUpZip(); return; }
      try {
        if (!fs.existsSync(zipFilePath)) { sendError('打包文件未生成'); return; }
        const stat = fs.statSync(zipFilePath);
        if (stat.size === 0) { cleanUpZip(); sendError('打包文件为空'); return; }
        const fname = encodeURIComponent(`CE物料文档批量导出_${today}.zip`);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="ce_material_docs_export.zip"; filename*=UTF-8''${fname}`);
        res.setHeader('Content-Length', stat.size);
        const readStream = fs.createReadStream(zipFilePath);
        readStream.on('error', (err) => {
          console.error('[export-doc] readStream error:', err?.message || err);
          cleanUpZip();
          try { if (!res.writableEnded) res.end(); } catch {}
        });
        readStream.on('end', () => cleanUpZip());
        readStream.on('close', () => cleanUpZip());
        readStream.pipe(res);
      } catch (err: any) {
        console.error('[export-doc] send zip error:', err?.message || err);
        cleanUpZip();
        sendError('返回下载失败');
      }
    });
    archive.pipe(output);

    // 添加物料清单Excel
    archive.append(buf, { name: `物料清单_${today}.xlsx` });

    // 收集所有文档文件并添加到ZIP
    const allArchives = db.prepare(`
      SELECT a.*, m.part_code, m.part_name, dt.type_name, dt.type_code
      FROM ce_material_archives a
      JOIN ce_materials m ON a.material_id = m.id
      JOIN ce_doc_types dt ON a.doc_type_id = dt.id
      WHERE a.approval_status = 'approved'
      ORDER BY m.id, dt.sort_order
    `).all() as any[];

    let addedCount = 0;
    let skippedCount = 0;
    const materialsWithDocs = new Set<number>();

    for (const arch of allArchives) {
      if (clientAborted) break;
      const filePath = arch.file_path;
      if (!filePath || !fs.existsSync(filePath)) {
        skippedCount++;
        continue;
      }
      const matCode = arch.part_code || `无品号_${arch.material_id}`;
      const matName = arch.part_name || '未知物料';
      const safeMatCode = matCode.replace(/[\\/:*?"<>|]/g, '_');
      const safeMatName = matName.replace(/[\\/:*?"<>|]/g, '_');
      const folderName = `${safeMatCode}_${safeMatName}`;
      const ext = path.extname(arch.file_name || arch.original_name || '');
      const fileName = arch.archive_code && ext ? `${arch.archive_code}${ext}` : (arch.original_name || arch.file_name || 'document');
      const zipPath = `物料文档/${folderName}/${fileName}`;

      try {
        archive.file(filePath, { name: zipPath });
        addedCount++;
        materialsWithDocs.add(arch.material_id);
      } catch (e) {
        skippedCount++;
      }
    }

    if (clientAborted) { cleanUpZip(); return; }

    // 添加导出说明
    const readmeLines = [
      `CE物料文档批量导出清单`,
      `导出时间: ${new Date().toLocaleString('zh-CN')}`,
      `物料总数: ${list.length}`,
      `文档文件数: ${addedCount}`,
      skippedCount > 0 ? `跳过文件: ${skippedCount} (文件不存在或已损坏)` : '',
      ``,
      `目录结构说明:`,
      `  /物料清单_${today}.xlsx  - 物料清单Excel文件`,
      `  /物料文档/品号_品名/      - 按物料分文件夹存放的文档`,
    ].filter(Boolean);
    archive.append(Buffer.from(readmeLines.join('\n'), 'utf-8'), { name: '导出说明.txt' });

    try {
      await archive.finalize();
      zipFinalizedOk = true;
    } catch (err: any) {
      console.error('[export-doc] archive.finalize error:', err?.message || err);
      cleanUpZip();
      sendError('打包失败: ' + (err?.message || 'finalize异常'));
    }
    return;
  }

  // 纯物料清单Excel导出
  const fname = encodeURIComponent(`CE物料清单_${new Date().toISOString().slice(0,10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ce_material_export.xlsx"; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// 导出物料清单（不含文件列，纯物料数据）
router.get('/export-simple', (req: Request, res: Response) => {
  const db = getDb();
  const { keyword = '', category = '', archive_status = '' } = req.query as any;
  const where: string[] = [];
  const params: any[] = [];
  if (keyword) {
    where.push('(COALESCE(part_code,material_code) LIKE ? OR COALESCE(part_name,material_name) LIKE ? OR brand LIKE ? OR COALESCE(spec,specification) LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (category) { where.push('category = ?'); params.push(category); }
  if (archive_status) { where.push('archive_status_manual = ?'); params.push(archive_status); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const list = db.prepare(`SELECT *, COALESCE(part_code,material_code) as part_code,
      COALESCE(part_name,material_name) as part_name, COALESCE(spec,specification) as spec
    FROM ce_materials ${whereSql} ORDER BY COALESCE(sort_no,sort_order), id`).all(...params) as any[];

  const headers = ['序号','新增日期','类别','物料品号','物料品名','物料规格','替代型号','品牌','选型\n负责人','采购','CE认证报告','DOC自我声明','英文说明书','测试报告','是否存档','南德','欧测','是否合规','备注'];
  const data: any[][] = [headers];
  list.forEach((m, i) => {
    const archives = db.prepare(`SELECT dt.type_code, dt.type_name, a.archive_code, a.original_name, a.approval_status
      FROM ce_material_archives a JOIN ce_doc_types dt ON a.doc_type_id=dt.id
      WHERE a.material_id=? AND a.approval_status='approved' ORDER BY dt.sort_order, a.created_at`).all(m.id) as any[];
    const archMap: Record<string, string> = {};
    archives.forEach(a => {
      archMap[a.type_code] = a.archive_code || '';
    });

    // 格式化新增日期
    let dateStr = '';
    if (m.created_at) {
      const d = new Date(m.created_at);
      if (!isNaN(d.getTime())) dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    }

    data.push([
      m.sort_no || i + 1, dateStr, m.category || '', m.part_code || '', m.part_name || '', m.spec || '',
      m.alternative_model || m.alternative_suggestion || '', m.brand || '', m.selector_name || '', m.purchaser_name || '',
      archMap['001'] || '', archMap['002'] || '', archMap['004'] || '', archMap['003'] || '',
      ARCHIVE_STATUS_MANUAL_MAP[m.archive_status_manual]?.label || '未存档',
      NANDE_STATUS_MAP[m.nande_status]?.label || '未确认',
      OUCE_STATUS_MAP[m.ouce_status]?.label || '未确认',
      COMPLIANCE_STATUS_MAP[m.compliance_status]?.label || '待确认',
      m.remarks || ''
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:6},{wch:12},{wch:8},{wch:16},{wch:28},{wch:24},{wch:18},{wch:10},{wch:12},{wch:10},
    {wch:28},{wch:28},{wch:28},{wch:28},{wch:10},{wch:8},{wch:8},{wch:10},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CE物料清单');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = encodeURIComponent(`CE物料清单_${new Date().toISOString().slice(0,10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ce_materials.xlsx"; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// 获取指定物料+文档类型的最大版本号（必须在/:id之前）
router.get('/:materialId/max-version/:docTypeId', (req: Request, res: Response) => {
  const db = getDb();
  const materialId = parseInt(req.params.materialId);
  const docTypeId = parseInt(req.params.docTypeId);
  const row = db.prepare(`SELECT version_no FROM ce_material_archives
    WHERE material_id=? AND doc_type_id=? AND approval_status='approved'
    ORDER BY id DESC LIMIT 1`).get(materialId, docTypeId) as any;
  const maxVersion = row?.version_no || '0.0';
  const verMatch = maxVersion.match(/(\d+)(?:\.(\d+))?$/);
  let nextVer = '1.0';
  if (verMatch) {
    nextVer = `${parseInt(verMatch[1]) + 1}.0`;
  }
  res.json({ code: 0, data: { max_version: maxVersion, next_version: nextVer } });
});

// ============ CE物料信息变更历史 ============
router.get('/:id/change-history', (req: Request, res: Response) => {
  const db = getDb();
  const materialId = parseInt(req.params.id);
  const material = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!material) return res.status(404).json({ code: 404, message: '物料不存在' });

  const versions = db.prepare(`
    SELECT dv.*, u.name as created_by_name
    FROM document_versions dv
    LEFT JOIN users u ON dv.created_by = u.id
    WHERE dv.module='ce_material' AND dv.record_id=?
    ORDER BY dv.version_no DESC
  `).all(materialId) as any[];

  const approvalRecords = db.prepare(`
    SELECT ar.*, u.name as submitter_name, af.flow_name,
      (SELECT asr.approver_name FROM approval_step_records asr
        WHERE asr.approval_record_id = ar.id AND asr.status <> 'pending'
        ORDER BY asr.approved_at DESC LIMIT 1) as approver_name,
      (SELECT asr.comment FROM approval_step_records asr
        WHERE asr.approval_record_id = ar.id AND asr.status <> 'pending'
        ORDER BY asr.approved_at DESC LIMIT 1) as approval_comment
    FROM approval_records ar
    LEFT JOIN users u ON ar.submitter_id = u.id
    LEFT JOIN approval_flows af ON ar.flow_id = af.id
    WHERE ar.module='ce_material_change' AND ar.record_id IN (
      SELECT id FROM document_versions WHERE module='ce_material' AND record_id=?
    )
    ORDER BY ar.created_at DESC
  `).all(materialId) as any[];

  const versionsWithApproval = versions.map(v => {
    const approval = approvalRecords.find(a => a.record_id === v.id);
    return {
      ...v,
      snapshot_data: v.snapshot_data ? JSON.parse(v.snapshot_data) : null,
      approval_record: approval || null
    };
  });

  res.json({ code: 0, data: versionsWithApproval });
});

// 获取单条物料（含存档列表）
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const m = db.prepare('SELECT *, COALESCE(part_code,material_code) as part_code, COALESCE(part_name,material_name) as part_name, COALESCE(spec,specification) as spec, COALESCE(sort_no,sort_order) as sort_no FROM ce_materials WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ code: 404, message: '物料不存在' });
  const archives = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix
    FROM ce_material_archives a JOIN ce_doc_types dt ON a.doc_type_id=dt.id
    WHERE a.material_id=? ORDER BY a.created_at DESC`).all(req.params.id);
  const batches = db.prepare(`SELECT * FROM ce_archive_batches WHERE material_id=? ORDER BY created_at DESC`).all(req.params.id);
  res.json({ code: 0, data: { ...m, archives, batches } });
});

// ============ 存档上传（单文件，支持立即生成编码） ============
router.post('/:materialId/archives', archiveUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });
  const db = getDb();
  const u = (req as any).user;
  const materialId = parseInt(req.params.materialId);
  const material = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!material) { try { fs.unlinkSync(req.file.path); } catch {}; return res.status(404).json({ code: 404, message: '物料不存在' }); }

  const docTypeId = parseInt(req.body.doc_type_id);
  const certNo = req.body.cert_no || '';
  const versionNo = req.body.version_no || '1.0';
  const projectId = req.body.project_id ? parseInt(req.body.project_id) : null;
  const workstationId = req.body.workstation_id ? parseInt(req.body.workstation_id) : null;
  const remarks = req.body.remarks || '';
  const autoRename = req.body.auto_rename !== '0';

  const dt = db.prepare('SELECT * FROM ce_doc_types WHERE id=?').get(docTypeId) as any;
  if (!dt) { try { fs.unlinkSync(req.file.path); } catch {}; return res.status(400).json({ code: 400, message: '请选择文档类型' }); }

  let finalName, finalPath, archiveCode = '';
  const ext = getExt(req.file.originalname);
  if (autoRename) {
    const { code } = generateArchiveCode(db, docTypeId);
    archiveCode = code;
    finalName = `${code}${ext}`;
    finalPath = path.join(archivesDir, finalName);
    fs.renameSync(req.file.path, finalPath);
  } else {
    finalName = req.file.filename;
    finalPath = req.file.path;
  }
  const displayName = autoRename ? finalName : req.file.originalname;

  try {
    const r = db.prepare(`INSERT INTO ce_material_archives
      (material_id, doc_type_id, archive_code, file_name, original_name, file_path, file_size, file_type,
       project_id, workstation_id, cert_no, version_no, status, approval_status, created_by, remarks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft','draft',?,?)`).run(
      materialId, docTypeId, archiveCode, finalName, displayName, finalPath,
      req.file.size, ext.replace('.', ''), projectId, workstationId, certNo, versionNo, u.id, remarks
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid, archive_code: archiveCode, file_name: finalName } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// ============ 搜索已有存档（用于绑定共用文件） ============
router.get('/archives/search', (req: Request, res: Response) => {
  const db = getDb();
  const { keyword = '', doc_type_id = '', page = '1', pageSize = '10', exclude_material_id = '' } = req.query as any;
  const p = parseInt(page) || 1;
  const ps = parseInt(pageSize) || 10;
  const offset = (p - 1) * ps;
  const where: string[] = [];
  const params: any[] = [];
  if (keyword) {
    where.push(`(a.archive_code LIKE ? OR a.original_name LIKE ? OR a.cert_no LIKE ? OR a.version_no LIKE ?
      OR m.part_code LIKE ? OR m.part_name LIKE ? OR m.material_code LIKE ? OR m.material_name LIKE ?
      OR m.brand LIKE ? OR COALESCE(m.spec,m.specification) LIKE ?)`);
    const kw = `%${keyword}%`;
    for (let i = 0; i < 10; i++) params.push(kw);
  }
  if (doc_type_id) { where.push('a.doc_type_id=?'); params.push(parseInt(doc_type_id)); }
  if (exclude_material_id) { where.push('a.material_id<>?'); params.push(parseInt(exclude_material_id)); }
  where.push(`a.approval_status='approved'`);
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = db.prepare(`SELECT COUNT(*) c FROM ce_material_archives a
    LEFT JOIN ce_materials m ON a.material_id=m.id ${whereStr}`).get(...params) as any;
  const total = countRow?.c || 0;

  const list = db.prepare(`SELECT a.id, a.doc_type_id, a.archive_code, a.original_name, a.file_name,
    a.file_path, a.file_size, a.file_type, a.cert_no, a.version_no, a.remarks,
    a.material_id, dt.type_name,
    COALESCE(m.part_code,m.material_code) as source_part_code,
    COALESCE(m.part_name,m.material_name) as source_part_name,
    COALESCE(m.brand,'') as source_brand,
    COALESCE(m.spec,m.specification,'') as source_spec
    FROM ce_material_archives a
    JOIN ce_doc_types dt ON a.doc_type_id=dt.id
    LEFT JOIN ce_materials m ON a.material_id=m.id
    ${whereStr}
    ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(...params, ps, offset);

  res.json({ code: 0, data: { list, total } });
});

// ============ 绑定已有存档文件到当前物料（共用文件，完全复用源文件编码/版本号信息） ============
router.post('/:materialId/archives/bind', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const materialId = parseInt(req.params.materialId);
  const { source_archive_id, cert_no, remarks } = req.body;
  if (!source_archive_id) return res.status(400).json({ code: 400, message: '请选择要绑定的存档' });

  const material = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!material) return res.status(404).json({ code: 404, message: '物料不存在' });

  const source = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix FROM ce_material_archives a
    JOIN ce_doc_types dt ON a.doc_type_id=dt.id WHERE a.id=?`).get(source_archive_id) as any;
  if (!source) return res.status(404).json({ code: 404, message: '源存档不存在' });
  if (source.approval_status !== 'approved') {
    return res.status(400).json({ code: 400, message: '只能绑定已审批通过的存档' });
  }
  if (source.material_id === materialId) {
    return res.status(400).json({ code: 400, message: '该存档已属于当前物料' });
  }

  try {
    const r = db.prepare(`INSERT INTO ce_material_archives
      (material_id, doc_type_id, archive_code, file_name, original_name, file_path, file_size, file_type,
       project_id, workstation_id, cert_no, version_no, status, approval_status, created_by, remarks, is_bound, source_archive_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft','draft',?,?, 1,?)`).run(
      materialId, source.doc_type_id, source.archive_code, source.file_name, source.original_name, source.file_path,
      source.file_size, source.file_type,
      source.project_id, source.workstation_id, cert_no || source.cert_no || '', source.version_no || '1.0',
      u.id, remarks || source.remarks || '', source_archive_id
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid, archive_code: source.archive_code, file_name: source.file_name, version_no: source.version_no } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// ============ 变更上传（上传新版本替换已审批的存档） ============
router.post('/:materialId/archives/:archiveId/change', archiveUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });
  const db = getDb();
  const u = (req as any).user;
  const materialId = parseInt(req.params.materialId);
  const oldArchiveId = parseInt(req.params.archiveId);

  const material = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!material) { try { fs.unlinkSync(req.file.path); } catch {}; return res.status(404).json({ code: 404, message: '物料不存在' }); }

  const oldArchive = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix FROM ce_material_archives a
    JOIN ce_doc_types dt ON a.doc_type_id=dt.id WHERE a.id=? AND a.material_id=?`).get(oldArchiveId, materialId) as any;
  if (!oldArchive) { try { fs.unlinkSync(req.file.path); } catch {}; return res.status(404).json({ code: 404, message: '要变更的存档不存在' }); }
  if (oldArchive.approval_status !== 'approved') {
    try { fs.unlinkSync(req.file.path); } catch {};
    return res.status(400).json({ code: 400, message: '只有已审批通过的存档才能发起变更' });
  }
  // 检查是否已有进行中的变更
  const pendingChange = db.prepare(`SELECT id FROM ce_material_archives WHERE replaces_archive_id=? AND approval_status IN ('draft','pending')`).get(oldArchiveId) as any;
  if (pendingChange) {
    try { fs.unlinkSync(req.file.path); } catch {};
    return res.status(400).json({ code: 400, message: '该存档已有待审批或草稿状态的变更版本，请先处理' });
  }

  const certNo = req.body.cert_no || oldArchive.cert_no || '';
  const changeRemark = req.body.change_remark || '';
  const projectId = req.body.project_id ? parseInt(req.body.project_id) : oldArchive.project_id;
  const workstationId = req.body.workstation_id ? parseInt(req.body.workstation_id) : oldArchive.workstation_id;
  const remarks = req.body.remarks || '';

  // 自动计算新版本号：取旧版本号中的数字，主版本号+1
  let defaultVersion = '2.0';
  const oldVer = oldArchive.version_no || '1.0';
  const verMatch = oldVer.match(/(\d+)(?:\.(\d+))?$/);
  if (verMatch) {
    const major = parseInt(verMatch[1]) + 1;
    defaultVersion = `${major}.0`;
  }
  const versionNo = req.body.version_no || defaultVersion;

  const docTypeId = oldArchive.doc_type_id;
  const dt = db.prepare('SELECT * FROM ce_doc_types WHERE id=?').get(docTypeId) as any;
  if (!dt) { try { fs.unlinkSync(req.file.path); } catch {}; return res.status(400).json({ code: 400, message: '文档类型异常' }); }

  let finalName, finalPath, archiveCode = '';
  const ext = getExt(req.file.originalname);
  const { code } = generateArchiveCode(db, docTypeId);
  archiveCode = code;
  finalName = `${code}${ext}`;
  const archivesDir = path.join(process.cwd(), 'uploads', 'ce-archives');
  if (!fs.existsSync(archivesDir)) fs.mkdirSync(archivesDir, { recursive: true });
  finalPath = path.join(archivesDir, finalName);
  fs.renameSync(req.file.path, finalPath);
  const displayName = finalName;

  try {
    const r = db.prepare(`INSERT INTO ce_material_archives
      (material_id, doc_type_id, archive_code, file_name, original_name, file_path, file_size, file_type,
       project_id, workstation_id, cert_no, version_no, status, approval_status, created_by, remarks,
       replaces_archive_id, change_remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft','draft',?,?, ?,?)`).run(
      materialId, docTypeId, archiveCode, finalName, displayName, finalPath,
      req.file.size, ext.replace('.', ''), projectId, workstationId, certNo, versionNo,
      u.id, remarks, oldArchiveId, changeRemark
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid, archive_code: archiveCode, file_name: finalName, version_no: versionNo } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// ============ 变更绑定（绑定已有文件作为新版本替换已审批的存档，复用源文件编码） ============
router.post('/:materialId/archives/:archiveId/change-bind', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const materialId = parseInt(req.params.materialId);
  const oldArchiveId = parseInt(req.params.archiveId);
  const { source_archive_id, cert_no, change_remark, remarks } = req.body;

  if (!source_archive_id) return res.status(400).json({ code: 400, message: '请选择要绑定的已有存档文件' });

  const material = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!material) return res.status(404).json({ code: 404, message: '物料不存在' });

  const oldArchive = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix FROM ce_material_archives a
    JOIN ce_doc_types dt ON a.doc_type_id=dt.id WHERE a.id=? AND a.material_id=?`).get(oldArchiveId, materialId) as any;
  if (!oldArchive) return res.status(404).json({ code: 404, message: '要变更的存档不存在' });
  if (oldArchive.approval_status !== 'approved') {
    return res.status(400).json({ code: 400, message: '只有已审批通过的存档才能发起变更' });
  }
  const pendingChange = db.prepare(`SELECT id FROM ce_material_archives WHERE replaces_archive_id=? AND approval_status IN ('draft','pending')`).get(oldArchiveId) as any;
  if (pendingChange) {
    return res.status(400).json({ code: 400, message: '该存档已有待审批或草稿状态的变更版本，请先处理' });
  }

  const source = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix FROM ce_material_archives a
    JOIN ce_doc_types dt ON a.doc_type_id=dt.id WHERE a.id=?`).get(source_archive_id) as any;
  if (!source) return res.status(404).json({ code: 404, message: '源存档不存在' });
  if (source.approval_status !== 'approved') {
    return res.status(400).json({ code: 400, message: '只能绑定已审批通过的存档' });
  }
  if (source.id === oldArchiveId) {
    return res.status(400).json({ code: 400, message: '不能绑定当前存档自身' });
  }

  // 绑定已有文件：版本号、编码完全复用源文件，不生成新版本号/新编码
  const finalVersion = source.version_no || '1.0';

  try {
    const r = db.prepare(`INSERT INTO ce_material_archives
      (material_id, doc_type_id, archive_code, file_name, original_name, file_path, file_size, file_type,
       project_id, workstation_id, cert_no, version_no, status, approval_status, created_by, remarks, is_bound, source_archive_id,
       replaces_archive_id, change_remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'draft','draft',?,?, 1,?, ?,?)`).run(
      materialId, source.doc_type_id, source.archive_code, source.file_name, source.original_name, source.file_path,
      source.file_size, source.file_type,
      source.project_id, source.workstation_id, cert_no || source.cert_no || '', finalVersion,
      u.id, remarks || source.remarks || '', source_archive_id, oldArchiveId, change_remark || ''
    );
    res.json({ code: 0, data: { id: r.lastInsertRowid, version_no: finalVersion, archive_code: source.archive_code } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除存档（仅限未受控状态：草稿/驳回）
router.delete('/archives/:id', (req: Request, res: Response) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM ce_material_archives WHERE id=?').get(req.params.id) as any;
  if (!a) return res.status(404).json({ code: 404, message: '存档不存在' });
  if (a.approval_status === 'pending') return res.status(400).json({ code: 400, message: '审批中，不能删除' });
  if (a.approval_status === 'approved') {
    return res.status(400).json({ code: 400, message: '已审批受控的存档不能直接删除，请通过变更流程替换' });
  }
  // 草稿/驳回状态可以删除：如果是变更草稿（有replaces_archive_id），直接删除即可，旧版本不受影响
  // 如果是绑定的文件或者有其他记录引用同一文件路径，不删除物理文件
  const refCount = db.prepare('SELECT COUNT(*) c FROM ce_material_archives WHERE file_path=? AND id<>?').get(a.file_path, a.id) as any;
  if (!a.is_bound && (refCount?.c || 0) <= 0) {
    try { fs.unlinkSync(a.file_path); } catch {}
  }
  db.prepare('DELETE FROM ce_material_archives WHERE id=?').run(req.params.id);
  res.json({ code: 0 });
});

// 下载存档
router.get('/archives/:id/download', (req: Request, res: Response) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM ce_material_archives WHERE id=?').get(req.params.id) as any;
  if (!a) return res.status(404).json({ code: 404, message: '存档不存在' });
  if (!fs.existsSync(a.file_path)) return res.status(404).json({ code: 404, message: '文件不存在' });
  const ext = getExt(a.file_name);
  const downloadName = (a.archive_code ? `${a.archive_code}${ext}` : a.original_name) || `archive${ext}`;
  const encoded = encodeURIComponent(downloadName);
  res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Length', a.file_size);
  fs.createReadStream(a.file_path).pipe(res);
});

// 预览存档
router.get('/archives/:id/preview', (req: Request, res: Response) => {
  const db = getDb();
  const a = db.prepare('SELECT * FROM ce_material_archives WHERE id=?').get(req.params.id) as any;
  if (!a) return res.status(404).json({ code: 404, message: '存档不存在' });
  if (!fs.existsSync(a.file_path)) return res.status(404).json({ code: 404, message: '文件不存在' });
  const ext = getExt(a.file_name);
  let ct = 'application/octet-stream';
  if (ext === '.pdf') ct = 'application/pdf';
  else if (['.jpg', '.jpeg'].includes(ext)) ct = 'image/jpeg';
  else if (ext === '.png') ct = 'image/png';
  else if (ext === '.gif') ct = 'image/gif';
  else if (ext === '.bmp') ct = 'image/bmp';
  else if (ext === '.webp') ct = 'image/webp';
  else if (ext === '.txt') ct = 'text/plain; charset=utf-8';
  else if (ext === '.svg') ct = 'image/svg+xml';
  const downloadName = (a.archive_code ? `${a.archive_code}${ext}` : a.original_name) || `preview${ext}`;
  const encoded = encodeURIComponent(downloadName);
  res.setHeader('Content-Type', ct);
  res.setHeader('Content-Disposition', `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`);
  fs.createReadStream(a.file_path).pipe(res);
});

// ============ 批量发起审批（选择多个存档一次提交） ============
router.post('/:materialId/batch-submit', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const materialId = parseInt(req.params.materialId);
  const { archive_ids, title, form_data, project_id, workstation_id } = req.body;
  if (!Array.isArray(archive_ids) || archive_ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要提交的存档' });
  }
  const material = db.prepare('SELECT *, COALESCE(part_code,material_code) as part_code, COALESCE(part_name,material_name) as part_name FROM ce_materials WHERE id=?').get(materialId) as any;
  if (!material) return res.status(404).json({ code: 404, message: '物料不存在' });
  const placeholders = archive_ids.map(() => '?').join(',');
  const archives = db.prepare(`SELECT * FROM ce_material_archives WHERE id IN (${placeholders}) AND material_id=?`)
    .all(...archive_ids, materialId) as any[];
  if (archives.length !== archive_ids.length) {
    return res.status(400).json({ code: 400, message: '存在不属于该物料的存档' });
  }
  for (const a of archives) {
    if (!['draft', 'rejected'].includes(a.approval_status)) {
      return res.status(400).json({ code: 400, message: `存档 ${a.archive_code || a.original_name} 已提交或审批中` });
    }
  }

  const batchCode = generateBatchCode(db);
  const r = db.prepare(`INSERT INTO ce_archive_batches
    (batch_code, material_id, project_id, workstation_id, title, archive_ids, status, approval_status,
     submitter_id, submitter_name, form_data)
    VALUES (?,?,?,?,?,?, 'pending','pending',?,?,?)`).run(
    batchCode, materialId, project_id || null, workstation_id || null,
    title || `${material.part_name}-CE认证资料审批`, JSON.stringify(archive_ids), u.id, u.name,
    form_data ? JSON.stringify(form_data) : null
  );
  const batchId = r.lastInsertRowid as number;

  // 更新存档关联batch、状态
  const updateStmt = db.prepare(`UPDATE ce_material_archives SET batch_id=?, approval_status='pending',
    submitted_at=datetime('now','localtime'), approval_form_data=? WHERE id=?`);
  archives.forEach(a => updateStmt.run(batchId, form_data ? JSON.stringify(form_data) : null, a.id));

  // 创建审批记录
  const flowBizId = `ce_batch_${batchId}`;
  createApprovalRecord(db, {
    module: 'ce_archive',
    business_id: flowBizId,
    title: `CE物料存档审批：${material.part_name}（${archives.length}份资料）`,
    submitter_id: u.id,
    form_data: form_data || {},
    project_id: project_id || null
  });

  db.prepare(`UPDATE ce_archive_batches SET approval_status='pending', submitted_at=datetime('now','localtime'), flow_instance_id=? WHERE id=?`)
    .run(flowBizId, batchId);

  res.json({ code: 0, data: { batch_id: batchId, batch_code: batchCode } });
});

// ============ 物料清单Excel导入 ============
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/import-materials', importUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传Excel文件' });
  const db = getDb();
  const u = (req as any).user;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (rows.length < 2) return res.status(400).json({ code: 400, message: '文件无数据' });

    const headers = (rows[0] as any[]).map(h => String(h || '').trim());
    const normalizedHeaders = headers.map(h => h.replace(/\s/g,''));
    const col = (names: string[]) => {
      for (const n of names) {
        const nn = n.replace(/\s/g,'');
        const idx = normalizedHeaders.findIndex(h => h === nn);
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g,'');
        const idx = normalizedHeaders.findIndex(h => h.startsWith(nn));
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g,'');
        const idx = normalizedHeaders.findIndex(h => h.includes(nn));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const iSort = col(['序号','sort','no','NO','行号']);
    const iNewDate = col(['新增日期','创建日期','日期']);
    const iCat = col(['类别','分类','category','类型','物料类别']);
    const iCode = col(['品号','料号','物料编号','物料编码','partcode','code','编号','物料品号','物料号','物料代码','物料料号']);
    const iName = col(['品名','名称','物料名称','name','description','物料品名','物料描述','物料名称规格']);
    const iSpec = col(['规格','spec','型号','规格型号','specification']);
    const iAlt = col(['替代','alternative','替换','兼容','欧洲出口替代','替代型号','替代料号']);
    const iBrand = col(['品牌','brand','manufacturer','厂家','厂商','供应商品牌']);
    const iSelector = col(['选型','selector','开发','设计','工程师','选型人','选型负责人']);
    const iPurchaser = col(['采购','purchaser','buyer','采购员','采购负责人']);
    const iRemark = col(['备注','remark','note','说明','remark']);
    // 是否存档、是否合规、南德、欧测 不在物料清单导入时读取
    const iStatus = col(['状态','status','工作状态']);

    // 第一遍：统计规格重复情况（用于处理空品号行）
    const specCountMap: Record<string, number> = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] as any[];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
      const spec = iSpec >= 0 ? String(row[iSpec] || '').trim() : '';
      const partCode = iCode >= 0 ? String(row[iCode] || '').trim() : '';
      const partName = iName >= 0 ? String(row[iName] || '').trim() : '';
      if (!spec) continue;
      // 只统计有效行（有品名或品号的行）
      if (!partName && !partCode) continue;
      specCountMap[spec] = (specCountMap[spec] || 0) + 1;
    }

    let inserted = 0, updated = 0, skipped = 0;
    const ins = db.prepare(`INSERT INTO ce_materials
      (sort_no, sort_order, part_code, material_code, part_name, material_name, spec, specification,
       brand, category, alternative_model, selector_name, purchaser_name,
       remarks, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const updByCode = db.prepare(`UPDATE ce_materials SET sort_no=?, sort_order=?, part_name=?, material_name=?,
      spec=?, specification=?, brand=?, category=?, alternative_model=?,
      selector_name=?, purchaser_name=?, remarks=?, updated_at=datetime('now','localtime')
      WHERE (part_code IS NOT NULL AND part_code != '' AND part_code=?) OR (material_code IS NOT NULL AND material_code != '' AND material_code=?)`);
    const updByName = db.prepare(`UPDATE ce_materials SET sort_no=?, sort_order=?, spec=?, specification=?,
      brand=?, category=?, alternative_model=?, selector_name=?, purchaser_name=?, remarks=?,
      updated_at=datetime('now','localtime')
      WHERE (part_code IS NULL OR part_code='') AND (material_code IS NULL OR material_code='')
        AND (part_name=? OR material_name=?) AND COALESCE(spec,specification)=?`);

    const tx = db.transaction(() => {
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as any[];
        if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
        const sortNo = iSort >= 0 ? parseInt(row[iSort]) || 0 : r;
        const rawCode = iCode >= 0 ? String(row[iCode] || '').trim() : '';
        // 处理空品号：空字符串、null、"\\" 都视为空
        const partCode = (rawCode === '' || rawCode === '\\' || rawCode === '/') ? '' : rawCode;
        const partName = iName >= 0 ? String(row[iName] || '').trim() : '';
        if (!partName && !partCode) continue;
        const spec = iSpec >= 0 ? String(row[iSpec] || '').trim() : '';
        const brand = iBrand >= 0 ? String(row[iBrand] || '').trim() : '';
        const cat = iCat >= 0 ? String(row[iCat] || '').trim() : '';
        const alt = iAlt >= 0 ? String(row[iAlt] || '').trim() : '';
        const sel = iSelector >= 0 ? String(row[iSelector] || '').trim() : '';
        const pur = iPurchaser >= 0 ? String(row[iPurchaser] || '').trim() : '';
        const rmk = iRemark >= 0 ? String(row[iRemark] || '').trim() : '';

        let existed: any;
        if (partCode) {
          existed = db.prepare('SELECT * FROM ce_materials WHERE part_code=? OR material_code=?').get(partCode, partCode);
        }
        if (!existed && partName && !partCode) {
          existed = db.prepare("SELECT * FROM ce_materials WHERE (part_code IS NULL OR part_code='') AND (material_code IS NULL OR material_code='') AND (part_name=? OR material_name=?) AND COALESCE(spec,specification)=?").get(partName, partName, spec);
        }
        if (existed) {
          if (partCode) {
            updByCode.run(sortNo, sortNo, partName || existed.part_name, partName || existed.part_name,
              spec, spec, brand, cat, alt, sel, pur, rmk, partCode, partCode);
          } else {
            updByName.run(sortNo, sortNo, spec, spec, brand, cat, alt, sel, pur, rmk, partName, partName, spec);
          }
          updated++;
        } else {
          // 空品号处理：检查规格是否在Excel中有重复
          if (!partCode && spec) {
            const specCount = specCountMap[spec] || 0;
            if (specCount > 1) {
              // 规格重复的空品号行：仍然导入，但在备注中标注
              const note = `[规格重复-${specCount}处] ${rmk}`.trim();
              ins.run(sortNo, sortNo, '', '', partName, partName, spec, spec,
                brand, cat, alt, sel, pur, note, u.id);
              inserted++;
            } else {
              // 规格唯一的空品号行：正常导入
              ins.run(sortNo, sortNo, '', '', partName, partName, spec, spec,
                brand, cat, alt, sel, pur, rmk, u.id);
              inserted++;
            }
          } else if (!partCode && !spec) {
            // 空品号且无规格：按品名+规格查找不到，跳过
            if (!partName) {
              skipped++;
              continue;
            }
            // 仅品名无规格无品号：仍尝试导入
            ins.run(sortNo, sortNo, '', '', partName, partName, '', '',
              brand, cat, alt, sel, pur, rmk, u.id);
            inserted++;
          } else {
            ins.run(sortNo, sortNo, partCode, partCode, partName, partName, spec, spec,
              brand, cat, alt, sel, pur, rmk, u.id);
            inserted++;
          }
        }
      }
    });
    tx();
    res.json({ code: 0, data: { inserted, updated, skipped, total: inserted + updated + skipped } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 物料清单模板下载
router.get('/import-materials/template', (_req: Request, res: Response) => {
  const headers = ['序号','新增日期','类别','物料品号','物料品名','物料规格','替代型号','品牌','选型\n负责人','采购','CE认证报告','DOC自我声明','英文说明书','测试报告','是否存档','是否合规','南德','欧测','状态','备注'];
  const sample1 = [1,'2024/1/15','电气','B0300107075','PLC_1513','6ES7 513-1AM03-0AB0','','西门子','徐群建','黎俊梅','','','','','未存档','待确认','未确认','未确认','已完成',''];
  const sample2 = [2,'2024/1/15','电气','B0300107028','ET200SP Profinet总线接口模块','6ES7155-6AA02-0BN0','','西门子','徐群建','黎俊梅','CE0001（西门子CE证书 S7-1500）','CE0001（西门子CE证书 S7-1500）','CE0001（西门子CE证书 S7-1500）英文说明书6ES75131AM030AB0','','已存档','合规','认可','认可','已完成',''];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  ws['!cols'] = [{wch:6},{wch:12},{wch:8},{wch:16},{wch:28},{wch:24},{wch:18},{wch:10},{wch:12},{wch:10},{wch:28},{wch:28},{wch:28},{wch:28},{wch:10},{wch:10},{wch:8},{wch:8},{wch:8},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '物料清单总表');
  const noteHeaders = ['说明项','内容'];
  const notes = [
    ['1. 序号','序号，可留空，导入时会自动生成'],
    ['2. 新增日期','格式：YYYY/MM/DD，可留空'],
    ['3. 类别','物料类别，如：电气、机械、液压等，可留空'],
    ['4. 物料品号','物料品号，作为唯一匹配依据。空白或"\\"视为无品号'],
    ['5. 物料品名','物料名称，必填（品号和品名至少有一项）'],
    ['6. 物料规格','物料规格型号，可留空'],
    ['7. 替代型号','欧洲出口替代型号，可留空'],
    ['8. 品牌','物料品牌，可留空'],
    ['9. 选型负责人','选型工程师，可留空'],
    ['10. 采购','采购负责人，可留空'],
    ['11. CE认证报告','CE证书文件名（含扩展名），用于文档批量导入时匹配文件，可留空'],
    ['12. DOC自我声明','DOC/符合性声明文件名（含扩展名），可留空'],
    ['13. 英文说明书','英文说明书文件名（含扩展名），可留空'],
    ['14. 测试报告','检测报告文件名（含扩展名），可留空'],
    ['15. 是否存档','可选值：已存档、未存档、没有证书/DOC、没有英文说明书'],
    ['16. 是否合规','可选值：合规、不合规、偏差、不需要、待确认'],
    ['17. 南德','可选值：认可、偏差认可、不认可、-、未确认'],
    ['18. 欧测','可选值：认可、偏差认可、不认可、-、未确认'],
    ['19. 状态','可选值：已完成、进行中、已取消等，可留空'],
    ['20. 备注','备注信息，可留空']
  ];
  const ws2 = XLSX.utils.aoa_to_sheet([noteHeaders, ...notes]);
  ws2['!cols'] = [{wch:14},{wch:70}];
  XLSX.utils.book_append_sheet(wb, ws2, '存档及合规说明');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = encodeURIComponent('CE物料清单导入模板.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ce_materials_template.xlsx"; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// ============ 批量导入文件资料（仅管理员，Excel+文件夹方式） ============
let bulkTmpDir: string | null = null;
const bulkArchiveUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!bulkTmpDir) {
        bulkTmpDir = path.join(archivesDir, `_bulk_tmp_${Date.now()}_${Math.round(Math.random()*1e6)}`);
        if (!fs.existsSync(bulkTmpDir)) fs.mkdirSync(bulkTmpDir, { recursive: true });
      }
      (_req as any)._bulkTmpDir = bulkTmpDir;
      cb(null, bulkTmpDir);
    },
    filename: (_req, file, cb) => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const basename = path.basename(originalName);
      cb(null, basename);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 2000 }
});

router.post('/bulk-import-archives', requireRole('admin'), (req: Request, res: Response, next: NextFunction) => {
  bulkTmpDir = null;
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
}, bulkArchiveUpload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'files', maxCount: 2000 }
]), (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const excelFile = files?.excel?.[0];
  const archiveFiles = files?.files || [];
  if (!excelFile) return res.status(400).json({ code: 400, message: '请上传Excel清单文件' });
  if (archiveFiles.length === 0) return res.status(400).json({ code: 400, message: '请选择包含文件的文件夹' });

  const db = getDb();
  const u = (req as any).user;
  const tmpDir = (req as any)._bulkTmpDir as string;

  try {
    // 文件映射：去掉扩展名的文件名（小写）→ 文件条目
    const fileMap: Record<string, { path: string; size: number; originalname: string }> = {};
    // 全映射：保留扩展名（用于精确含扩展名匹配）
    const fileMapWithExt: Record<string, { path: string; size: number; originalname: string }> = {};
    archiveFiles.forEach(f => {
      const origName = f.filename;
      const bn = path.basename(origName);
      const bnLower = bn.toLowerCase();
      // 去掉扩展名
      const extIdx = bn.lastIndexOf('.');
      const bnNoExt = extIdx > 0 ? bn.substring(0, extIdx) : bn;
      const bnNoExtLower = bnNoExt.toLowerCase();
      const entry = { path: f.path, size: f.size, originalname: origName };
      if (!fileMap[bnNoExtLower]) fileMap[bnNoExtLower] = entry;
      if (!fileMapWithExt[bnLower]) fileMapWithExt[bnLower] = entry;
    });

    // 完全匹配：文件名（忽略扩展名，忽略大小写）完全一致
    const exactMatchFile = (excelText: string): { path: string; size: number; originalname: string } | null => {
      if (!excelText) return null;
      const text = excelText.trim();
      const textLower = text.toLowerCase();

      // 1. 含扩展名精确匹配
      if (fileMapWithExt[textLower]) return fileMapWithExt[textLower];

      // 2. 去掉扩展名后匹配
      const extIdx = text.lastIndexOf('.');
      const textNoExt = extIdx > 0 ? text.substring(0, extIdx) : text;
      const textNoExtLower = textNoExt.toLowerCase();
      if (fileMap[textNoExtLower]) return fileMap[textNoExtLower];

      return null;
    };

    const docTypes = db.prepare('SELECT * FROM ce_doc_types WHERE is_enabled=1').all() as any[];
    const dtByCode: Record<string, any> = {};
    docTypes.forEach(dt => {
      dtByCode[dt.type_code] = dt;
    });

    const docTypeColumns = [
      { colNames: ['CE证书', 'ce', 'cert', 'CE认证报告', 'ce认证', 'CE认证'], typeCode: '001' },
      { colNames: ['DOC', 'doc', '符合性声明', 'DOC自我声明', '自我声明'], typeCode: '002' },
      { colNames: ['英文说明书', '说明书', 'manual', 'instruction'], typeCode: '004' },
      { colNames: ['检测报告', '报告', 'test', 'report', '测试报告'], typeCode: '003' }
    ];

    const wb = XLSX.readFile(excelFile.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (rows.length < 2) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ code: 400, message: 'Excel文件无数据行' });
    }

    const headers = (rows[0] as any[]).map(h => String(h || '').trim());
    const normalizedHeaders = headers.map(h => h.replace(/\s/g,''));
    const col = (names: string[]) => {
      for (const n of names) {
        const nn = n.replace(/\s/g,'').toLowerCase();
        const idx = normalizedHeaders.findIndex(h => h.toLowerCase() === nn);
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g,'').toLowerCase();
        const idx = normalizedHeaders.findIndex(h => h.toLowerCase().startsWith(nn));
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g,'').toLowerCase();
        const idx = normalizedHeaders.findIndex(h => h.toLowerCase().includes(nn));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const parseStatusValue = (text: string, map: Record<string, { label: string }>): string | null => {
      if (!text || !text.trim()) return null;
      const t = text.trim();
      for (const [k, v] of Object.entries(map)) {
        if (v.label === t || k === t.toLowerCase()) return k;
      }
      return null;
    };

    const iSort = col(['序号','sort','行号','no']);
    const iMatCode = col(['物料品号','品号','料号','物料编号','物料编码','partcode','code','物料号','物料代码','物料料号']);
    const iMatName = col(['物料品名','品名','物料名称','名称','name','description','物料描述']);
    const iCat = col(['类别','分类','category','类型','物料类别']);
    const iSpec = col(['规格','spec','型号','规格型号','specification','物料规格']);
    const iBrand = col(['品牌','brand','manufacturer','厂家','厂商']);
    const iAlt = col(['替代','alternative','替换','兼容','替代型号']);
    const iSelector = col(['选型','selector','选型人','选型负责人','工程师']);
    const iPurchaser = col(['采购','purchaser','buyer','采购员']);
    const iNande = col(['南德','nande','TUV']);
    const iOuce = col(['欧测','ouce','认证机构']);
    const iCompliance = col(['合规状态','合规','compliance','是否合规']);
    const iArchiveStatus = col(['存档状态','存档','archive']);
    const iRemark = col(['备注','remark','note','说明']);

    const colMap: { typeCode: string; colIdx: number; docType: any }[] = [];
    docTypeColumns.forEach(dtc => {
      const idx = col(dtc.colNames);
      if (idx >= 0 && dtByCode[dtc.typeCode]) {
        colMap.push({ typeCode: dtc.typeCode, colIdx: idx, docType: dtByCode[dtc.typeCode] });
      }
    });

    if (iMatCode < 0) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ code: 400, message: 'Excel中未找到"物料品号"列，请检查模板格式' });
    }

    const results: { row: number; success: boolean; message: string; data?: any }[] = [];
    let successCount = 0, failCount = 0;

    const tx = db.transaction(() => {
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as any[];
        if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

        const rowNo = iSort >= 0 ? (parseInt(row[iSort]) || r) : r;
        const rawCode = iMatCode >= 0 ? String(row[iMatCode] || '').trim() : '';
        // 处理空品号：空字符串、null、"\\" 都视为空
        const matCode = (rawCode === '' || rawCode === '\\' || rawCode === '/') ? '' : rawCode;
        const matName = iMatName >= 0 ? String(row[iMatName] || '').trim() : '';
        const catText = iCat >= 0 ? String(row[iCat] || '').trim() : '';
        const specText = iSpec >= 0 ? String(row[iSpec] || '').trim() : '';
        const brandText = iBrand >= 0 ? String(row[iBrand] || '').trim() : '';
        const altText = iAlt >= 0 ? String(row[iAlt] || '').trim() : '';
        const selText = iSelector >= 0 ? String(row[iSelector] || '').trim() : '';
        const purText = iPurchaser >= 0 ? String(row[iPurchaser] || '').trim() : '';
        const nandeText = iNande >= 0 ? String(row[iNande] || '').trim() : '';
        const ouceText = iOuce >= 0 ? String(row[iOuce] || '').trim() : '';
        const complianceText = iCompliance >= 0 ? String(row[iCompliance] || '').trim() : '';
        const archiveStatusText = iArchiveStatus >= 0 ? String(row[iArchiveStatus] || '').trim() : '';
        const remark = iRemark >= 0 ? String(row[iRemark] || '').trim() : '';

        try {
          let material: any;
          if (matCode) {
            material = db.prepare('SELECT * FROM ce_materials WHERE part_code=? OR material_code=?').get(matCode, matCode) as any;
          } else if (specText && matName) {
            // 品号为空，优先用规格+品名精确匹配（匹配品号为空的物料）
            material = db.prepare("SELECT * FROM ce_materials WHERE (part_code IS NULL OR part_code='') AND (material_code IS NULL OR material_code='') AND (part_name=? OR material_name=?) AND COALESCE(spec,specification)=?").get(matName, matName, specText) as any;
          }
          // 品号为空，规格匹配（不论物料品号是否为空，也不论品名是否匹配）
          if (!material && specText) {
            const candidates = db.prepare("SELECT * FROM ce_materials WHERE COALESCE(spec,specification)=?").all(specText) as any[];
            if (candidates.length === 1) {
              material = candidates[0];
            } else if (candidates.length > 1) {
              // 如果有多个同规格的物料，优先匹配品号为空的；如果还有多个则报错
              const emptyCodeCandidates = candidates.filter((c: any) => !c.part_code && !c.material_code);
              if (emptyCodeCandidates.length === 1) {
                material = emptyCodeCandidates[0];
              } else {
                throw new Error(`规格"${specText}"在系统中匹配到${candidates.length}个物料，请补充物料品号或品名以便精确匹配`);
              }
            }
          }
          // 品号为空，规格未匹配到，尝试用品名匹配空品号的物料
          if (!material && !specText && matName) {
            material = db.prepare("SELECT * FROM ce_materials WHERE (part_code IS NULL OR part_code='') AND (material_code IS NULL OR material_code='') AND (part_name=? OR material_name=?)").get(matName, matName) as any;
          }

          if (!material) {
            if (matCode) {
              throw new Error(`未找到品号为"${matCode}"的物料`);
            } else if (specText) {
              throw new Error(`未找到物料规格为"${specText}"的物料`);
            } else if (matName) {
              throw new Error(`未找到品名为"${matName}"且物料品号为空的物料`);
            } else {
              throw new Error('物料品号、品名、规格均为空，无法匹配');
            }
          }

          // 更新物料基础信息（如果Excel中有提供）
          if (catText || specText || brandText || altText || selText || purText || matName) {
            const updateFields: string[] = [];
            const updateParams: any[] = [];
            if (catText) { updateFields.push('category=?'); updateParams.push(catText); }
            if (specText) { updateFields.push('spec=?, specification=?'); updateParams.push(specText, specText); }
            if (brandText) { updateFields.push('brand=?'); updateParams.push(brandText); }
            if (altText) { updateFields.push('alternative_model=?'); updateParams.push(altText); }
            if (selText) { updateFields.push('selector_name=?'); updateParams.push(selText); }
            if (purText) { updateFields.push('purchaser_name=?'); updateParams.push(purText); }
            if (matName) { updateFields.push('part_name=?, material_name=?'); updateParams.push(matName, matName); }
            if (matCode) { updateFields.push('part_code=?, material_code=?'); updateParams.push(matCode, matCode); }
            if (updateFields.length > 0) {
              updateParams.push(material.id);
              db.prepare(`UPDATE ce_materials SET ${updateFields.join(', ')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...updateParams);
            }
          }

          const importedFiles: any[] = [];
          const skippedFiles: string[] = [];

          for (const cm of colMap) {
            const excelValue = String(row[cm.colIdx] || '').trim();
            if (!excelValue) continue;

            // 完全匹配（忽略扩展名和大小写）
            const fileEntry: { path: string; size: number; originalname: string } | null = exactMatchFile(excelValue);

            if (!fileEntry) {
              skippedFiles.push(`${cm.docType.type_name}列：未找到匹配文件 "${excelValue.substring(0, 40)}${excelValue.length > 40 ? '...' : ''}"`);
              continue;
            }

            const matchedFileName = fileEntry.originalname;
            const ext = getExt(matchedFileName);
            const { code: archiveCode } = generateArchiveCode(db, cm.docType.id);
            const finalName = `${archiveCode}${ext}`;
            const finalPath = path.join(archivesDir, finalName);
            fs.copyFileSync(fileEntry.path, finalPath);

            const insR = db.prepare(`INSERT INTO ce_material_archives
              (material_id, doc_type_id, archive_code, file_name, original_name, file_path, file_size, file_type,
               version_no, status, approval_status, created_by, remarks, approved_at, approver_id, approver_name)
              VALUES (?,?,?,?,?,?,?,?,?, 'active','approved',?,?,datetime('now','localtime'),?,?)`).run(
              material.id, cm.docType.id, archiveCode, finalName, matchedFileName, finalPath,
              fileEntry.size, ext.replace('.', ''), '1.0', u.id, remark, u.id, u.name || u.username
            );

            importedFiles.push({
              id: insR.lastInsertRowid,
              archive_code: archiveCode,
              doc_type: cm.docType.type_name,
              file: matchedFileName
            });
          }

          if (importedFiles.length === 0 && skippedFiles.length === 0) {
            throw new Error('未填写任何文件名称（CE证书/DOC/英文说明书/检测报告）');
          }
          if (importedFiles.length === 0 && skippedFiles.length > 0) {
            // 所有填写的文件都未能匹配，仍然标记为成功以更新物料信息
          }

          const nandeVal = parseStatusValue(nandeText, NANDE_STATUS_MAP);
          const ouceVal = parseStatusValue(ouceText, OUCE_STATUS_MAP);
          const complianceVal = parseStatusValue(complianceText, COMPLIANCE_STATUS_MAP);
          let archiveVal = parseStatusValue(archiveStatusText, ARCHIVE_STATUS_MANUAL_MAP);

          const docTypeCodes = importedFiles.map(f => {
            const typeCodeMap: Record<string, string> = { 'CE证书': '001', 'DOC': '002', '检测报告': '003', '英文说明书': '004' };
            return typeCodeMap[f.doc_type];
          });
          const hasCE = docTypeCodes.includes('001');
          const hasDOC = docTypeCodes.includes('002');
          const hasManual = docTypeCodes.includes('004');
          if (!archiveVal) {
            if (hasCE && hasDOC && hasManual) {
              archiveVal = 'archived';
            } else if (!hasCE && !hasDOC) {
              archiveVal = 'no_cert';
            } else if (!hasManual) {
              archiveVal = 'no_manual';
            } else {
              archiveVal = material.archive_status_manual;
            }
          }

          db.prepare(`UPDATE ce_materials SET
            nande_status = COALESCE(?, nande_status),
            ouce_status = COALESCE(?, ouce_status),
            compliance_status = COALESCE(?, compliance_status),
            archive_status_manual = COALESCE(?, archive_status_manual),
            updated_at = datetime('now','localtime')
            WHERE id = ?`).run(nandeVal, ouceVal, complianceVal, archiveVal, material.id);

          const updatedStatuses: string[] = [];
          if (nandeVal) updatedStatuses.push(`南德=${NANDE_STATUS_MAP[nandeVal].label}`);
          if (ouceVal) updatedStatuses.push(`欧测=${OUCE_STATUS_MAP[ouceVal].label}`);
          if (complianceVal) updatedStatuses.push(`合规=${COMPLIANCE_STATUS_MAP[complianceVal].label}`);
          if (archiveVal) updatedStatuses.push(`存档=${ARCHIVE_STATUS_MANUAL_MAP[archiveVal].label}`);

          results.push({
            row: rowNo, success: true,
            message: `成功导入${importedFiles.length}个文件${updatedStatuses.length > 0 ? '，状态已更新：' + updatedStatuses.join('，') : ''}${skippedFiles.length > 0 ? '。跳过：' + skippedFiles.join('；') : ''}`,
            data: { material: matCode, material_name: material.part_name || material.material_name, files: importedFiles, skipped: skippedFiles }
          });
          successCount++;
        } catch (e: any) {
          results.push({ row: rowNo, success: false, message: e.message || '导入失败' });
          failCount++;
        }
      }
    });
    tx();

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    res.json({
      code: 0,
      data: {
        success: successCount,
        fail: failCount,
        total: successCount + failCount,
        imported_files: results.reduce((sum, r) => sum + (r.success ? (r.data?.files?.length || 1) : 0), 0),
        details: results
      }
    });
  } catch (e: any) {
    try { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    res.status(500).json({ code: 500, message: e.message || '批量导入失败' });
  }
});

// ============ 批量导入文件资料 - 分批上传模式（跨机器部署） ============
// 步骤1: POST /bulk-import-archives-upload  分批上传Excel和文件（用batchId关联）
// 步骤2: POST /bulk-import-archives-process 全部上传完后统一处理

const batchUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const batchId = _req.body.batchId || 'default';
      const batchDir = path.join(archivesDir, `_batch_${batchId}`);
      if (!fs.existsSync(batchDir)) fs.mkdirSync(batchDir, { recursive: true });
      (_req as any)._batchDir = batchDir;
      cb(null, batchDir);
    },
    filename: (_req, file, cb) => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const basename = path.basename(originalName);
      cb(null, basename);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 50 }
});

// 分批上传
router.post('/bulk-import-archives-upload', requireRole('admin'), batchUpload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'files', maxCount: 50 }
]), (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const excelFile = files?.excel?.[0];
  const archiveFiles = files?.files || [];
  const batchDir = (req as any)._batchDir as string;

  let excelUploaded = false;
  if (excelFile) {
    // 重命名Excel文件为固定名称
    const excelPath = path.join(batchDir, '_excel.xlsx');
    if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
    fs.renameSync(excelFile.path, excelPath);
    excelUploaded = true;
  }

  res.json({
    code: 0,
    data: {
      batchId: req.body.batchId,
      excelUploaded,
      filesReceived: archiveFiles.length
    }
  });
});

// 取消分批上传（清理临时目录）
router.post('/bulk-import-archives-cancel', requireRole('admin'), (req: Request, res: Response) => {
  const batchId = req.body.batchId || '';
  if (!batchId) return res.json({ code: 0 });
  const batchDir = path.join(archivesDir, `_batch_${batchId}`);
  try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch {}
  res.json({ code: 0 });
});

// 统一处理
router.post('/bulk-import-archives-process', requireRole('admin'), (req: Request, res: Response) => {
  const batchId = req.body.batchId || '';
  if (!batchId) return res.status(400).json({ code: 400, message: '缺少batchId' });

  const batchDir = path.join(archivesDir, `_batch_${batchId}`);
  if (!fs.existsSync(batchDir)) return res.status(400).json({ code: 400, message: '批次目录不存在' });

  const excelPath = path.join(batchDir, '_excel.xlsx');
  if (!fs.existsSync(excelPath)) {
    return res.status(400).json({ code: 400, message: '未找到Excel文件，请先上传' });
  }

  const db = getDb();
  const u = (req as any).user;

  try {
    // 扫描批次目录下的所有文件（排除Excel）
    const allFiles: string[] = [];
    fs.readdirSync(batchDir).forEach(fn => {
      if (fn === '_excel.xlsx') return;
      const fp = path.join(batchDir, fn);
      if (fs.statSync(fp).isFile()) allFiles.push(fp);
    });
    console.log(`[批量导入-分批处理] batchId=${batchId}, 文件数=${allFiles.length}`);

    // 文件映射
    const fileMap: Record<string, { path: string; size: number; originalname: string }> = {};
    const fileMapWithExt: Record<string, { path: string; size: number; originalname: string }> = {};
    allFiles.forEach(fp => {
      const bn = path.basename(fp);
      const bnLower = bn.toLowerCase();
      const extIdx = bn.lastIndexOf('.');
      const bnNoExt = extIdx > 0 ? bn.substring(0, extIdx) : bn;
      const bnNoExtLower = bnNoExt.toLowerCase();
      const fstat = fs.statSync(fp);
      const entry = { path: fp, size: fstat.size, originalname: bn };
      if (!fileMap[bnNoExtLower]) fileMap[bnNoExtLower] = entry;
      if (!fileMapWithExt[bnLower]) fileMapWithExt[bnLower] = entry;
    });

    const exactMatchFile = (excelText: string): { path: string; size: number; originalname: string } | null => {
      if (!excelText) return null;
      const text = excelText.trim();
      const textLower = text.toLowerCase();
      if (fileMapWithExt[textLower]) return fileMapWithExt[textLower];
      const extIdx = text.lastIndexOf('.');
      const textNoExt = extIdx > 0 ? text.substring(0, extIdx) : text;
      const textNoExtLower = textNoExt.toLowerCase();
      if (fileMap[textNoExtLower]) return fileMap[textNoExtLower];
      return null;
    };

    const docTypes = db.prepare('SELECT * FROM ce_doc_types WHERE is_enabled=1').all() as any[];
    const dtByCode: Record<string, any> = {};
    docTypes.forEach(dt => { dtByCode[dt.type_code] = dt; });

    const docTypeColumns = [
      { colNames: ['CE证书', 'ce', 'cert', 'CE认证报告', 'ce认证', 'CE认证'], typeCode: '001' },
      { colNames: ['DOC', 'doc', '符合性声明', 'DOC自我声明', '自我声明'], typeCode: '002' },
      { colNames: ['英文说明书', '说明书', 'manual', 'instruction'], typeCode: '004' },
      { colNames: ['检测报告', '报告', 'test', 'report', '测试报告'], typeCode: '003' }
    ];

    const wb = XLSX.readFile(excelPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (rows.length < 2) {
      try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ code: 400, message: 'Excel文件无数据行' });
    }

    const headers = (rows[0] as any[]).map(h => String(h || '').trim());
    const normalizedHeaders = headers.map(h => h.replace(/\s/g, ''));
    const col = (names: string[]) => {
      for (const n of names) {
        const nn = n.replace(/\s/g, '').toLowerCase();
        const idx = normalizedHeaders.findIndex(h => h.toLowerCase() === nn);
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g, '').toLowerCase();
        const idx = normalizedHeaders.findIndex(h => h.toLowerCase().startsWith(nn));
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g, '').toLowerCase();
        const idx = normalizedHeaders.findIndex(h => h.toLowerCase().includes(nn));
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const parseStatusValue = (text: string, map: Record<string, { label: string }>): string | null => {
      if (!text || !text.trim()) return null;
      const t = text.trim();
      for (const [k, v] of Object.entries(map)) {
        if (v.label === t || k === t.toLowerCase()) return k;
      }
      return null;
    };

    const iSort = col(['序号', 'sort', '行号', 'no']);
    const iNewDate = col(['新增日期', '创建日期', '日期']);
    const iMatCode = col(['物料品号', '品号', '料号', '物料编号', '物料编码', 'partcode', 'code', '物料号', '物料代码', '物料料号']);
    const iMatName = col(['物料品名', '品名', '物料名称', '名称', 'name', 'description', '物料描述']);
    const iCat = col(['类别', '分类', 'category', '类型', '物料类别']);
    const iSpec = col(['规格', 'spec', '型号', '规格型号', 'specification', '物料规格']);
    const iBrand = col(['品牌', 'brand', 'manufacturer', '厂家', '厂商']);
    const iAlt = col(['替代', 'alternative', '替换', '兼容', '替代型号']);
    const iSelector = col(['选型', 'selector', '选型人', '选型负责人', '工程师']);
    const iPurchaser = col(['采购', 'purchaser', 'buyer', '采购员']);
    const iCEReport = col(['CE认证报告', 'CE证书', 'ce', 'cert', 'CE认证', 'CE']);
    const iDoc = col(['DOC自我声明', 'DOC', 'doc', '符合性声明', '自我声明']);
    const iManual = col(['英文说明书', '说明书', 'manual', 'instruction']);
    const iTestReport = col(['测试报告', '检测报告', '报告', 'test', 'report']);
    const iNande = col(['南德', 'nande', 'TUV']);
    const iOuce = col(['欧测', 'ouce', '认证机构']);
    const iCompliance = col(['合规状态', '合规', 'compliance', '是否合规']);
    const iArchiveStatus = col(['存档状态', '存档', 'archive', '是否存档']);
    const iStatus = col(['状态', 'status', '工作状态']);
    const iRemark = col(['备注', 'remark', 'note', '说明']);

    const colMap: { typeCode: string; colIdx: number; docType: any }[] = [];
    docTypeColumns.forEach(dtc => {
      const idx = col(dtc.colNames);
      if (idx >= 0 && dtByCode[dtc.typeCode]) {
        colMap.push({ typeCode: dtc.typeCode, colIdx: idx, docType: dtByCode[dtc.typeCode] });
      }
    });

    if (iMatCode < 0) {
      try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch {}
      return res.status(400).json({ code: 400, message: 'Excel中未找到"物料品号"列，请检查模板格式' });
    }

    // 规格查重
    const specCountMap: Record<string, number> = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] as any[];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
      const spec = iSpec >= 0 ? String(row[iSpec] || '').trim() : '';
      if (spec) specCountMap[spec] = (specCountMap[spec] || 0) + 1;
    }

    const results: { row: number; success: boolean; message: string; data?: any }[] = [];
    let successCount = 0, failCount = 0;

    const tx = db.transaction(() => {
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as any[];
        if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

        const rowNo = iSort >= 0 ? (parseInt(row[iSort]) || r) : r;
        const rawCode = iMatCode >= 0 ? String(row[iMatCode] || '').trim() : '';
        const matCode = (rawCode === '' || rawCode === '\\' || rawCode === '/') ? '' : rawCode;
        const matName = iMatName >= 0 ? String(row[iMatName] || '').trim() : '';
        const catText = iCat >= 0 ? String(row[iCat] || '').trim() : '';
        const specText = iSpec >= 0 ? String(row[iSpec] || '').trim() : '';
        const brandText = iBrand >= 0 ? String(row[iBrand] || '').trim() : '';
        const altText = iAlt >= 0 ? String(row[iAlt] || '').trim() : '';
        const selText = iSelector >= 0 ? String(row[iSelector] || '').trim() : '';
        const purText = iPurchaser >= 0 ? String(row[iPurchaser] || '').trim() : '';
        const nandeText = iNande >= 0 ? String(row[iNande] || '').trim() : '';
        const ouceText = iOuce >= 0 ? String(row[iOuce] || '').trim() : '';
        const complianceText = iCompliance >= 0 ? String(row[iCompliance] || '').trim() : '';
        const archiveStatusText = iArchiveStatus >= 0 ? String(row[iArchiveStatus] || '').trim() : '';
        let remark = iRemark >= 0 ? String(row[iRemark] || '').trim() : '';

        try {
          let material: any;
          if (matCode) {
            material = db.prepare('SELECT * FROM ce_materials WHERE part_code=? OR material_code=?').get(matCode, matCode) as any;
          } else if (specText && matName) {
            // 品号为空，优先用规格+品名精确匹配（匹配品号为空的物料）
            material = db.prepare("SELECT * FROM ce_materials WHERE (part_code IS NULL OR part_code='') AND (material_code IS NULL OR material_code='') AND (part_name=? OR material_name=?) AND COALESCE(spec,specification)=?").get(matName, matName, specText) as any;
          }
          // 品号为空，规格匹配（不论物料品号是否为空，也不论品名是否匹配）
          if (!material && specText) {
            const candidates = db.prepare("SELECT * FROM ce_materials WHERE COALESCE(spec,specification)=?").all(specText) as any[];
            if (candidates.length === 1) {
              material = candidates[0];
            } else if (candidates.length > 1) {
              // 如果有多个同规格的物料，优先匹配品号为空的；如果还有多个则报错
              const emptyCodeCandidates = candidates.filter((c: any) => !c.part_code && !c.material_code);
              if (emptyCodeCandidates.length === 1) {
                material = emptyCodeCandidates[0];
              } else {
                throw new Error(`规格"${specText}"在系统中匹配到${candidates.length}个物料，请补充物料品号或品名以便精确匹配`);
              }
            }
          }
          // 品号为空，规格未匹配到，尝试用品名匹配空品号的物料
          if (!material && !specText && matName) {
            material = db.prepare("SELECT * FROM ce_materials WHERE (part_code IS NULL OR part_code='') AND (material_code IS NULL OR material_code='') AND (part_name=? OR material_name=?)").get(matName, matName) as any;
          }

          if (!material) {
            if (matCode) {
              throw new Error(`未找到品号为"${matCode}"的物料`);
            } else if (specText) {
              throw new Error(`未找到物料规格为"${specText}"的物料`);
            } else if (matName) {
              throw new Error(`未找到品名为"${matName}"且物料品号为空的物料`);
            } else {
              throw new Error('物料品号、品名、规格均为空，无法匹配');
            }
          }

          if (!matCode && specText && specCountMap[specText] > 1) {
            remark = (remark ? remark + '；' : '') + `规格"${specText}"在表中重复出现${specCountMap[specText]}次`;
          }

          if (catText || specText || brandText || altText || selText || purText || matName) {
            const updateFields: string[] = [];
            const updateParams: any[] = [];
            if (catText) { updateFields.push('category=?'); updateParams.push(catText); }
            if (specText) { updateFields.push('spec=?, specification=?'); updateParams.push(specText, specText); }
            if (brandText) { updateFields.push('brand=?'); updateParams.push(brandText); }
            if (altText) { updateFields.push('alternative_model=?'); updateParams.push(altText); }
            if (selText) { updateFields.push('selector_name=?'); updateParams.push(selText); }
            if (purText) { updateFields.push('purchaser_name=?'); updateParams.push(purText); }
            if (matName) { updateFields.push('part_name=?, material_name=?'); updateParams.push(matName, matName); }
            if (matCode) { updateFields.push('part_code=?, material_code=?'); updateParams.push(matCode, matCode); }
            if (updateFields.length > 0) {
              updateParams.push(material.id);
              db.prepare(`UPDATE ce_materials SET ${updateFields.join(', ')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...updateParams);
            }
          }

          const importedFiles: any[] = [];
          const skippedFiles: string[] = [];

          for (const cm of colMap) {
            const excelValue = String(row[cm.colIdx] || '').trim();
            if (!excelValue) continue;

            const fileEntry: { path: string; size: number; originalname: string } | null = exactMatchFile(excelValue);

            if (!fileEntry) {
              skippedFiles.push(`${cm.docType.type_name}列：未找到匹配文件 "${excelValue.substring(0, 40)}${excelValue.length > 40 ? '...' : ''}"`);
              continue;
            }

            const matchedFileName = fileEntry.originalname;
            const ext = getExt(matchedFileName);
            const { code: archiveCode } = generateArchiveCode(db, cm.docType.id);
            const finalName = `${archiveCode}${ext}`;
            const finalPath = path.join(archivesDir, finalName);
            fs.copyFileSync(fileEntry.path, finalPath);

            const insR = db.prepare(`INSERT INTO ce_material_archives
              (material_id, doc_type_id, archive_code, file_name, original_name, file_path, file_size, file_type,
               version_no, status, approval_status, created_by, remarks, approved_at, approver_id, approver_name)
              VALUES (?,?,?,?,?,?,?,?,?, 'active','approved',?,?,datetime('now','localtime'),?,?)`).run(
              material.id, cm.docType.id, archiveCode, finalName, matchedFileName, finalPath,
              fileEntry.size, ext.replace('.', ''), '1.0', u.id, remark, u.id, u.name || u.username
            );

            importedFiles.push({
              id: insR.lastInsertRowid,
              archive_code: archiveCode,
              doc_type: cm.docType.type_name,
              file: matchedFileName
            });
          }

          if (importedFiles.length === 0 && skippedFiles.length === 0) {
            throw new Error('未填写任何文件名称（CE证书/DOC/英文说明书/检测报告）');
          }

          const nandeVal = parseStatusValue(nandeText, NANDE_STATUS_MAP);
          const ouceVal = parseStatusValue(ouceText, OUCE_STATUS_MAP);
          const complianceVal = parseStatusValue(complianceText, COMPLIANCE_STATUS_MAP);
          let archiveVal = parseStatusValue(archiveStatusText, ARCHIVE_STATUS_MANUAL_MAP);

          const docTypeCodes = importedFiles.map(f => {
            const typeCodeMap: Record<string, string> = { 'CE证书': '001', 'DOC': '002', '检测报告': '003', '英文说明书': '004' };
            return typeCodeMap[f.doc_type];
          });
          const hasCE = docTypeCodes.includes('001');
          const hasDOC = docTypeCodes.includes('002');
          const hasManual = docTypeCodes.includes('004');
          if (!archiveVal) {
            if (hasCE && hasDOC && hasManual) archiveVal = 'archived';
            else if (!hasCE && !hasDOC) archiveVal = 'no_cert';
            else if (!hasManual) archiveVal = 'no_manual';
            else archiveVal = material.archive_status_manual;
          }

          db.prepare(`UPDATE ce_materials SET
            nande_status = COALESCE(?, nande_status),
            ouce_status = COALESCE(?, ouce_status),
            compliance_status = COALESCE(?, compliance_status),
            archive_status_manual = COALESCE(?, archive_status_manual),
            updated_at = datetime('now','localtime')
            WHERE id = ?`).run(nandeVal, ouceVal, complianceVal, archiveVal, material.id);

          const updatedStatuses: string[] = [];
          if (nandeVal) updatedStatuses.push(`南德=${NANDE_STATUS_MAP[nandeVal].label}`);
          if (ouceVal) updatedStatuses.push(`欧测=${OUCE_STATUS_MAP[ouceVal].label}`);
          if (complianceVal) updatedStatuses.push(`合规=${COMPLIANCE_STATUS_MAP[complianceVal].label}`);
          if (archiveVal) updatedStatuses.push(`存档=${ARCHIVE_STATUS_MANUAL_MAP[archiveVal].label}`);

          results.push({
            row: rowNo, success: true,
            message: `成功导入${importedFiles.length}个文件${updatedStatuses.length > 0 ? '，状态已更新：' + updatedStatuses.join('，') : ''}${skippedFiles.length > 0 ? '。跳过：' + skippedFiles.join('；') : ''}`,
            data: {
              material: matCode,
              material_name: material.part_name || material.material_name,
              files: importedFiles,
              skipped: skippedFiles,
              // 按导入模板列结构返回原始Excel数据
              new_date: iNewDate >= 0 ? String(row[iNewDate] || '').trim() : '',
              category: catText,
              spec: specText,
              alternative: altText,
              brand: brandText,
              selector: selText,
              purchaser: purText,
              ce_report: iCEReport >= 0 ? String(row[iCEReport] || '').trim() : '',
              doc: iDoc >= 0 ? String(row[iDoc] || '').trim() : '',
              manual: iManual >= 0 ? String(row[iManual] || '').trim() : '',
              test_report: iTestReport >= 0 ? String(row[iTestReport] || '').trim() : '',
              archive_status: archiveStatusText,
              compliance: complianceText,
              nande: nandeText,
              ouce: ouceText,
              status: iStatus >= 0 ? String(row[iStatus] || '').trim() : '',
              remark
            }
          });
          successCount++;
        } catch (e: any) {
          results.push({
            row: rowNo, success: false, message: e.message || '导入失败',
            data: {
              material: matCode,
              material_name: matName,
              new_date: iNewDate >= 0 ? String(row[iNewDate] || '').trim() : '',
              category: catText,
              spec: specText,
              alternative: altText,
              brand: brandText,
              selector: selText,
              purchaser: purText,
              ce_report: iCEReport >= 0 ? String(row[iCEReport] || '').trim() : '',
              doc: iDoc >= 0 ? String(row[iDoc] || '').trim() : '',
              manual: iManual >= 0 ? String(row[iManual] || '').trim() : '',
              test_report: iTestReport >= 0 ? String(row[iTestReport] || '').trim() : '',
              archive_status: archiveStatusText,
              compliance: complianceText,
              nande: nandeText,
              ouce: ouceText,
              status: iStatus >= 0 ? String(row[iStatus] || '').trim() : '',
              remark
            }
          });
          failCount++;
        }
      }
    });
    tx();

    // 清理批次临时目录
    try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch {}

    console.log(`[批量导入-分批处理] batchId=${batchId} 完成：成功${successCount}条，失败${failCount}条`);

    res.json({
      code: 0,
      data: {
        success: successCount,
        fail: failCount,
        total: successCount + failCount,
        imported_files: results.reduce((sum, r) => sum + (r.success ? (r.data?.files?.length || 1) : 0), 0),
        details: results
      }
    });
  } catch (e: any) {
    console.error(`[批量导入-分批处理] 异常:`, e.message);
    res.status(500).json({ code: 500, message: e.message || '批量导入失败' });
  }
});

// 文件资料批量导入模板下载（仅管理员）
router.get('/bulk-import-archives/template', requireRole('admin'), (_req: Request, res: Response) => {
  const headers = ['序号','新增日期','类别','物料品号','物料品名','物料规格','替代型号','品牌','选型\n负责人','采购','CE认证报告','DOC自我声明','英文说明书','测试报告','是否存档','是否合规','南德','欧测','状态','备注'];
  const sample1 = [1,'2024/1/15','电气','B0300107075','PLC_1513','6ES7 513-1AM03-0AB0','','西门子','徐群建','黎俊梅','CE0001（西门子CE证书 S7-1500）','CE0001（西门子CE证书 S7-1500）','CE0001（西门子CE证书 S7-1500）英文说明书6ES75131AM030AB0','','已存档','合规','认可','认可','已完成','西门子PLC模块CE资料'];
  const sample2 = [2,'2024/1/15','电气','B0300107028','ET200SP Profinet总线接口模块','6ES7155-6AA02-0BN0','','西门子','徐群建','黎俊梅','','CE0002（西门子CE证书 ET 200SP）','CE0002（西门子CE证书 ET 200SP）英文说明书6ES71556AA020BN0','','已存档','合规','认可','认可','已完成',''];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  ws['!cols'] = [{wch:6},{wch:12},{wch:8},{wch:16},{wch:28},{wch:24},{wch:18},{wch:10},{wch:12},{wch:10},{wch:28},{wch:28},{wch:28},{wch:28},{wch:10},{wch:10},{wch:8},{wch:8},{wch:8},{wch:24}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '物料清单总表');
  const noteHeaders = ['说明项','内容'];
  const notes = [
    ['1. 序号','序号，可留空，导入时会自动生成'],
    ['2. 新增日期','格式：YYYY/MM/DD，可留空'],
    ['3. 类别','物料类别，如：电气、机械、液压等，可留空'],
    ['4. 物料品号','按CE物料品号精确匹配，必填，作为唯一匹配依据'],
    ['5. 物料品名','物料名称，可留空'],
    ['6. 物料规格','物料规格型号，可留空'],
    ['7. 替代型号','欧洲出口替代型号，可留空'],
    ['8. 品牌','物料品牌，可留空'],
    ['9. 选型负责人','选型工程师，可留空'],
    ['10. 采购','采购负责人，可留空'],
    ['11. CE认证报告','填写CE证书文件的文件名（含扩展名），可留空'],
    ['12. DOC自我声明','填写DOC/符合性声明文件的文件名（含扩展名），可留空'],
    ['13. 英文说明书','填写英文说明书文件的文件名（含扩展名），可留空'],
    ['14. 测试报告','填写检测报告文件的文件名（含扩展名），可留空'],
    ['15. 是否存档','可选值：已存档、未存档、没有证书/DOC、没有英文说明书，可留空（系统根据导入文件自动判断）'],
    ['16. 是否合规','可选值：合规、不合规、偏差、不需要，可留空（不更新）'],
    ['17. 南德','可选值：认可、偏差认可、不认可、-，可留空（不更新）'],
    ['18. 欧测','可选值：认可、偏差认可、不认可、-，可留空（不更新）'],
    ['19. 状态','可选值：已完成、进行中、已取消等，可留空'],
    ['20. 备注','备注信息，可留空'],
    ['21. 文件夹选择','点击"选择文件夹"按钮，选择存放所有待导入文件的文件夹（支持子文件夹）'],
    ['22. 文件查找','系统将在选择的文件夹及其所有子文件夹中按文件名查找文件'],
    ['23. 文件重命名','找到的文件将按照系统编码规则自动重命名后存入存档库'],
    ['24. 自动判断存档状态','未填写存档状态时，若CE+DOC+英文说明书都已导入则自动标记为"已存档"'],
    ['25. 权限','只有系统管理员可以使用此功能'],
    ['26. 导入结果','导入的存档均为草稿状态，需手动提交审批']
  ];
  const ws2 = XLSX.utils.aoa_to_sheet([noteHeaders, ...notes]);
  ws2['!cols'] = [{wch:14},{wch:70}];
  XLSX.utils.book_append_sheet(wb, ws2, '存档及合规说明');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = encodeURIComponent('CE物料文档批量导入模板.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ce_archives_bulk_template.xlsx"; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// ============ 获取项目工位列表 ============
router.get('/projects/:projectId/workstations', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const projectId = parseInt(req.params.projectId);
    const workstations = db.prepare(`
      SELECT id, station_code, station_name, description, sort_order
      FROM workstations
      WHERE project_id = ? ORDER BY sort_order ASC, id ASC
    `).all(projectId);
    res.json({ code: 0, data: workstations });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// ============ 项目BOM导入（需要project+workstation） ============
router.post('/projects/:projectId/import-bom', importUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传Excel文件' });
  const db = getDb();
  const u = (req as any).user;
  const projectId = parseInt(req.params.projectId);
  const workstationId = req.body.workstation_id ? parseInt(req.body.workstation_id) : null;
  const batch = `BOM_${Date.now()}`;

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (rows.length < 2) return res.status(400).json({ code: 400, message: '文件无数据' });
    const headers = (rows[0] as any[]).map(h => String(h || '').trim());
    const normalizedHeaders = headers.map(h => h.replace(/\s/g,''));
    const col = (names: string[]) => {
      for (const n of names) {
        const nn = n.replace(/\s/g,'');
        const idx = normalizedHeaders.findIndex(h => h === nn);
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g,'');
        const idx = normalizedHeaders.findIndex(h => h.startsWith(nn));
        if (idx >= 0) return idx;
      }
      for (const n of names) {
        const nn = n.replace(/\s/g,'');
        const idx = normalizedHeaders.findIndex(h => h.includes(nn));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const iRow = col(['序号','行号','bom行','no','项次']);
    const iCode = col(['物料编码','物料编号','料号','编码','code','partcode','品号','物料号','物料代码']);
    const iName = col(['物料名称','名称','品名','name','description','物料品名']);
    const iSpec = col(['规格','spec','型号','规格型号','specification']);
    const iBrand = col(['品牌','brand','manufacturer','厂家','厂商']);
    const iQty = col(['数量','qty','用量','number','个数']);

    const project = db.prepare('SELECT project_code, project_name FROM projects WHERE id=?').get(projectId) as any;
    const workstation = workstationId ? db.prepare('SELECT station_code, station_name FROM workstations WHERE id=?').get(workstationId) as any : null;

    let ceBomId: number;
    let existingBom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND (workstation_id=? OR (? IS NULL AND workstation_id IS NULL))`).get(projectId, workstationId, workstationId) as any;
    if (existingBom) {
      if (existingBom.status === 'approved') {
        return res.status(400).json({ code: 400, message: 'BOM已受控，不能直接导入。请先发起变更后再导入。' });
      }
      if (existingBom.status === 'pending') {
        return res.status(400).json({ code: 400, message: 'BOM审批中，不能导入新物料。' });
      }
      ceBomId = existingBom.id;
    } else {
      const bomCode = `BOM-${project?.project_code || 'P'}${workstationId ? '-' + (workstation?.station_code || 'W') : ''}`;
      const result = db.prepare(`INSERT INTO ce_project_bom (project_id, workstation_id, bom_code, status, version_no, version_label, created_by)
        VALUES (?,?,?, 'draft', 1, 'V1', ?)`).run(projectId, workstationId, bomCode, u.id);
      ceBomId = result.lastInsertRowid as number;
    }

    let matched = 0, added = 0, unmatched = 0;
    const tx = db.transaction(() => {
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as any[];
        if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
        const bomRowNo = iRow >= 0 ? parseInt(row[iRow]) || r : r;
        const partCode = iCode >= 0 ? String(row[iCode] || '').trim() : '';
        const partName = iName >= 0 ? String(row[iName] || '').trim() : '';
        const spec = iSpec >= 0 ? String(row[iSpec] || '').trim() : '';
        const brand = iBrand >= 0 ? String(row[iBrand] || '').trim() : '';
        const qty = iQty >= 0 ? parseFloat(row[iQty]) || 1 : 1;
        if (!partCode && !partName) continue;

        let ceMat: any = null;
        if (partCode) ceMat = db.prepare('SELECT * FROM ce_materials WHERE part_code=? OR material_code=?').get(partCode, partCode);
        if (!ceMat && partName && spec) ceMat = db.prepare('SELECT * FROM ce_materials WHERE (part_name=? OR material_name=?) AND COALESCE(spec,specification)=?').get(partName, partName, spec);

        let ceMatId: number | null = null;
        let matchStatus = 'unmatched';
        if (ceMat) {
          ceMatId = ceMat.id;
          matchStatus = 'matched';
          matched++;
          if (brand && (!ceMat.brand || ceMat.brand === '' || ceMat.brand === '-')) {
            db.prepare(`UPDATE ce_materials SET brand=? WHERE id=?`).run(brand, ceMat.id);
          }
        } else {
          unmatched++;
        }

        const existing = db.prepare(`SELECT id FROM ce_project_bom_items WHERE ce_bom_id=? AND part_code=? AND is_deleted=0`).get(ceBomId, partCode);
        if (existing) continue;

        db.prepare(`INSERT INTO ce_project_bom_items
          (project_id, workstation_id, ce_bom_id, material_id, bom_row_no, part_code, part_name, part_spec, brand, qty,
           match_status, ce_material_id, import_batch_id, created_by, is_deleted)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
          .run(projectId, workstationId, ceBomId, ceMatId, bomRowNo, partCode, partName, spec, brand, qty, matchStatus, ceMatId, batch, u.id);
      }
      db.prepare(`UPDATE ce_project_bom SET updated_at=datetime('now','localtime') WHERE id=?`).run(ceBomId);
    });
    tx();
    res.json({ code: 0, data: { batch_id: batch, matched, added, unmatched, ce_bom_id: ceBomId } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 项目BOM匹配列表
router.get('/projects/:projectId/bom-items', (req: Request, res: Response) => {
  const db = getDb();
  const { workstation_id: wsIdParam = '', match_status = '', page = '1', page_size = '50' } = req.query as any;
  const projectId = parseInt(req.params.projectId);
  const p = parseInt(page) || 1, ps = parseInt(page_size) || 50;
  const workstationId = wsIdParam ? parseInt(wsIdParam as string) : null;

  // 自动修复孤儿数据：如果没有ce_project_bom记录但有ce_bom_id为NULL的items，自动创建并关联
  const ensureBomExists = (wId: number | null): number => {
    let bom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND (workstation_id=? OR (? IS NULL AND workstation_id IS NULL)) ORDER BY id DESC LIMIT 1`)
      .get(projectId, wId, wId) as any;
    if (bom) return bom.id;
    const orphanCount = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND (? IS NULL OR workstation_id=?)`)
      .get(projectId, wId, wId) as any).c;
    if (orphanCount === 0 && wId !== null) {
      const noWsOrphan = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND workstation_id IS NULL`)
        .get(projectId) as any).c;
      if (noWsOrphan > 0) {
        bom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND workstation_id IS NULL ORDER BY id DESC LIMIT 1`).get(projectId) as any;
        if (bom) return bom.id;
      }
    }
    const project = db.prepare('SELECT project_code FROM projects WHERE id=?').get(projectId) as any;
    let bomCode = `BOM-${project?.project_code || 'P'}`;
    if (wId) {
      const ws = db.prepare('SELECT station_code FROM workstations WHERE id=?').get(wId) as any;
      bomCode += ws ? '-' + ws.station_code : '';
    }
    const result = db.prepare(`INSERT INTO ce_project_bom (project_id, workstation_id, bom_code, status, version_no, version_label, created_at, updated_at)
      VALUES (?,?,?, 'draft', 1, 'V1', datetime('now','localtime'), datetime('now','localtime'))`).run(projectId, wId, bomCode);
    const newBomId = result.lastInsertRowid as number;
    db.prepare(`UPDATE ce_project_bom_items SET ce_bom_id=? WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND (? IS NULL OR workstation_id=?)`)
      .run(newBomId, projectId, wId, wId);
    if (wId !== null) {
      const noWsOrphanAfter = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND workstation_id IS NULL`)
        .get(projectId) as any).c;
      if (noWsOrphanAfter > 0) {
        const noWsBom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND workstation_id IS NULL ORDER BY id DESC LIMIT 1`).get(projectId) as any;
        if (!noWsBom) {
          const r2 = db.prepare(`INSERT INTO ce_project_bom (project_id, workstation_id, bom_code, status, version_no, version_label, created_at, updated_at)
            VALUES (?,NULL,?, 'draft', 1, 'V1', datetime('now','localtime'), datetime('now','localtime'))`).run(projectId, `BOM-${project?.project_code || 'P'}`);
          db.prepare(`UPDATE ce_project_bom_items SET ce_bom_id=? WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND workstation_id IS NULL`)
            .run(r2.lastInsertRowid, projectId);
        } else {
          db.prepare(`UPDATE ce_project_bom_items SET ce_bom_id=? WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND workstation_id IS NULL`)
            .run(noWsBom.id, projectId);
        }
      }
    }
    return newBomId;
  };

  const ceBomId = ensureBomExists(workstationId);

  const bomInfo = db.prepare(`SELECT * FROM ce_project_bom WHERE id=?`).get(ceBomId) as any;

  const where = ['bi.ce_bom_id = ?', 'bi.is_deleted = 0'];
  const params: any[] = [ceBomId];
  if (match_status) { where.push('bi.match_status = ?'); params.push(match_status); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items bi ${whereSql}`).get(...params) as any).c;
  const list = db.prepare(`SELECT bi.*,
      COALESCE(m.part_name,m.material_name) ce_name,
      COALESCE(m.spec,m.specification) ce_spec,
      m.brand ce_brand, m.compliance_status,
      m.archive_status_manual, m.nande_status, m.ouce_status,
      m.alternative_suggestion, m.alternative_model,
      m.approval_remark, m.reject_reason, m.remarks,
      COALESCE(m.part_code,m.material_code) ce_part_code,
      (SELECT GROUP_CONCAT(dt.type_name || ':' || a.original_name, ' | ') FROM ce_material_archives a
         JOIN ce_doc_types dt ON a.doc_type_id=dt.id WHERE a.material_id=bi.ce_material_id AND a.approval_status='approved') archive_names,
      w.station_code workstation_code, w.station_name workstation_name,
      cb.status as bom_status, cb.version_no, cb.version_label, cb.approval_record_id as bom_approval_record_id
    FROM ce_project_bom_items bi
    LEFT JOIN ce_materials m ON bi.ce_material_id=m.id
    LEFT JOIN workstations w ON bi.workstation_id=w.id
    LEFT JOIN ce_project_bom cb ON bi.ce_bom_id=cb.id
    ${whereSql} ORDER BY bi.bom_row_no, bi.id LIMIT ? OFFSET ?`).all(...params, ps, (p - 1) * ps);

  const stats = {
    total,
    matched: (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items bi WHERE bi.ce_bom_id=? AND bi.is_deleted=0 AND bi.match_status='matched'`).get(ceBomId) as any).c,
    unmatched: (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items bi WHERE bi.ce_bom_id=? AND bi.is_deleted=0 AND bi.match_status='unmatched'`).get(ceBomId) as any).c,
    added: (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items bi WHERE bi.ce_bom_id=? AND bi.is_deleted=0 AND bi.match_status='added'`).get(ceBomId) as any).c,
  };

  res.json({ code: 0, data: { list, total, page: p, page_size: ps, bom_info: bomInfo || null, stats } });
});

// BOM项手动匹配
router.post('/bom-items/:id/match', (req: Request, res: Response) => {
  const db = getDb();
  const { ce_material_id } = req.body;
  if (!ce_material_id) return res.status(400).json({ code: 400, message: '请选择CE物料' });
  const ceMat = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(ce_material_id);
  if (!ceMat) return res.status(404).json({ code: 404, message: 'CE物料不存在' });
  const bomItem = db.prepare('SELECT * FROM ce_project_bom_items WHERE id=?').get(req.params.id);
  if (!bomItem) return res.status(404).json({ code: 404, message: 'BOM项不存在' });
  const bi = bomItem as any;
  const cm = ceMat as any;
  if (bi.brand && (!cm.brand || cm.brand === '')) {
    db.prepare(`UPDATE ce_materials SET brand=? WHERE id=?`).run(bi.brand, ce_material_id);
  }
  db.prepare(`UPDATE ce_project_bom_items SET ce_material_id=?, match_status='matched', material_id=? WHERE id=?`)
    .run(ce_material_id, ce_material_id, req.params.id);
  res.json({ code: 0 });
});

router.post('/projects/:projectId/bom-items/add-to-ce', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要添加的BOM项' });
  }

  let added = 0, alreadyMatched = 0;
  const tx = db.transaction(() => {
    for (const bomItemId of ids) {
      const bomItem = db.prepare(`SELECT * FROM ce_project_bom_items WHERE id=? AND match_status='unmatched'`).get(bomItemId);
      if (!bomItem) {
        const existing = db.prepare(`SELECT * FROM ce_project_bom_items WHERE id=?`).get(bomItemId);
        if (existing && (existing as any).match_status !== 'unmatched') alreadyMatched++;
        continue;
      }
      const bi = bomItem as any;
      const existingByCode = bi.part_code ? db.prepare('SELECT id FROM ce_materials WHERE part_code=? OR material_code=?').get(bi.part_code, bi.part_code) : null;
      if (existingByCode) {
        db.prepare(`UPDATE ce_project_bom_items SET ce_material_id=?, match_status='matched', material_id=? WHERE id=?`)
          .run((existingByCode as any).id, (existingByCode as any).id, bomItemId);
        if (bi.brand && (!(existingByCode as any).brand || (existingByCode as any).brand === '')) {
          db.prepare(`UPDATE ce_materials SET brand=? WHERE id=?`).run(bi.brand, (existingByCode as any).id);
        }
      } else {
        const result = db.prepare(`INSERT INTO ce_materials (sort_no, sort_order, part_code, material_code, part_name, material_name,
          spec, specification, brand, category,
          compliance_status, nande_status, ouce_status, archive_status_manual, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'pending','pending','pending','not_archived',?)`)
          .run(bi.bom_row_no || 0, bi.bom_row_no || 0, bi.part_code, bi.part_code, bi.part_name, bi.part_name,
               bi.part_spec || '', bi.part_spec || '', bi.brand || '', '', u.id);
        const newMatId = result.lastInsertRowid;
        db.prepare(`UPDATE ce_project_bom_items SET ce_material_id=?, match_status='added', material_id=? WHERE id=?`)
          .run(newMatId, newMatId, bomItemId);
        added++;
      }
    }
  });
  tx();
  res.json({ code: 0, data: { added, alreadyMatched } });
});

// BOM模板
router.get('/projects/:projectId/import-bom/template', (_req: Request, res: Response) => {
  const headers = ['序号','物料编码','物料名称','规格型号','品牌','数量'];
  const sample1 = [1,'B0300107075','PLC_1513','6ES7 513-1AM03-0AB0','西门子',1];
  const sample2 = [2,'B0300107028','ET200SP_Profinet总线接口模块','6ES7155-6AA02-0BN0','西门子',2];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  ws['!cols'] = [{wch:6},{wch:18},{wch:30},{wch:26},{wch:12},{wch:8}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BOM清单');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const fname = encodeURIComponent('CE项目BOM导入模板.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ce_bom_template.xlsx"; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// 导出项目BOM清单
router.get('/projects/:projectId/export-bom', (req: Request, res: Response) => {
  const db = getDb();
  const projectId = parseInt(req.params.projectId);
  const { workstation_id = '' } = req.query as any;
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId) as any;
  const where = ['bi.project_id = ?'];
  const params: any[] = [projectId];
  if (workstation_id) { where.push('bi.workstation_id = ?'); params.push(workstation_id); }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const list = db.prepare(`SELECT bi.*,
      COALESCE(m.part_name,m.material_name) ce_name,
      COALESCE(m.spec,m.specification) ce_spec,
      m.brand ce_brand, COALESCE(m.part_code,m.material_code) ce_part_code,
      m.compliance_status, m.archive_status_manual, m.nande_status, m.ouce_status, m.alternative_suggestion,
      w.station_code workstation_code, w.station_name workstation_name
    FROM ce_project_bom_items bi
    LEFT JOIN ce_materials m ON bi.ce_material_id=m.id
    LEFT JOIN workstations w ON bi.workstation_id=w.id
    ${whereSql} ORDER BY bi.workstation_id, bi.bom_row_no, bi.id`).all(...params) as any[];

  const headers = ['序号','工位','BOM行号','物料编码','物料名称','规格型号','品牌','数量','匹配状态',
    'CE物料品号','CE物料规格','CE品牌','南德','欧测','是否合规','存档状态','替代型号建议','存档资料'];
  const data: any[][] = [headers];
  list.forEach((bi, i) => {
    let archivesStr = '';
    if (bi.ce_material_id) {
      const archives = db.prepare(`SELECT dt.type_name, a.archive_code, a.original_name
        FROM ce_material_archives a JOIN ce_doc_types dt ON a.doc_type_id=dt.id
        WHERE a.material_id=? AND a.approval_status='approved' ORDER BY dt.sort_order`).all(bi.ce_material_id) as any[];
      archivesStr = archives.map(a => `${a.type_name}:${a.archive_code} ${a.original_name}`).join('\n');
    }
    data.push([
      i + 1, bi.workstation_name || '', bi.bom_row_no || '', bi.part_code || '', bi.part_name || '',
      bi.part_spec || '', bi.brand || '', bi.qty || 1,
      bi.match_status === 'matched' ? '已匹配' : bi.match_status === 'added' ? '新增' : '未匹配',
      bi.ce_name || '', bi.ce_spec || '', bi.ce_brand || '',
      NANDE_STATUS_MAP[bi.nande_status]?.label || '',
      OUCE_STATUS_MAP[bi.ouce_status]?.label || '',
      COMPLIANCE_STATUS_MAP[bi.compliance_status]?.label || '',
      ARCHIVE_STATUS_MANUAL_MAP[bi.archive_status_manual]?.label || '',
      bi.alternative_suggestion || '', archivesStr
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:6},{wch:18},{wch:8},{wch:16},{wch:26},{wch:24},{wch:10},{wch:8},{wch:10},
    {wch:22},{wch:24},{wch:10},{wch:10},{wch:10},{wch:10},{wch:18},{wch:20},{wch:50}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CE项目BOM');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const pname = proj?.project_name || 'project';
  const fname = encodeURIComponent(`CE-BOM_${pname}_${new Date().toISOString().slice(0,10)}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ce_bom_export.xlsx"; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// ============ 单存档提交审批（兼容旧逻辑，内部转为batch） ============
router.post('/archives/:id/submit', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const archiveId = parseInt(req.params.id);
  const a = db.prepare('SELECT * FROM ce_material_archives WHERE id=?').get(archiveId) as any;
  if (!a) return res.status(404).json({ code: 404, message: '存档不存在' });
  if (!['draft', 'rejected'].includes(a.approval_status)) {
    return res.status(400).json({ code: 400, message: '该存档已提交或审批中' });
  }
  const material = db.prepare('SELECT *, COALESCE(part_code,material_code) as part_code, COALESCE(part_name,material_name) as part_name FROM ce_materials WHERE id=?').get(a.material_id) as any;
  if (!material) return res.status(404).json({ code: 404, message: '物料不存在' });

  const batchCode = generateBatchCode(db);
  const dt = db.prepare('SELECT type_name FROM ce_doc_types WHERE id=?').get(a.doc_type_id) as any;
  const typeName = dt?.type_name || '资料';
  const displayName = a.archive_code ? `${typeName}-${a.archive_code}` : a.original_name;
  const r = db.prepare(`INSERT INTO ce_archive_batches
    (batch_code, material_id, project_id, workstation_id, title, archive_ids, status, approval_status,
     submitter_id, submitter_name)
    VALUES (?,?,?,?,?,?, 'pending','pending',?,?)`).run(
    batchCode, a.material_id, a.project_id || null, a.workstation_id || null,
    `${material.part_name}-${displayName}-CE认证资料审批`, JSON.stringify([archiveId]), u.id, u.name
  );
  const batchId = r.lastInsertRowid as number;

  db.prepare(`UPDATE ce_material_archives SET batch_id=?, approval_status='pending',
    submitted_at=datetime('now','localtime'), submitter_id=?, submitter_name=? WHERE id=?`)
    .run(batchId, u.id, u.name, archiveId);

  const flowBizId = `ce_batch_${batchId}`;
  createApprovalRecord(db, {
    module: 'ce_archive',
    business_id: flowBizId,
    title: `CE物料存档审批：${material.part_name}（${displayName}）`,
    submitter_id: u.id,
    form_data: {},
    project_id: a.project_id || null
  });

  db.prepare(`UPDATE ce_archive_batches SET approval_status='pending', submitted_at=datetime('now','localtime'), flow_instance_id=? WHERE id=?`)
    .run(flowBizId, batchId);

  res.json({ code: 0, data: { batch_id: batchId, batch_code: batchCode } });
});

// ============ 待审批存档列表（包含批次信息） ============
router.get('/pending-archives/list', (_req: Request, res: Response) => {
  const db = getDb();
  const list = db.prepare(`SELECT a.*, dt.type_name, dt.code_prefix,
      COALESCE(m.part_code,m.material_code) as part_code,
      COALESCE(m.part_name,m.material_name) as part_name,
      m.brand, COALESCE(m.spec,m.specification) as spec,
      m.nande_status, m.ouce_status, m.compliance_status, m.archive_status_manual, m.alternative_suggestion,
      p.project_code, p.project_name,
      b.batch_code, b.title as batch_title, b.approval_status as batch_approval_status
    FROM ce_material_archives a
    JOIN ce_doc_types dt ON a.doc_type_id=dt.id
    JOIN ce_materials m ON a.material_id=m.id
    LEFT JOIN projects p ON a.project_id=p.id
    LEFT JOIN ce_archive_batches b ON a.batch_id=b.id
    WHERE a.approval_status='pending'
    ORDER BY a.submitted_at DESC`).all();
  res.json({ code: 0, data: list });
});

// ============ 直接审批CE存档（按批次统一审批，与审批中心逻辑一致） ============
router.post('/archives/:id/direct-approve', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const archiveId = parseInt(req.params.id);
  const { action, nande_status, ouce_status, archive_status_manual, alternative_suggestion, approval_remark, reject_reason } = req.body;

  const archive = db.prepare('SELECT * FROM ce_material_archives WHERE id=?').get(archiveId) as any;
  if (!archive) return res.status(404).json({ code: 404, message: '存档不存在' });
  if (archive.approval_status !== 'pending') {
    return res.status(400).json({ code: 400, message: '该存档不在待审批状态' });
  }

  const approverName = u.name || u.username;
  const batchId = typeof archive.batch_id === 'string' ? parseInt(archive.batch_id) : archive.batch_id;

  if (!batchId) {
    return res.status(400).json({ code: 400, message: '该存档未关联审批批次' });
  }

  const batch = db.prepare('SELECT * FROM ce_archive_batches WHERE id=?').get(batchId) as any;
  if (!batch) return res.status(404).json({ code: 404, message: '审批批次不存在' });

  const archiveIds = JSON.parse(batch.archive_ids || '[]');
  if (archiveIds.length === 0) {
    return res.status(400).json({ code: 400, message: '批次中无存档记录' });
  }

  try {
    const tx = db.transaction(() => {
      // 同步更新审批流记录（与审批中心一致）
      const updateApprovalFlow = (isApprove: boolean, reason?: string) => {
        const flowBizId = `ce_batch_${batchId}`;
        const approvalRecord = db.prepare(`SELECT * FROM approval_records WHERE module='ce_archive' AND record_id=?`).get(flowBizId) as any;
        if (approvalRecord) {
          const newStatus = isApprove ? 'approved' : 'rejected';
          const now = new Date();
          const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);
          db.prepare(`UPDATE approval_records SET status=?, approved_at=datetime('now','localtime'), reject_reason=?, updated_at=datetime('now','localtime') WHERE id=?`)
            .run(newStatus, isApprove ? null : (reason || null), approvalRecord.id);
          const step = db.prepare(`SELECT * FROM approval_step_records WHERE approval_record_id=? AND status='pending' ORDER BY step_index LIMIT 1`).get(approvalRecord.id) as any;
          if (step) {
            db.prepare(`UPDATE approval_step_records SET status=?, approver_id=?, approver_name=?, approved_at=datetime('now','localtime'), comment=? WHERE id=?`)
              .run(newStatus, u.id, approverName, reason || null, step.id);
          }
        }
      };

      if (action === 'approve') {
        const fd = { nande_status: nande_status || 'pending', ouce_status: ouce_status || 'pending', archive_status_manual: archive_status_manual || 'archived', alternative_suggestion, approval_remark };
        // 审批通过 → 合规状态自动设为合规（与审批中心一致）
        const compliance_status = 'compliant';

        // 更新物料状态
        db.prepare(`UPDATE ce_materials SET
            nande_status=?, ouce_status=?, archive_status_manual=?, compliance_status=?,
            alternative_model=COALESCE(?, alternative_model), alternative_suggestion=?, approval_remark=?, reject_reason=NULL,
            updated_at=datetime('now','localtime') WHERE id=?`)
          .run(nande_status || 'pending', ouce_status || 'pending', archive_status_manual || 'archived', compliance_status,
               alternative_suggestion || null, alternative_suggestion || null, approval_remark || null, batch.material_id);

        // 更新批次为approved
        db.prepare(`UPDATE ce_archive_batches SET status='approved', approval_status='approved',
            approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
            reject_reason=NULL, form_data=? WHERE id=?`)
          .run(u.id, approverName, JSON.stringify(fd), batchId);

        // 批次内所有关联存档都改为approved
        const updArch = db.prepare(`UPDATE ce_material_archives SET status='approved',
            approval_status='approved', approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
            approval_form_data=? WHERE id=?`);
        archiveIds.forEach((aid: number) => updArch.run(u.id, approverName, JSON.stringify(fd), aid));

        // 处理变更替换：新版本审批通过后，删除被替换的旧版本（与审批中心一致）
        const getArch = db.prepare(`SELECT * FROM ce_material_archives WHERE id=?`);
        archiveIds.forEach((aid: number) => {
          const newArch = getArch.get(aid) as any;
          if (newArch && newArch.replaces_archive_id) {
            const oldArch = getArch.get(newArch.replaces_archive_id) as any;
            if (oldArch) {
              const refCount = db.prepare(`SELECT COUNT(*) c FROM ce_material_archives WHERE file_path=? AND id<>?`).get(oldArch.file_path, oldArch.id) as any;
              if (!oldArch.is_bound && (refCount?.c || 0) <= 0) {
                try { fs.unlinkSync(oldArch.file_path); } catch {}
              }
              db.prepare(`DELETE FROM ce_material_archives WHERE id=?`).run(oldArch.id);
            }
          }
        });

        updateApprovalFlow(true, approval_remark);
      } else if (action === 'reject') {
        const reason = reject_reason || approval_remark || '不符合要求';
        const fd = { nande_status: nande_status || 'pending', ouce_status: ouce_status || 'pending', archive_status_manual: archive_status_manual || 'not_archived', alternative_suggestion, approval_remark };

        // 驳回 → 物料标记为不合规（与审批中心一致）
        db.prepare(`UPDATE ce_materials SET compliance_status='non_compliant',
            nande_status=?, ouce_status=?, archive_status_manual=?,
            alternative_model=COALESCE(?, alternative_model), alternative_suggestion=?,
            approval_remark=?, reject_reason=?,
            updated_at=datetime('now','localtime') WHERE id=?`)
          .run(nande_status || 'pending', ouce_status || 'pending', archive_status_manual || 'not_archived',
               alternative_suggestion || null, alternative_suggestion || null,
               approval_remark || reason, reason, batch.material_id);

        // 更新批次为rejected
        db.prepare(`UPDATE ce_archive_batches SET status='rejected', approval_status='rejected',
            approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
            reject_reason=?, form_data=? WHERE id=?`)
          .run(u.id, approverName, reason, JSON.stringify(fd), batchId);

        // 批次内所有关联存档都改为rejected
        const updArch = db.prepare(`UPDATE ce_material_archives SET status='rejected',
            approval_status='rejected', approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
            reject_reason=?, approval_form_data=? WHERE id=?`);
        archiveIds.forEach((aid: number) => updArch.run(u.id, approverName, reason, JSON.stringify(fd), aid));

        updateApprovalFlow(false, reason);
      }
    });
    tx();
    res.json({ code: 0, message: action === 'approve' ? '审批通过' : '已驳回', data: { batch_id: batchId, affected_archives: archiveIds.length } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// ============ 统计卡片 ============
router.get('/stats/summary', (_req: Request, res: Response) => {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) c FROM ce_materials").get() as any).c;
  const pending = (db.prepare("SELECT COUNT(*) c FROM ce_materials WHERE compliance_status='pending' AND archive_status_manual='not_archived'").get() as any).c;
  const partial = (db.prepare("SELECT COUNT(*) c FROM ce_materials WHERE archive_status_manual IN ('archived','no_cert','no_manual') AND compliance_status='pending'").get() as any).c;
  const completed = (db.prepare("SELECT COUNT(*) c FROM ce_materials WHERE archive_status_manual='archived' AND compliance_status='compliant'").get() as any).c;
  const approved = (db.prepare("SELECT COUNT(*) c FROM ce_materials WHERE compliance_status='compliant'").get() as any).c;
  const pendingApproval = (db.prepare("SELECT COUNT(*) c FROM ce_archive_batches WHERE approval_status='pending'").get() as any).c;
  res.json({ code: 0, data: { total, pending, partial, completed, approved, pendingApproval } });
});

// ============ CE项目BOM管理（清空/删除行/审批/版本/变更） ============

// 获取BOM主信息（按项目+工位）
router.get('/projects/:projectId/bom', (req: Request, res: Response) => {
  const db = getDb();
  const projectId = parseInt(req.params.projectId);
  const workstationId = req.query.workstation_id ? parseInt(req.query.workstation_id as string) : null;
  const bom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND (workstation_id=? OR (? IS NULL AND workstation_id IS NULL)) ORDER BY id DESC LIMIT 1`)
    .get(projectId, workstationId, workstationId);
  res.json({ code: 0, data: bom || null });
});

// 一键清空BOM（仅draft状态可用）
router.delete('/projects/:projectId/bom/clear', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const projectId = parseInt(req.params.projectId);
  const wsIdParam = req.query.workstation_id as string;
  const workstationId = wsIdParam ? parseInt(wsIdParam) : null;
  try {
    let bom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND (workstation_id=? OR (? IS NULL AND workstation_id IS NULL))`)
      .get(projectId, workstationId, workstationId) as any;
    if (!bom) {
      const orphanCount = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND (? IS NULL OR workstation_id=?)`)
        .get(projectId, workstationId, workstationId) as any).c;
      if (orphanCount === 0) {
        return res.json({ code: 0, message: 'BOM为空，无需清空' });
      }
      const project = db.prepare('SELECT project_code FROM projects WHERE id=?').get(projectId) as any;
      let bomCode = `BOM-${project?.project_code || 'P'}`;
      if (workstationId) {
        const ws = db.prepare('SELECT station_code FROM workstations WHERE id=?').get(workstationId) as any;
        bomCode += ws ? '-' + ws.station_code : '';
      }
      const result = db.prepare(`INSERT INTO ce_project_bom (project_id, workstation_id, bom_code, status, version_no, version_label, created_by, created_at, updated_at)
        VALUES (?,?,?, 'draft', 1, 'V1', ?, datetime('now','localtime'), datetime('now','localtime'))`).run(projectId, workstationId, bomCode, u.id);
      bom = { id: result.lastInsertRowid, status: 'draft' };
      db.prepare(`UPDATE ce_project_bom_items SET ce_bom_id=? WHERE project_id=? AND ce_bom_id IS NULL AND is_deleted=0 AND (? IS NULL OR workstation_id=?)`)
        .run(bom.id, projectId, workstationId, workstationId);
    }
    if (bom.status === 'pending') {
      return res.status(400).json({ code: 400, message: 'BOM审批中，不能清空' });
    }
    if (bom.status === 'approved') {
      return res.status(400).json({ code: 400, message: 'BOM已受控，不能直接清空。请先发起变更。' });
    }
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM ce_project_bom_items WHERE ce_bom_id=?`).run(bom.id);
      db.prepare(`UPDATE ce_project_bom SET updated_at=datetime('now','localtime') WHERE id=?`).run(bom.id);
    });
    tx();
    res.json({ code: 0, message: 'BOM已清空' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除BOM行（软删除，draft或pending审批中可用）
router.delete('/bom-items/:id', (req: Request, res: Response) => {
  const db = getDb();
  const itemId = parseInt(req.params.id);
  const { reason } = req.body as any;
  try {
    const item = db.prepare(`SELECT bi.*, cb.status as bom_status FROM ce_project_bom_items bi
      LEFT JOIN ce_project_bom cb ON bi.ce_bom_id=cb.id WHERE bi.id=?`).get(itemId) as any;
    if (!item) {
      return res.status(404).json({ code: 404, message: 'BOM项不存在' });
    }
    if (item.is_deleted) {
      return res.status(400).json({ code: 400, message: '该项已删除' });
    }
    if (item.bom_status === 'approved') {
      return res.status(400).json({ code: 400, message: 'BOM已受控，不能删除行。请先发起变更。' });
    }
    db.prepare(`UPDATE ce_project_bom_items SET is_deleted=1, delete_reason=?, deleted_at=datetime('now','localtime') WHERE id=?`)
      .run(reason || '审批删减', itemId);
    res.json({ code: 0, message: '已删除该行' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 恢复已删除BOM行（审批中误删）
router.post('/bom-items/:id/restore', (req: Request, res: Response) => {
  const db = getDb();
  const itemId = parseInt(req.params.id);
  try {
    const item = db.prepare(`SELECT * FROM ce_project_bom_items WHERE id=?`).get(itemId) as any;
    if (!item) return res.status(404).json({ code: 404, message: 'BOM项不存在' });
    db.prepare(`UPDATE ce_project_bom_items SET is_deleted=0, delete_reason=NULL, deleted_at=NULL WHERE id=?`).run(itemId);
    res.json({ code: 0, message: '已恢复' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 提交BOM审批
router.post('/projects/:projectId/bom/submit', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const projectId = parseInt(req.params.projectId);
  const workstationId = req.body.workstation_id ? parseInt(req.body.workstation_id) : null;
  const { remarks, change_reason } = req.body as any;
  try {
    const bom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND (workstation_id=? OR (? IS NULL AND workstation_id IS NULL))`)
      .get(projectId, workstationId, workstationId) as any;
    if (!bom) {
      return res.status(400).json({ code: 400, message: '未找到BOM数据' });
    }
    if (bom.status === 'pending') {
      return res.status(400).json({ code: 400, message: 'BOM已在审批中' });
    }
    if (bom.status === 'approved') {
      return res.status(400).json({ code: 400, message: 'BOM已受控，请通过变更流程提交' });
    }
    const itemCount = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items WHERE ce_bom_id=? AND is_deleted=0`).get(bom.id) as any).c;
    if (itemCount === 0) {
      return res.status(400).json({ code: 400, message: 'BOM为空，不能提交审批' });
    }
    const matchedCount = (db.prepare(`SELECT COUNT(*) c FROM ce_project_bom_items WHERE ce_bom_id=? AND is_deleted=0 AND match_status IN ('matched','added')`).get(bom.id) as any).c;
    const items = db.prepare(`SELECT * FROM ce_project_bom_items WHERE ce_bom_id=? AND is_deleted=0 ORDER BY bom_row_no, id`).all(bom.id);

    const submitter = db.prepare('SELECT name FROM users WHERE id=?').get(u.id) as any;

    const tx = db.transaction(() => {
      const snapshotData = JSON.stringify(items);
      const newVersionNo = bom.version_no || 1;
      const versionLabel = 'V' + newVersionNo;

      const verResult = db.prepare(`INSERT INTO ce_project_bom_versions
        (ce_bom_id, project_id, workstation_id, version_no, version_label, snapshot_data, item_count, matched_count,
         status, change_reason, submitter_id, submitter_name, submitted_at, remarks)
        VALUES (?,?,?,?,?,?,?,?, 'pending', ?, ?, ?, datetime('now','localtime'), ?)`)
        .run(bom.id, projectId, workstationId, newVersionNo, versionLabel, snapshotData, itemCount, matchedCount,
             change_reason || null, u.id, submitter?.name || '', remarks || null);
      const versionId = verResult.lastInsertRowid as number;

      const approvalRecordId = createApprovalRecord(db, {
        module: 'ce_bom',
        business_id: versionId,
        submitter_id: u.id,
        project_id: projectId
      });

      db.prepare(`UPDATE ce_project_bom_versions SET approval_record_id=? WHERE id=?`).run(approvalRecordId, versionId);
      db.prepare(`UPDATE ce_project_bom SET
          status='pending', approval_record_id=?, submitter_id=?, submitter_name=?, submitted_at=datetime('now','localtime'),
          reject_reason=NULL, updated_at=datetime('now','localtime')
          WHERE id=?`).run(approvalRecordId, u.id, submitter?.name || '', bom.id);
      return { versionId, approvalRecordId };
    });
    const result = tx();
    res.json({ code: 0, message: '已提交审批', data: result });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// BOM版本历史列表
router.get('/projects/:projectId/bom/versions', (req: Request, res: Response) => {
  const db = getDb();
  const projectId = parseInt(req.params.projectId);
  const workstationId = req.query.workstation_id ? parseInt(req.query.workstation_id as string) : null;
  const versions = db.prepare(`SELECT v.*, u.name as approver_name_ex
    FROM ce_project_bom_versions v
    LEFT JOIN users u ON v.approver_id=u.id
    WHERE v.project_id=? AND (v.workstation_id=? OR (? IS NULL AND v.workstation_id IS NULL))
    ORDER BY v.version_no DESC, v.id DESC`).all(projectId, workstationId, workstationId);
  res.json({ code: 0, data: versions });
});

// BOM版本详情
router.get('/bom/versions/:versionId', (req: Request, res: Response) => {
  const db = getDb();
  const versionId = parseInt(req.params.versionId);
  const version = db.prepare(`SELECT * FROM ce_project_bom_versions WHERE id=?`).get(versionId) as any;
  if (!version) return res.status(404).json({ code: 404, message: '版本不存在' });
  let items: any[] = [];
  try { items = JSON.parse(version.snapshot_data || '[]'); } catch {}
  const approvalRecord = version.approval_record_id
    ? db.prepare(`SELECT ar.*, u.name as submitter_name FROM approval_records ar LEFT JOIN users u ON ar.submitter_id=u.id WHERE ar.id=?`).get(version.approval_record_id)
    : null;
  const stepRecords = version.approval_record_id
    ? db.prepare(`SELECT * FROM approval_step_records WHERE approval_record_id=? ORDER BY step_index ASC`).all(version.approval_record_id)
    : [];
  res.json({ code: 0, data: { version, items, approval_record: approvalRecord, step_records: stepRecords } });
});

// 版本回滚（将BOM恢复到某个已批准版本，需draft状态）
router.post('/bom/versions/:versionId/rollback', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const versionId = parseInt(req.params.versionId);
  const { reason } = req.body as any;
  try {
    const version = db.prepare(`SELECT * FROM ce_project_bom_versions WHERE id=?`).get(versionId) as any;
    if (!version) return res.status(404).json({ code: 404, message: '版本不存在' });
    if (version.status !== 'approved') {
      return res.status(400).json({ code: 400, message: '只能回滚到已批准的版本' });
    }
    const bom = db.prepare(`SELECT * FROM ce_project_bom WHERE id=?`).get(version.ce_bom_id) as any;
    if (!bom) return res.status(404).json({ code: 404, message: 'BOM不存在' });
    if (bom.status === 'pending') {
      return res.status(400).json({ code: 400, message: 'BOM审批中，不能回滚' });
    }
    let snapshotItems: any[] = [];
    try { snapshotItems = JSON.parse(version.snapshot_data || '[]'); } catch {}

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM ce_project_bom_items WHERE ce_bom_id=?`).run(bom.id);
      const insertItem = db.prepare(`INSERT INTO ce_project_bom_items
        (project_id, workstation_id, ce_bom_id, material_id, bom_row_no, part_code, part_name, part_spec, brand, qty,
         match_status, ce_material_id, import_batch_id, created_by, is_deleted)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`);
      for (const it of snapshotItems) {
        insertItem.run(
          it.project_id, it.workstation_id, bom.id, it.ce_material_id, it.bom_row_no,
          it.part_code, it.part_name, it.part_spec, it.brand, it.qty,
          it.match_status, it.ce_material_id, 'ROLLBACK_' + versionId, u.id
        );
      }
      const newVersionNo = (bom.version_no || 1) + 1;
      const newVersionLabel = 'V' + newVersionNo;
      const newSnapshot = JSON.stringify(snapshotItems);
      const rollbackVer = db.prepare(`INSERT INTO ce_project_bom_versions
        (ce_bom_id, project_id, workstation_id, version_no, version_label, snapshot_data, item_count, matched_count,
         status, change_reason, submitter_id, submitter_name, submitted_at, approved_at, approver_id, approver_name, remarks)
        VALUES (?,?,?,?,?,?,?,?, 'approved', ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'), ?, ?, ?)`)
        .run(bom.id, version.project_id, version.workstation_id, newVersionNo, newVersionLabel, newSnapshot,
             snapshotItems.length, version.matched_count, '回滚至V' + version.version_no + (reason ? '：' + reason : ''),
             u.id, (db.prepare('SELECT name FROM users WHERE id=?').get(u.id) as any)?.name || '',
             u.id, (db.prepare('SELECT name FROM users WHERE id=?').get(u.id) as any)?.name || '', reason || null);
      db.prepare(`UPDATE ce_project_bom SET status='approved', version_no=?, version_label=?, current_version_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(newVersionNo, newVersionLabel, rollbackVer.lastInsertRowid, bom.id);
    });
    tx();
    res.json({ code: 0, message: '已回滚到版本V' + version.version_no });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 发起BOM变更（受控后进入变更草稿状态，可编辑/导入/删除行）
router.post('/projects/:projectId/bom/change', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const projectId = parseInt(req.params.projectId);
  const workstationId = req.body.workstation_id ? parseInt(req.body.workstation_id) : null;
  const { change_reason } = req.body as any;
  try {
    const bom = db.prepare(`SELECT * FROM ce_project_bom WHERE project_id=? AND (workstation_id=? OR (? IS NULL AND workstation_id IS NULL))`)
      .get(projectId, workstationId, workstationId) as any;
    if (!bom) {
      return res.status(400).json({ code: 400, message: '未找到BOM数据' });
    }
    if (bom.status !== 'approved') {
      return res.status(400).json({ code: 400, message: '只有已受控的BOM才能发起变更' });
    }
    const newVersionNo = (bom.version_no || 1) + 1;
    db.prepare(`UPDATE ce_project_bom SET status='draft', version_no=?, version_label=?, change_reason=?, reject_reason=NULL, approval_record_id=NULL, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(newVersionNo, 'V' + newVersionNo, change_reason || 'BOM变更', bom.id);
    res.json({ code: 0, message: '已进入变更编辑状态，版本号升级为V' + newVersionNo, data: { version_no: newVersionNo } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取审批中被删除的BOM项列表
router.get('/projects/:projectId/bom/deleted-items', (req: Request, res: Response) => {
  const db = getDb();
  const projectId = parseInt(req.params.projectId);
  const workstationId = req.query.workstation_id ? parseInt(req.query.workstation_id as string) : null;
  const items = db.prepare(`SELECT bi.*,
      COALESCE(m.part_name,m.material_name) ce_name,
      m.brand ce_brand
    FROM ce_project_bom_items bi
    LEFT JOIN ce_project_bom cb ON bi.ce_bom_id=cb.id
    LEFT JOIN ce_materials m ON bi.ce_material_id=m.id
    WHERE bi.project_id=? AND (bi.workstation_id=? OR (? IS NULL AND bi.workstation_id IS NULL)) AND bi.is_deleted=1
    ORDER BY bi.deleted_at DESC`).all(projectId, workstationId, workstationId);
  res.json({ code: 0, data: items });
});

export default router;
