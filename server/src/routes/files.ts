import express, { Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';

const router = express.Router();

function buildFileQuery(db: any, search: string, moduleFilter: string, projectId: number | null) {
  const baseParts: { sql: string; joinParams: (baseParams: any[]) => any[] }[] = [];

  baseParts.push({
    sql: `SELECT d.id, d.file_name, d.file_path, d.file_size,
                COALESCE(d.file_type, '') as file_type,
                d.uploaded_by, u.name as uploader_name, d.created_at,
                'deliverable' as module, d.record_id, d.task_id,
                p.project_name as ref_name, p.project_code as ref_code,
                '交付物' as module_label, p.id as project_id
         FROM deliverables d
         LEFT JOIN users u ON d.uploaded_by = u.id
         LEFT JOIN plan_tasks pt ON d.task_id = pt.id
         LEFT JOIN project_plans pp ON pt.plan_id = pp.id
         LEFT JOIN projects p ON pp.project_id = p.id OR (d.module = 'project' AND d.record_id = p.id)`,
    joinParams: (bp) => bp
  });

  baseParts.push({
    sql: `SELECT a.id, a.file_name, a.file_path, a.file_size,
                COALESCE(a.file_type, '') as file_type,
                a.uploaded_by, COALESCE(a.uploader_name, u.name) as uploader_name, a.created_at,
                'apqp' as module, a.checkitem_id as record_id, a.gate_id as task_id,
                'APQP门控评审-第' || g.phase_no || '阶段' as ref_name,
                '' as ref_code,
                'APQP门控' as module_label, g.project_id
         FROM apqp_gate_attachments a
         LEFT JOIN users u ON a.uploaded_by = u.id
         LEFT JOIN apqp_gates g ON a.gate_id = g.id`,
    joinParams: (bp) => bp
  });

  baseParts.push({
    sql: `SELECT aa.id, aa.file_name, aa.file_path, aa.file_size,
                COALESCE(aa.attach_type, '') as file_type,
                aa.uploaded_by, u.name as uploader_name, aa.created_at,
                'acceptance' as module, aa.form_id as record_id, NULL as task_id,
                f.form_code || ' - 验收单' as ref_name,
                p.project_code as ref_code,
                '验收附件' as module_label, f.project_id
         FROM acceptance_attachments aa
         LEFT JOIN users u ON aa.uploaded_by = u.id
         LEFT JOIN acceptance_forms f ON aa.form_id = f.id
         LEFT JOIN projects p ON f.project_id = p.id`,
    joinParams: (bp) => bp
  });

  baseParts.push({
    sql: `SELECT ia.id, ia.file_name, ia.file_path, ia.file_size,
                '' as file_type,
                ia.uploaded_by, u.name as uploader_name, ia.created_at,
                'improvement' as module, ia.improvement_id as record_id, NULL as task_id,
                ir.title as ref_name, ir.improvement_code as ref_code,
                '改进附件' as module_label, NULL as project_id
         FROM improvement_attachments ia
         LEFT JOIN users u ON ia.uploaded_by = u.id
         LEFT JOIN improvements ir ON ia.improvement_id = ir.id`,
    joinParams: (bp) => bp
  });

  baseParts.push({
    sql: `SELECT ba.id, ba.file_name, ba.file_path, ba.file_size,
                COALESCE(ba.file_type, ba.attach_type, '') as file_type,
                ba.uploaded_by, COALESCE(ba.uploader_name, u.name) as uploader_name, ba.created_at,
                'bom' as module, ba.item_id as record_id, NULL as task_id,
                bi.item_code || ' - ' || bi.item_name as ref_name,
                '' as ref_code,
                'BOM附件' as module_label, bi.project_id
         FROM bom_attachments ba
         LEFT JOIN users u ON ba.uploaded_by = u.id
         LEFT JOIN bom_items bi ON ba.item_id = bi.id`,
    joinParams: (bp) => bp
  });

  baseParts.push({
    sql: `SELECT va.id, va.file_name, va.file_path, va.file_size,
                COALESCE(va.file_type, '') as file_type,
                va.uploaded_by, COALESCE(va.uploader_name, u.name) as uploader_name, va.created_at,
                'voc' as module, va.project_id as record_id, NULL as task_id,
                p.project_name as ref_name, p.project_code as ref_code,
                'VOC客户需求' as module_label, va.project_id
         FROM project_voc_attachments va
         LEFT JOIN users u ON va.uploaded_by = u.id
         LEFT JOIN projects p ON va.project_id = p.id`,
    joinParams: (bp) => bp
  });

  baseParts.push({
    sql: `SELECT ca.id, ca.file_name, ca.file_path, ca.file_size,
                COALESCE(dt.type_name, ca.file_type, '') as file_type,
                ca.created_by as uploaded_by, COALESCE(u.name, '') as uploader_name, ca.created_at,
                'ce' as module, ca.material_id as record_id, NULL as task_id,
                cm.part_name || COALESCE(' - ' || dt.type_name, '') as ref_name,
                cm.part_code as ref_code,
                'CE物料存档' as module_label, ca.project_id
         FROM ce_material_archives ca
         LEFT JOIN users u ON ca.created_by = u.id
         LEFT JOIN ce_materials cm ON ca.material_id = cm.id
         LEFT JOIN ce_doc_types dt ON ca.doc_type_id = dt.id
         WHERE ca.file_path IS NOT NULL AND ca.file_path != ''`,
    joinParams: (bp) => bp
  });

  const conditionClauses: string[] = [];
  const baseParams: any[] = [];

  if (search) {
    conditionClauses.push(`(file_name LIKE ? OR ref_name LIKE ? OR uploader_name LIKE ? OR ref_code LIKE ?)`);
    const like = `%${search}%`;
    baseParams.push(like, like, like, like);
  }
  if (moduleFilter) {
    conditionClauses.push(`module = ?`);
    baseParams.push(moduleFilter);
  }
  if (projectId) {
    conditionClauses.push(`project_id = ?`);
    baseParams.push(projectId);
  }

  const whereSql = conditionClauses.length > 0 ? ' WHERE ' + conditionClauses.join(' AND ') : '';

  const unionSqls = baseParts.map(part => {
    const params = part.joinParams([...baseParams]);
    return { sql: part.sql + whereSql, params };
  });

  const allParams: any[] = [];
  const sqlParts = unionSqls.map(u => {
    allParams.push(...u.params);
    return u.sql;
  });

  const unionSql = sqlParts.join(' UNION ALL ');

  return { unionSql, allParams };
}

router.get('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = (req.query.search as string)?.trim() || '';
    const moduleFilter = (req.query.module as string)?.trim() || '';
    const projectId = req.query.project_id ? parseInt(req.query.project_id as string) : null;

    const { unionSql, allParams } = buildFileQuery(db, search, moduleFilter, projectId);

    const countSql = `SELECT COUNT(*) as total FROM (${unionSql})`;
    const countParams = [...allParams];
    const totalResult = db.prepare(countSql).get(...countParams) as any;
    let total = totalResult?.total || 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    const dataSql = `SELECT * FROM (${unionSql}) ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    let list = db.prepare(dataSql).all(...allParams, pageSize, offset) as any[];

    const statsSql = `SELECT module, module_label, COUNT(*) as count, COALESCE(SUM(file_size),0) as total_size FROM (${unionSql}) GROUP BY module, module_label ORDER BY count DESC`;
    const stats = db.prepare(statsSql).all(...allParams) as any[];

    const projectsSql = `SELECT DISTINCT p.id, p.project_name, p.project_code FROM projects p WHERE p.id IN (SELECT project_id FROM (${unionSql}) WHERE project_id IS NOT NULL) ORDER BY p.created_at DESC LIMIT 100`;
    let projects = db.prepare(projectsSql).all(...allParams) as any[];

    const jsonAttachmentSources: {sql: string; module: string; module_label: string; refNameCol: string; refCodeCol: string; projectIdCol: string}[] = [
      { sql: `SELECT t.id, t.attachments_json, t.test_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM dvpr_tests t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'dvpr', module_label: 'DVP&R试验', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.item_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM fmea_items t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'fmea', module_label: 'FMEA', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.study_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM msa_studies t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'msa', module_label: 'MSA', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.feature_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM spc_features t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'spc', module_label: 'SPC', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.element_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM ppap_elements t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'ppap', module_label: 'PPAP交付', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.item_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM control_plan_items t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'cp', module_label: '控制计划', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.title as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM eco_changes t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'eco', module_label: 'ECR/ECO变更', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.issue_title as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM eightd_cases t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: '8d', module_label: '8D/CAPA', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' },
      { sql: `SELECT t.id, t.attachments_json, t.audit_name as name, t.created_at, t.updated_at, p.id as pid, p.project_name, p.project_code, u.name as uploader_name FROM vda_audits t LEFT JOIN projects p ON t.project_id = p.id LEFT JOIN users u ON t.created_by = u.id WHERE t.attachments_json IS NOT NULL AND t.attachments_json != '' AND t.attachments_json != '[]'`, module: 'vda', module_label: 'VDA6.7审核', refNameCol: 'name', refCodeCol: 'project_code', projectIdCol: 'pid' }
    ];

    const jsonFiles: any[] = [];
    const jsonStats: Record<string, {count:number; size:number; label:string}> = {};
    const jsonProjects = new Map<number, {id:number; project_name:string; project_code:string}>();

    for (const src of jsonAttachmentSources) {
      if (moduleFilter && moduleFilter !== src.module) continue;
      let rows: any[] = [];
      try { rows = db.prepare(src.sql).all() as any[]; } catch { continue; }
      for (const row of rows) {
        if (projectId && row[src.projectIdCol] !== projectId) continue;
        let atts: any[] = [];
        try { atts = JSON.parse(row.attachments_json || '[]'); } catch { continue; }
        if (!Array.isArray(atts)) continue;
        for (const att of atts) {
          const fileName = att.file_name || att.name || att.originalName || att.fileName;
          const filePath = att.file_path || att.path || att.url;
          if (!fileName || !filePath) continue;
          if (search && !(fileName.includes(search) || (row[src.refNameCol] || '').includes(search) || (row.project_name || '').includes(search))) continue;
          const fitem = {
            id: row.id * 100000 + (jsonFiles.length + 1),
            file_name: fileName,
            file_path: filePath,
            file_size: att.file_size || att.size || 0,
            file_type: att.file_type || att.type || '',
            uploaded_by: att.uploaded_by || row.created_by,
            uploader_name: att.uploader_name || row.uploader_name,
            created_at: att.created_at || row.created_at || row.updated_at,
            module: src.module,
            record_id: row.id,
            task_id: null,
            ref_name: row[src.refNameCol] || '',
            ref_code: row[src.refCodeCol] || row.project_code || '',
            module_label: src.module_label,
            project_id: row[src.projectIdCol]
          };
          jsonFiles.push(fitem);
          if (!jsonStats[src.module]) jsonStats[src.module] = { count: 0, size: 0, label: src.module_label };
          jsonStats[src.module].count++;
          jsonStats[src.module].size += (fitem.file_size || 0);
          if (fitem.project_id) {
            jsonProjects.set(fitem.project_id, { id: fitem.project_id, project_name: row.project_name, project_code: row.project_code });
          }
        }
      }
    }

    jsonFiles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    total += jsonFiles.length;
    const combinedList = [...list, ...jsonFiles];
    combinedList.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const pagedList = combinedList.slice(offset, offset + pageSize);

    for (const [m, s] of Object.entries(jsonStats)) {
      const exist = stats.find((x: any) => x.module === m);
      if (exist) { exist.count += s.count; exist.total_size += s.size; }
      else { stats.push({ module: m, module_label: s.label, count: s.count, total_size: s.size }); }
    }
    for (const [, pj] of jsonProjects) {
      if (!projects.find((x: any) => x.id === pj.id)) projects.push(pj);
    }
    projects.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));

    return res.json(createSuccessResponse({
      list: pagedList,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      stats,
      projects
    }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取文件列表失败'));
  }
});

router.get('/stats', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const safeCount = (sql: string) => {
      try { return (db.prepare(sql).get() as any)?.c || 0; } catch { return 0; }
    };
    const stats = [
      { module: 'deliverable', label: '交付物', count: safeCount('SELECT COUNT(*) as c FROM deliverables') },
      { module: 'apqp', label: 'APQP门控', count: safeCount('SELECT COUNT(*) as c FROM apqp_gate_attachments') },
      { module: 'acceptance', label: '验收附件', count: safeCount('SELECT COUNT(*) as c FROM acceptance_attachments') },
      { module: 'improvement', label: '改进附件', count: safeCount('SELECT COUNT(*) as c FROM improvement_attachments') },
      { module: 'bom', label: 'BOM附件', count: safeCount('SELECT COUNT(*) as c FROM bom_attachments') },
      { module: 'voc', label: 'VOC客户需求', count: safeCount('SELECT COUNT(*) as c FROM project_voc_attachments') },
      { module: 'ce', label: 'CE物料证书', count: safeCount('SELECT COUNT(*) as c FROM ce_material_attachments') + safeCount("SELECT COUNT(*) as c FROM ce_materials WHERE cert_file_path IS NOT NULL AND cert_file_path != ''") },
      { module: 'ppap', label: 'PPAP交付', count: safeCount("SELECT COUNT(*) as c FROM ppap_elements WHERE attachments_json IS NOT NULL AND attachments_json != '' AND attachments_json != '[]'") },
      { module: 'dvpr', label: 'DVP&R试验', count: safeCount("SELECT COUNT(*) as c FROM dvpr_tests WHERE attachments_json IS NOT NULL AND attachments_json != '' AND attachments_json != '[]'") },
      { module: 'fmea', label: 'FMEA', count: safeCount("SELECT COUNT(*) as c FROM fmea_items WHERE attachments_json IS NOT NULL AND attachments_json != '' AND attachments_json != '[]'") },
      { module: 'msa', label: 'MSA', count: safeCount("SELECT COUNT(*) as c FROM msa_studies WHERE attachments_json IS NOT NULL AND attachments_json != '' AND attachments_json != '[]'") },
      { module: 'spc', label: 'SPC', count: safeCount("SELECT COUNT(*) as c FROM spc_features WHERE attachments_json IS NOT NULL AND attachments_json != '' AND attachments_json != '[]'") }
    ];
    return res.json(createSuccessResponse(stats));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取统计失败'));
  }
});

export default router;
