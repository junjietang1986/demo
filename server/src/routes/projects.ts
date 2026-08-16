import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse, generateCode } from '../utils/export';
import { createApprovalRecord } from '../utils/approval';

const router = express.Router();

router.use(authMiddleware);

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const gateAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    cb(null, `gate_${timestamp}_${name}${ext}`);
  }
});
const gateUpload = multer({
  storage: gateAttachmentStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式，仅支持PDF/Word/Excel/PPT/图片'));
    }
  }
});

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { project_type, status, keyword, project_manager_id } = req.query;

    let sql = `
      SELECT p.*,
        u_mech.name AS mech_designer_name,
        u_elec.name AS elec_designer_name,
        u_test.name AS test_designer_name,
        u_elead.name AS electrician_lead_name,
        u_flead.name AS fitter_lead_name,
        u_pm.name AS project_manager_name,
        c.customer_name, c.customer_code,
        (SELECT COUNT(*) FROM workstations w WHERE w.project_id = p.id) AS workstation_count,
        (SELECT COUNT(*) FROM project_plans pp WHERE pp.project_id = p.id) AS plan_count
      FROM projects p
      LEFT JOIN users u_mech ON p.mech_designer_id = u_mech.id
      LEFT JOIN users u_elec ON p.elec_designer_id = u_elec.id
      LEFT JOIN users u_test ON p.test_designer_id = u_test.id
      LEFT JOIN users u_elead ON p.electrician_lead_id = u_elead.id
      LEFT JOIN users u_flead ON p.fitter_lead_id = u_flead.id
      LEFT JOIN users u_pm ON p.project_manager_id = u_pm.id
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (project_type) {
      sql += ' AND p.project_type = ?';
      params.push(project_type);
    }
    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (project_manager_id) {
      sql += ' AND p.project_manager_id = ?';
      params.push(project_manager_id);
    }
    if (req.query.customer_id) {
      sql += ' AND p.customer_id = ?';
      params.push(req.query.customer_id);
    }
    if (req.query.apqp_phase) {
      sql += ' AND p.apqp_phase = ?';
      params.push(Number(req.query.apqp_phase));
    }
    if (keyword) {
      sql += ' AND (p.project_code LIKE ? OR p.project_name LIKE ? OR p.customer LIKE ? OR c.customer_name LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    sql += ' ORDER BY p.created_at DESC';

    const projects = db.prepare(sql).all(...params);
    return res.json(createSuccessResponse(projects));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取项目列表失败'));
  }
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const project = db.prepare(`
      SELECT p.*,
        u_mech.name AS mech_designer_name,
        u_elec.name AS elec_designer_name,
        u_test.name AS test_designer_name,
        u_elead.name AS electrician_lead_name,
        u_flead.name AS fitter_lead_name,
        u_pm.name AS project_manager_name,
        u_creator.name AS creator_name,
        c.customer_name, c.customer_code, c.customer_type
      FROM projects p
      LEFT JOIN users u_mech ON p.mech_designer_id = u_mech.id
      LEFT JOIN users u_elec ON p.elec_designer_id = u_elec.id
      LEFT JOIN users u_test ON p.test_designer_id = u_test.id
      LEFT JOIN users u_elead ON p.electrician_lead_id = u_elead.id
      LEFT JOIN users u_flead ON p.fitter_lead_id = u_flead.id
      LEFT JOIN users u_pm ON p.project_manager_id = u_pm.id
      LEFT JOIN users u_creator ON p.created_by = u_creator.id
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.id = ?
    `).get(id);

    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }

    const workstations = db.prepare(`
      SELECT w.*,
        u_wm.name AS mech_designer_name_resolved,
        u_we.name AS elec_designer_name_resolved,
        u_wmc.name AS meas_control_designer_name_resolved
      FROM workstations w
      LEFT JOIN users u_wm ON w.mech_designer_id = u_wm.id
      LEFT JOIN users u_we ON w.elec_designer_id = u_we.id
      LEFT JOIN users u_wmc ON w.meas_control_designer_id = u_wmc.id
      WHERE w.project_id = ? ORDER BY w.sort_order ASC, w.id ASC
    `).all(id);

    const workstationsWithNames = workstations.map((w: any) => ({
      ...w,
      mech_designer_name: w.mech_designer_name || w.mech_designer_name_resolved || null,
      elec_designer_name: w.elec_designer_name || w.elec_designer_name_resolved || null,
      meas_control_designer_name: w.meas_control_designer_name || w.meas_control_designer_name_resolved || null,
    }));

    const apqpPhases = db.prepare('SELECT * FROM apqp_phases WHERE is_active = 1 ORDER BY sort_order ASC').all();
    const gates = db.prepare(`
      SELECT g.*, u.name AS reviewer_name FROM apqp_gates g
      LEFT JOIN users u ON g.reviewer_id = u.id
      WHERE g.project_id = ? ORDER BY g.phase_no ASC, g.id ASC
    `).all(id);
    const risks = db.prepare(`
      SELECT r.*, u.name AS responsible_name, uc.name AS creator_name
      FROM project_risks r
      LEFT JOIN users u ON r.responsible_id = u.id
      LEFT JOIN users uc ON r.created_by = uc.id
      WHERE r.project_id = ? ORDER BY r.id DESC
    `).all(id);

    return res.json(createSuccessResponse({
      ...project,
      workstations: workstationsWithNames,
      apqp_phases: apqpPhases,
      apqp_gates: gates,
      risks: risks
    }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取项目详情失败'));
  }
});

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const {
      project_type, project_code, project_name, customer,
      customer_id, mech_designer_id, elec_designer_id, test_designer_id,
      assembly_team, electrician_lead_id, fitter_lead_id, project_manager_id,
      description, kickoff_date, planned_fat_date, planned_sat_date, planned_sop_date,
      project_priority, contract_amount, customer_requirements
    } = req.body;

    if (!project_type || !project_name) {
      return res.status(400).json(createErrorResponse('项目类型和项目名称不能为空'));
    }

    const code = project_code || generateCode('PRJ');

    const stmt = db.prepare(`
      INSERT INTO projects (
        project_type, project_code, project_name, customer, customer_id,
        mech_designer_id, elec_designer_id, test_designer_id,
        assembly_team, electrician_lead_id, fitter_lead_id,
        project_manager_id, description, kickoff_date,
        planned_fat_date, planned_sat_date, planned_sop_date,
        project_priority, contract_amount, customer_requirements,
        apqp_phase, apqp_status, health_status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'in_progress', 'green', ?)
    `);

    const result = stmt.run(
      project_type, code, project_name, customer || null, customer_id || null,
      mech_designer_id || null, elec_designer_id || null, test_designer_id || null,
      assembly_team || null, electrician_lead_id || null, fitter_lead_id || null,
      project_manager_id || null, description || null, kickoff_date || null,
      planned_fat_date || null, planned_sat_date || null, planned_sop_date || null,
      project_priority || 'medium', contract_amount || 0, customer_requirements || null,
      req.user?.id || null
    );

    const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    return res.json(createSuccessResponse(newProject));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '创建项目失败'));
  }
});

router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      project_type, project_code, project_name, customer,
      customer_id, mech_designer_id, elec_designer_id, test_designer_id,
      assembly_team, electrician_lead_id, fitter_lead_id, project_manager_id,
      status, description, apqp_phase, apqp_status, health_status,
      kickoff_date, planned_fat_date, planned_sat_date, planned_sop_date,
      actual_fat_date, actual_sat_date, actual_sop_date,
      project_priority, contract_amount, customer_requirements,
      feasibility_status, lessons_learned_note
    } = req.body;

    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }

    const fields: Record<string, any> = {
      project_type, project_code, project_name, customer, customer_id,
      mech_designer_id, elec_designer_id, test_designer_id,
      assembly_team, electrician_lead_id, fitter_lead_id, project_manager_id,
      status, description, apqp_phase, apqp_status, health_status,
      kickoff_date, planned_fat_date, planned_sat_date, planned_sop_date,
      actual_fat_date, actual_sat_date, actual_sop_date,
      project_priority, contract_amount, customer_requirements,
      feasibility_status, lessons_learned_note
    };

    const updates: string[] = [];
    const params: any[] = [];
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined) {
        updates.push(`${k} = ?`);
        params.push(v === '' ? null : v);
      }
    });
    updates.push("updated_at = datetime('now','localtime')");
    params.push(id);

    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return res.json(createSuccessResponse(updated));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新项目失败'));
  }
});

router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }

    db.prepare('DELETE FROM workstations WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    return res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除项目失败'));
  }
});

function resolveUserName(db: any, userId: number | null | undefined): string | null {
  if (!userId) return null;
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  return user?.name || null;
}

router.post('/:id/workstations', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      station_code, station_name, description, sort_order,
      mech_designer_id, elec_designer_id, meas_control_designer_id
    } = req.body;

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }

    if (!station_code || !station_name) {
      return res.status(400).json(createErrorResponse('工序代码和工位名称不能为空'));
    }

    const mechName = resolveUserName(db, mech_designer_id);
    const elecName = resolveUserName(db, elec_designer_id);
    const mcName = resolveUserName(db, meas_control_designer_id);

    const result = db.prepare(`
      INSERT INTO workstations (
        project_id, station_code, station_name, description, sort_order,
        mech_designer_id, mech_designer_name,
        elec_designer_id, elec_designer_name,
        meas_control_designer_id, meas_control_designer_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, station_code, station_name, description || null, sort_order || 0,
      mech_designer_id || null, mechName,
      elec_designer_id || null, elecName,
      meas_control_designer_id || null, mcName
    );

    const newStation = db.prepare('SELECT * FROM workstations WHERE id = ?').get(result.lastInsertRowid);
    return res.json(createSuccessResponse(newStation));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '添加工位失败'));
  }
});

router.put('/workstations/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      station_code, station_name, description, sort_order,
      mech_designer_id, elec_designer_id, meas_control_designer_id
    } = req.body;

    const existing = db.prepare('SELECT * FROM workstations WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('工位不存在'));
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (station_code !== undefined) { updates.push('station_code = ?'); params.push(station_code || null); }
    if (station_name !== undefined) { updates.push('station_name = ?'); params.push(station_name || null); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order != null ? sort_order : null); }

    if (mech_designer_id !== undefined) {
      updates.push('mech_designer_id = ?');
      updates.push('mech_designer_name = ?');
      const mid = mech_designer_id || null;
      params.push(mid, mid ? resolveUserName(db, mid) : null);
    }
    if (elec_designer_id !== undefined) {
      updates.push('elec_designer_id = ?');
      updates.push('elec_designer_name = ?');
      const eid = elec_designer_id || null;
      params.push(eid, eid ? resolveUserName(db, eid) : null);
    }
    if (meas_control_designer_id !== undefined) {
      updates.push('meas_control_designer_id = ?');
      updates.push('meas_control_designer_name = ?');
      const mcid = meas_control_designer_id || null;
      params.push(mcid, mcid ? resolveUserName(db, mcid) : null);
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    params.push(id);

    db.prepare(`UPDATE workstations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM workstations WHERE id = ?').get(id);
    return res.json(createSuccessResponse(updated));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新工位失败'));
  }
});

router.delete('/workstations/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM workstations WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(createErrorResponse('工位不存在'));
    }

    db.prepare('DELETE FROM workstations WHERE id = ?').run(id);
    return res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除工位失败'));
  }
});

// ============ APQP 阶段门控 API ============

router.get('/:id/apqp/phases', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const phases = db.prepare('SELECT * FROM apqp_phases WHERE is_active = 1 ORDER BY sort_order').all();
    const project = db.prepare('SELECT apqp_phase, apqp_status, health_status FROM projects WHERE id = ?').get(req.params.id);
    const gates = db.prepare(`SELECT * FROM apqp_gates WHERE project_id = ?`).all(req.params.id);
    const phasesWithDeliverables = (phases as any[]).map(p => ({
      ...p,
      deliverables: JSON.parse(p.deliverables_json || '[]')
    }));
    res.json(createSuccessResponse({ phases: phasesWithDeliverables, project, gates }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取APQP阶段失败'));
  }
});

router.post('/:id/apqp/gates/init-draft', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { phase_no } = req.body;
    const userId = (req as any).user?.id;

    const existingDraft = db.prepare(`
      SELECT * FROM apqp_gates WHERE project_id = ? AND phase_no = ? AND gate_status = 'draft'
    `).get(id, phase_no);
    if (existingDraft) {
      const items = db.prepare('SELECT * FROM apqp_gate_checkitems WHERE gate_id = ? ORDER BY sort_order').all((existingDraft as any).id);
      return res.json(createSuccessResponse({ ...existingDraft, checkitems: items }));
    }

    const phase = db.prepare('SELECT * FROM apqp_phases WHERE phase_no = ?').get(phase_no) as any;
    if (!phase) {
      return res.status(404).json(createErrorResponse('阶段不存在'));
    }
    const deliverables = JSON.parse(phase.deliverables_json || '[]');

    const r = db.prepare(`
      INSERT INTO apqp_gates (project_id, phase_no, gate_status, created_by)
      VALUES (?, ?, 'draft', ?)
    `).run(id, phase_no, userId || null);
    const gateId = r.lastInsertRowid;

    const insItem = db.prepare(`
      INSERT INTO apqp_gate_checkitems (gate_id, phase_no, item_name, item_category, is_required, status, sort_order)
      VALUES (?, ?, ?, 'deliverable', 1, 'pending', ?)
    `);
    deliverables.forEach((name: string, idx: number) => {
      insItem.run(gateId, phase_no, name, idx);
    });

    const gate = db.prepare('SELECT * FROM apqp_gates WHERE id = ?').get(gateId);
    const items = db.prepare('SELECT * FROM apqp_gate_checkitems WHERE gate_id = ? ORDER BY sort_order').all(gateId);
    res.json(createSuccessResponse({ ...gate, checkitems: items }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建门控草稿失败'));
  }
});

router.post('/:id/apqp/gates', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const { gate_id, phase_no, reviewer_id, conclusion, comments, conditional_terms, checkitems } = req.body;
    const reviewer = reviewer_id ? db.prepare('SELECT name FROM users WHERE id = ?').get(reviewer_id) : null;

    if (!gate_id) {
      return res.status(400).json(createErrorResponse('请先初始化门控草稿'));
    }

    const existingGate = db.prepare('SELECT * FROM apqp_gates WHERE id = ?').get(gate_id) as any;
    if (!existingGate) {
      return res.status(404).json(createErrorResponse('门控记录不存在'));
    }

    if (existingGate.approval_status === 'pending') {
      return res.status(400).json(createErrorResponse('该门控已提交审批，请勿重复提交'));
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE apqp_gates SET
          gate_status = 'submitted', approval_status = 'pending',
          submitter_id = ?, submitted_at = datetime('now','localtime'),
          reviewer_id = ?, reviewer_name = ?, conclusion = ?, comments = ?, conditional_terms = ?
        WHERE id = ?
      `).run(userId, reviewer_id || null, reviewer?.name || null, conclusion || 'approved', comments || null, conditional_terms || null, gate_id);

      if (Array.isArray(checkitems)) {
        const updItem = db.prepare(`
          UPDATE apqp_gate_checkitems SET status = ?, remark = ? WHERE id = ?
        `);
        checkitems.forEach((ci: any) => {
          if (ci.id) {
            updItem.run(ci.status || 'checked', ci.remark || null, ci.id);
          }
        });
      }

      const approvalRecordId = createApprovalRecord('apqp_gate', Number(gate_id), 'apqp_gate', userId, { projectId: Number(id) });

      db.prepare(`UPDATE apqp_gates SET flow_instance_id = ? WHERE id = ?`).run(approvalRecordId, gate_id);

      return approvalRecordId;
    });

    const approvalRecordId = transaction();

    const gate = db.prepare('SELECT * FROM apqp_gates WHERE id = ?').get(gate_id);
    const items = db.prepare('SELECT * FROM apqp_gate_checkitems WHERE gate_id = ? ORDER BY sort_order').all(gate_id);
    return res.json(createSuccessResponse({ ...gate, checkitems: items, approval_record_id: approvalRecordId }, '门控评审已提交，等待项目经理审批'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '提交门控评审失败'));
  }
});

// ============ 项目风险 API ============

router.get('/:id/risks', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const list = db.prepare(`
      SELECT r.*, u.name AS responsible_name, uc.name AS creator_name
      FROM project_risks r
      LEFT JOIN users u ON r.responsible_id = u.id
      LEFT JOIN users uc ON r.created_by = uc.id
      WHERE r.project_id = ? ORDER BY r.id DESC
    `).all(req.params.id);
    res.json(createSuccessResponse(list));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取风险列表失败'));
  }
});

router.post('/:id/risks', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      risk_category, risk_description, impact, probability, severity,
      mitigation_plan, responsible_id, due_date, status
    } = req.body;
    if (!risk_description) return res.status(400).json(createErrorResponse('风险描述不能为空'));
    const p = probability || 'medium';
    const s = severity || 'medium';
    let risk_level = 'low';
    if ((p === 'high' && (s === 'high' || s === 'medium')) || (p === 'medium' && s === 'high')) risk_level = 'high';
    else if (p === 'medium' && s === 'medium') risk_level = 'medium';
    else if (p === 'high' || s === 'high') risk_level = 'medium';

    const r = db.prepare(`
      INSERT INTO project_risks (project_id, risk_category, risk_description, impact, probability, severity, risk_level, mitigation_plan, responsible_id, due_date, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, risk_category || 'technical', risk_description, impact || null, p, s, risk_level, mitigation_plan || null, responsible_id || null, due_date || null, status || 'open', (req as any).user?.id || null);
    const nr = db.prepare('SELECT * FROM project_risks WHERE id = ?').get(r.lastInsertRowid);
    res.json(createSuccessResponse(nr));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '添加风险失败'));
  }
});

router.put('/risks/:riskId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { riskId } = req.params;
    const fields = ['risk_category', 'risk_description', 'impact', 'probability', 'severity', 'mitigation_plan', 'responsible_id', 'due_date', 'status', 'closure_note'];
    const updates: string[] = [];
    const params: any[] = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f] === '' ? null : req.body[f]); }
    });
    if (req.body.probability || req.body.severity) {
      const cur = db.prepare('SELECT probability, severity FROM project_risks WHERE id = ?').get(riskId) as any;
      const p = req.body.probability || cur?.probability || 'medium';
      const s = req.body.severity || cur?.severity || 'medium';
      let rl = 'low';
      if ((p === 'high' && (s === 'high' || s === 'medium')) || (p === 'medium' && s === 'high')) rl = 'high';
      else if (p === 'medium' && s === 'medium') rl = 'medium';
      updates.push('risk_level = ?'); params.push(rl);
    }
    if (updates.length === 0) return res.json(createSuccessResponse(null));
    updates.push("updated_at = datetime('now','localtime')");
    params.push(riskId);
    db.prepare(`UPDATE project_risks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json(createSuccessResponse(db.prepare('SELECT * FROM project_risks WHERE id = ?').get(riskId)));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新风险失败'));
  }
});

router.delete('/risks/:riskId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM project_risks WHERE id = ?').run(req.params.riskId);
    res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除风险失败'));
  }
});

// ========== 获取指定阶段门控详情（含checkitems和附件统计） ==========
router.get('/:id/apqp/gates/by-phase/:phaseNo', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id, phaseNo } = req.params;
    const gate = db.prepare('SELECT * FROM apqp_gates WHERE project_id = ? AND phase_no = ? ORDER BY id DESC LIMIT 1').get(id, phaseNo) as any;
    if (!gate) {
      return res.json(createSuccessResponse(null));
    }
    const items = db.prepare('SELECT * FROM apqp_gate_checkitems WHERE gate_id = ? ORDER BY sort_order').all(gate.id) as any[];
    const attachCount = db.prepare('SELECT COUNT(*) as c FROM apqp_gate_attachments WHERE gate_id = ?').get(gate.id) as any;
    return res.json(createSuccessResponse({ ...gate, checkitems: items, attachment_count: attachCount.c }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取门控详情失败'));
  }
});

// ========== APQP门控交付物附件接口 ==========
router.get('/gates/:gateId/checkitems/:checkitemId/attachments', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { gateId, checkitemId } = req.params;
    const attachments = db.prepare(`
      SELECT a.*, u.name AS uploader_name
      FROM apqp_gate_attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.gate_id = ? AND a.checkitem_id = ?
      ORDER BY a.created_at DESC
    `).all(gateId, checkitemId);
    res.json(createSuccessResponse(attachments));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取附件列表失败'));
  }
});

router.post('/gates/:gateId/checkitems/:checkitemId/attachments', gateUpload.single('file'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { gateId, checkitemId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json(createErrorResponse('请选择文件'));
    }

    const gate = db.prepare('SELECT * FROM apqp_gates WHERE id = ?').get(gateId);
    const checkitem = db.prepare('SELECT * FROM apqp_gate_checkitems WHERE id = ?').get(checkitemId);
    if (!gate || !checkitem) {
      return res.status(404).json(createErrorResponse('门控或检查项不存在'));
    }

    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
    const result = db.prepare(`
      INSERT INTO apqp_gate_attachments (checkitem_id, gate_id, file_name, file_path, file_size, file_type, uploaded_by, uploader_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(checkitemId, gateId, decodedName, file.filename, file.size, file.mimetype, userId, user?.name || '');

    const attachment = db.prepare('SELECT * FROM apqp_gate_attachments WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(attachment));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '上传附件失败'));
  }
});

router.delete('/gates/attachments/:attachId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { attachId } = req.params;

    const attach = db.prepare('SELECT * FROM apqp_gate_attachments WHERE id = ?').get(attachId) as any;
    if (attach) {
      const fp = path.join(uploadsDir, attach.file_path);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
      db.prepare('DELETE FROM apqp_gate_attachments WHERE id = ?').run(attachId);
    }

    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除附件失败'));
  }
});

// ========== VOC客户需求附件 ==========
const vocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    cb(null, `voc_${timestamp}_${name}${ext}`);
  }
});
const vocUpload = multer({
  storage: vocStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.txt', '.zip', '.rar', '.7z'];
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

router.get('/:id/voc-attachments', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const attachments = db.prepare('SELECT * FROM project_voc_attachments WHERE project_id = ? ORDER BY created_at DESC').all(id);
    res.json(createSuccessResponse(attachments));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取附件失败'));
  }
});

router.post('/:id/voc-attachments', vocUpload.single('file'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json(createErrorResponse('请选择文件'));
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const result = db.prepare(`
      INSERT INTO project_voc_attachments (project_id, file_name, file_path, file_size, file_type, uploaded_by, uploader_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, decodedName, file.filename, file.size, file.mimetype, userId, user?.name || '');

    const attachment = db.prepare('SELECT * FROM project_voc_attachments WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(attachment));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '上传附件失败'));
  }
});

router.delete('/voc-attachments/:attachId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { attachId } = req.params;

    const attach = db.prepare('SELECT * FROM project_voc_attachments WHERE id = ?').get(attachId) as any;
    if (attach) {
      const fp = path.join(uploadsDir, attach.file_path);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
      db.prepare('DELETE FROM project_voc_attachments WHERE id = ?').run(attachId);
    }

    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除附件失败'));
  }
});

// ========== BOM模块的项目基础信息（在bom.ts中处理BOM CRUD） ==========
router.get('/:id/bom-summary', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN make_or_buy = 'make' THEN 1 ELSE 0 END) as make_count,
        SUM(CASE WHEN make_or_buy = 'buy' THEN 1 ELSE 0 END) as buy_count,
        SUM(total_price) as total_cost,
        SUM(CASE WHEN is_key_part = 1 THEN 1 ELSE 0 END) as key_part_count,
        SUM(CASE WHEN is_safety_part = 1 THEN 1 ELSE 0 END) as safety_part_count
      FROM bom_items WHERE project_id = ?
    `).get(id);

    res.json(createSuccessResponse(stats));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取BOM统计失败'));
  }
});

export default router;
