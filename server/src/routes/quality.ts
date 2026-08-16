import express, { Request, Response } from 'express';
import { getDb } from '../db/database';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();
router.use(authMiddleware);

const PPAP_ELEMENTS = [
  '设计记录',
  '工程变更文件',
  '客户工程批准',
  'DFMEA',
  'PFMEA',
  '过程流程图',
  '尺寸结果',
  '材料性能试验',
  '初始过程研究',
  '测量系统分析',
  '合格实验室文件',
  '外观批准报告',
  '样件计划',
  '生产件样品',
  '标准样品',
  '检查辅具',
  '顾客特殊要求',
  'PSW零件提交保证书'
];

router.get('/fmea/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT f.*, u.name AS creator_name
      FROM quality_fmea f
      LEFT JOIN users u ON f.created_by = u.id
      WHERE f.project_id = ?
      ORDER BY f.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取FMEA列表失败'));
  }
});

router.get('/fmea/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT f.*, u.name AS creator_name
      FROM quality_fmea f
      LEFT JOIN users u ON f.created_by = u.id
      WHERE f.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('FMEA记录不存在'));
    }
    res.json(createSuccessResponse(item));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取FMEA详情失败'));
  }
});

router.post('/fmea', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, fmea_type, process_name, potential_failure, potential_effects, severity, potential_causes, occurrence, current_controls, detection, rpn, recommended_actions, responsible, target_date, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_fmea (project_id, fmea_type, process_name, potential_failure, potential_effects, severity, potential_causes, occurrence, current_controls, detection, rpn, recommended_actions, responsible, target_date, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, fmea_type || 'PFMEA', process_name || '', potential_failure || '', potential_effects || '', severity || 0, potential_causes || '', occurrence || 0, current_controls || '', detection || 0, rpn || 0, recommended_actions || '', responsible || '', target_date || null, status || 'open', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_fmea WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建FMEA记录失败'));
  }
});

router.put('/fmea/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { fmea_type, process_name, potential_failure, potential_effects, severity, potential_causes, occurrence, current_controls, detection, rpn, recommended_actions, responsible, target_date, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_fmea WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('FMEA记录不存在'));
    }
    db.prepare(`
      UPDATE quality_fmea SET
        fmea_type = ?, process_name = ?, potential_failure = ?, potential_effects = ?,
        severity = ?, potential_causes = ?, occurrence = ?, current_controls = ?,
        detection = ?, rpn = ?, recommended_actions = ?, responsible = ?,
        target_date = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      fmea_type || existing.fmea_type, process_name || existing.process_name,
      potential_failure ?? existing.potential_failure, potential_effects ?? existing.potential_effects,
      severity ?? existing.severity, potential_causes ?? existing.potential_causes,
      occurrence ?? existing.occurrence, current_controls ?? existing.current_controls,
      detection ?? existing.detection, rpn ?? existing.rpn,
      recommended_actions ?? existing.recommended_actions, responsible ?? existing.responsible,
      target_date ?? existing.target_date, status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_fmea WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新FMEA记录失败'));
  }
});

router.delete('/fmea/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_fmea WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除FMEA记录失败'));
  }
});

router.get('/dvpr/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT d.*, u.name AS creator_name
      FROM quality_dvpr d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.project_id = ?
      ORDER BY d.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取DVP&R列表失败'));
  }
});

router.get('/dvpr/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT d.*, u.name AS creator_name
      FROM quality_dvpr d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('DVP&R记录不存在'));
    }
    res.json(createSuccessResponse(item));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取DVP&R详情失败'));
  }
});

router.post('/dvpr', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, test_item, test_method, acceptance_criteria, sample_size, test_result, responsible, plan_date, actual_date, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_dvpr (project_id, test_item, test_method, acceptance_criteria, sample_size, test_result, responsible, plan_date, actual_date, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, test_item || '', test_method || '', acceptance_criteria || '', sample_size || 0, test_result || '', responsible || '', plan_date || null, actual_date || null, status || 'pending', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_dvpr WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建DVP&R记录失败'));
  }
});

router.put('/dvpr/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { test_item, test_method, acceptance_criteria, sample_size, test_result, responsible, plan_date, actual_date, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_dvpr WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('DVP&R记录不存在'));
    }
    db.prepare(`
      UPDATE quality_dvpr SET
        test_item = ?, test_method = ?, acceptance_criteria = ?, sample_size = ?,
        test_result = ?, responsible = ?, plan_date = ?, actual_date = ?,
        status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      test_item || existing.test_item, test_method ?? existing.test_method,
      acceptance_criteria ?? existing.acceptance_criteria, sample_size ?? existing.sample_size,
      test_result ?? existing.test_result, responsible ?? existing.responsible,
      plan_date ?? existing.plan_date, actual_date ?? existing.actual_date,
      status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_dvpr WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新DVP&R记录失败'));
  }
});

router.delete('/dvpr/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_dvpr WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除DVP&R记录失败'));
  }
});

router.get('/cp/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT c.*, u.name AS creator_name
      FROM quality_control_plans c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.project_id = ?
      ORDER BY c.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取Control Plan列表失败'));
  }
});

router.get('/cp/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT c.*, u.name AS creator_name
      FROM quality_control_plans c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('Control Plan记录不存在'));
    }
    res.json(createSuccessResponse(item));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取Control Plan详情失败'));
  }
});

router.post('/cp', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, process_step, product_characteristic, process_characteristic, specification, measurement_method, sample_size, sample_frequency, control_method, reaction_plan, responsible, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_control_plans (project_id, process_step, product_characteristic, process_characteristic, specification, measurement_method, sample_size, sample_frequency, control_method, reaction_plan, responsible, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, process_step || '', product_characteristic || '', process_characteristic || '', specification || '', measurement_method || '', sample_size || '', sample_frequency || '', control_method || '', reaction_plan || '', responsible || '', status || 'active', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_control_plans WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建Control Plan记录失败'));
  }
});

router.put('/cp/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { process_step, product_characteristic, process_characteristic, specification, measurement_method, sample_size, sample_frequency, control_method, reaction_plan, responsible, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_control_plans WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('Control Plan记录不存在'));
    }
    db.prepare(`
      UPDATE quality_control_plans SET
        process_step = ?, product_characteristic = ?, process_characteristic = ?,
        specification = ?, measurement_method = ?, sample_size = ?, sample_frequency = ?,
        control_method = ?, reaction_plan = ?, responsible = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      process_step || existing.process_step, product_characteristic ?? existing.product_characteristic,
      process_characteristic ?? existing.process_characteristic, specification ?? existing.specification,
      measurement_method ?? existing.measurement_method, sample_size ?? existing.sample_size,
      sample_frequency ?? existing.sample_frequency, control_method ?? existing.control_method,
      reaction_plan ?? existing.reaction_plan, responsible ?? existing.responsible,
      status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_control_plans WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新Control Plan记录失败'));
  }
});

router.delete('/cp/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_control_plans WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除Control Plan记录失败'));
  }
});

router.get('/eco/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT e.*, u.name AS creator_name
      FROM quality_eco e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.project_id = ?
      ORDER BY e.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取ECR/ECO列表失败'));
  }
});

router.get('/eco/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT e.*, u.name AS creator_name
      FROM quality_eco e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('ECR/ECO记录不存在'));
    }
    res.json(createSuccessResponse(item));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取ECR/ECO详情失败'));
  }
});

router.post('/eco', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, eco_type, change_title, change_description, reason, impact_analysis, affected_items, requested_by, requested_date, approved_by, approved_date, implementation_date, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_eco (project_id, eco_type, change_title, change_description, reason, impact_analysis, affected_items, requested_by, requested_date, approved_by, approved_date, implementation_date, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, eco_type || 'ECR', change_title || '', change_description || '', reason || '', impact_analysis || '', affected_items || '', requested_by || '', requested_date || null, approved_by || '', approved_date || null, implementation_date || null, status || 'draft', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_eco WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建ECR/ECO记录失败'));
  }
});

router.put('/eco/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { eco_type, change_title, change_description, reason, impact_analysis, affected_items, requested_by, requested_date, approved_by, approved_date, implementation_date, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_eco WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('ECR/ECO记录不存在'));
    }
    db.prepare(`
      UPDATE quality_eco SET
        eco_type = ?, change_title = ?, change_description = ?, reason = ?,
        impact_analysis = ?, affected_items = ?, requested_by = ?, requested_date = ?,
        approved_by = ?, approved_date = ?, implementation_date = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      eco_type || existing.eco_type, change_title || existing.change_title,
      change_description ?? existing.change_description, reason ?? existing.reason,
      impact_analysis ?? existing.impact_analysis, affected_items ?? existing.affected_items,
      requested_by ?? existing.requested_by, requested_date ?? existing.requested_date,
      approved_by ?? existing.approved_by, approved_date ?? existing.approved_date,
      implementation_date ?? existing.implementation_date, status || existing.status,
      remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_eco WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新ECR/ECO记录失败'));
  }
});

router.delete('/eco/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_eco WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除ECR/ECO记录失败'));
  }
});

router.get('/ppap/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT p.*, u.name AS creator_name
      FROM quality_ppap p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.project_id = ?
      ORDER BY p.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取PPAP列表失败'));
  }
});

router.get('/ppap/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT p.*, u.name AS creator_name
      FROM quality_ppap p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('PPAP记录不存在'));
    }
    const elements = db.prepare('SELECT * FROM quality_ppap_elements WHERE ppap_id = ? ORDER BY sort_order').all(id);
    res.json(createSuccessResponse({ ...item, elements }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取PPAP详情失败'));
  }
});

router.post('/ppap', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, ppap_level, submission_reason, part_number, part_name, drawing_number, drawing_revision, engineering_change_level, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_ppap (project_id, ppap_level, submission_reason, part_number, part_name, drawing_number, drawing_revision, engineering_change_level, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, ppap_level || 3, submission_reason || '', part_number || '', part_name || '', drawing_number || '', drawing_revision || '', engineering_change_level || '', status || 'draft', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_ppap WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建PPAP记录失败'));
  }
});

router.put('/ppap/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { ppap_level, submission_reason, part_number, part_name, drawing_number, drawing_revision, engineering_change_level, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_ppap WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('PPAP记录不存在'));
    }
    db.prepare(`
      UPDATE quality_ppap SET
        ppap_level = ?, submission_reason = ?, part_number = ?, part_name = ?,
        drawing_number = ?, drawing_revision = ?, engineering_change_level = ?,
        status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      ppap_level || existing.ppap_level, submission_reason ?? existing.submission_reason,
      part_number ?? existing.part_number, part_name ?? existing.part_name,
      drawing_number ?? existing.drawing_number, drawing_revision ?? existing.drawing_revision,
      engineering_change_level ?? existing.engineering_change_level,
      status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_ppap WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新PPAP记录失败'));
  }
});

router.delete('/ppap/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_ppap_elements WHERE ppap_id = ?').run(id);
    db.prepare('DELETE FROM quality_ppap WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除PPAP记录失败'));
  }
});

router.post('/ppap/init/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { projectId } = req.params;
    const { part_number, part_name } = req.body;

    const result = db.prepare(`
      INSERT INTO quality_ppap (project_id, ppap_level, status, part_number, part_name, created_by)
      VALUES (?, 3, 'draft', ?, ?, ?)
    `).run(projectId, part_number || '', part_name || '', userId);

    const ppapId = result.lastInsertRowid;

    const insertElement = db.prepare(`
      INSERT INTO quality_ppap_elements (ppap_id, element_name, sort_order, status, created_by)
      VALUES (?, ?, ?, 'pending', ?)
    `);

    PPAP_ELEMENTS.forEach((elementName, index) => {
      insertElement.run(ppapId, elementName, index + 1, userId);
    });

    const newItem = db.prepare('SELECT * FROM quality_ppap WHERE id = ?').get(ppapId);
    const elements = db.prepare('SELECT * FROM quality_ppap_elements WHERE ppap_id = ? ORDER BY sort_order').all(ppapId);
    res.json(createSuccessResponse({ ...newItem, elements }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '初始化PPAP要素失败'));
  }
});

router.put('/ppap/elements/:elementId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { elementId } = req.params;
    const { status, file_path, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_ppap_elements WHERE id = ?').get(elementId) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('PPAP要素不存在'));
    }
    db.prepare(`
      UPDATE quality_ppap_elements SET
        status = ?, file_path = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(status || existing.status, file_path ?? existing.file_path, remark ?? existing.remark, elementId);
    const updated = db.prepare('SELECT * FROM quality_ppap_elements WHERE id = ?').get(elementId);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新PPAP要素失败'));
  }
});

router.get('/msa/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT m.*, u.name AS creator_name
      FROM quality_msa m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.project_id = ?
      ORDER BY m.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取MSA列表失败'));
  }
});

router.get('/msa/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT m.*, u.name AS creator_name
      FROM quality_msa m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('MSA记录不存在'));
    }
    res.json(createSuccessResponse(item));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取MSA详情失败'));
  }
});

router.post('/msa', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, msa_type, characteristic, gauge_name, gauge_number, appraisers_count, trials_count, ndc, grr_percent, bias, linearity, stability, conclusion, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_msa (project_id, msa_type, characteristic, gauge_name, gauge_number, appraisers_count, trials_count, ndc, grr_percent, bias, linearity, stability, conclusion, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, msa_type || 'GRR', characteristic || '', gauge_name || '', gauge_number || '', appraisers_count || 3, trials_count || 3, ndc || 0, grr_percent || 0, bias || 0, linearity || 0, stability || '', conclusion || '', status || 'draft', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_msa WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建MSA记录失败'));
  }
});

router.put('/msa/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { msa_type, characteristic, gauge_name, gauge_number, appraisers_count, trials_count, ndc, grr_percent, bias, linearity, stability, conclusion, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_msa WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('MSA记录不存在'));
    }
    db.prepare(`
      UPDATE quality_msa SET
        msa_type = ?, characteristic = ?, gauge_name = ?, gauge_number = ?,
        appraisers_count = ?, trials_count = ?, ndc = ?, grr_percent = ?,
        bias = ?, linearity = ?, stability = ?, conclusion = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      msa_type || existing.msa_type, characteristic ?? existing.characteristic,
      gauge_name ?? existing.gauge_name, gauge_number ?? existing.gauge_number,
      appraisers_count ?? existing.appraisers_count, trials_count ?? existing.trials_count,
      ndc ?? existing.ndc, grr_percent ?? existing.grr_percent,
      bias ?? existing.bias, linearity ?? existing.linearity,
      stability ?? existing.stability, conclusion ?? existing.conclusion,
      status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_msa WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新MSA记录失败'));
  }
});

router.delete('/msa/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_msa WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除MSA记录失败'));
  }
});

router.get('/spc/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT s.*, u.name AS creator_name
      FROM quality_spc s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.project_id = ?
      ORDER BY s.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取SPC列表失败'));
  }
});

router.get('/spc/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT s.*, u.name AS creator_name
      FROM quality_spc s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('SPC记录不存在'));
    }
    const datapoints = db.prepare('SELECT * FROM quality_spc_datapoints WHERE spc_id = ? ORDER BY sample_date, sample_time').all(id);
    res.json(createSuccessResponse({ ...item, datapoints }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取SPC详情失败'));
  }
});

router.post('/spc', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, characteristic, process_name, usl, lsl, target, ucl, lcl, cl, subgroup_size, chart_type, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_spc (project_id, characteristic, process_name, usl, lsl, target, ucl, lcl, cl, subgroup_size, chart_type, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, characteristic || '', process_name || '', usl || 0, lsl || 0, target || 0, ucl || 0, lcl || 0, cl || 0, subgroup_size || 5, chart_type || 'xbar-r', status || 'active', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_spc WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建SPC记录失败'));
  }
});

router.put('/spc/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { characteristic, process_name, usl, lsl, target, ucl, lcl, cl, subgroup_size, chart_type, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_spc WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('SPC记录不存在'));
    }
    db.prepare(`
      UPDATE quality_spc SET
        characteristic = ?, process_name = ?, usl = ?, lsl = ?, target = ?,
        ucl = ?, lcl = ?, cl = ?, subgroup_size = ?, chart_type = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      characteristic || existing.characteristic, process_name ?? existing.process_name,
      usl ?? existing.usl, lsl ?? existing.lsl, target ?? existing.target,
      ucl ?? existing.ucl, lcl ?? existing.lcl, cl ?? existing.cl,
      subgroup_size ?? existing.subgroup_size, chart_type || existing.chart_type,
      status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_spc WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新SPC记录失败'));
  }
});

router.delete('/spc/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_spc_datapoints WHERE spc_id = ?').run(id);
    db.prepare('DELETE FROM quality_spc WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除SPC记录失败'));
  }
});

router.get('/spc/:id/datapoints', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const datapoints = db.prepare('SELECT * FROM quality_spc_datapoints WHERE spc_id = ? ORDER BY sample_date, sample_time').all(id);
    res.json(createSuccessResponse(datapoints));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取SPC数据点失败'));
  }
});

router.post('/spc/:id/datapoints', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;
    const { sample_date, sample_time, subgroup, values, value, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_spc_datapoints (spc_id, sample_date, sample_time, subgroup, values, value, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sample_date || new Date().toISOString().split('T')[0], sample_time || new Date().toTimeString().split(' ')[0], subgroup || 1, values ? JSON.stringify(values) : '[]', value || 0, remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_spc_datapoints WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '添加SPC数据点失败'));
  }
});

router.get('/vda/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT v.*, u.name AS creator_name
      FROM quality_vda_audits v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.project_id = ?
      ORDER BY v.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取VDA6.7审核列表失败'));
  }
});

router.get('/vda/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT v.*, u.name AS creator_name
      FROM quality_vda_audits v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('VDA6.7审核记录不存在'));
    }
    const findings = db.prepare('SELECT * FROM quality_vda_findings WHERE audit_id = ? ORDER BY clause_number').all(id);
    res.json(createSuccessResponse({ ...item, findings }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取VDA6.7审核详情失败'));
  }
});

router.post('/vda', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, audit_code, audit_type, audit_date, auditor, supplier_name, scope, conclusion, score, rating, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_vda_audits (project_id, audit_code, audit_type, audit_date, auditor, supplier_name, scope, conclusion, score, rating, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, audit_code || '', audit_type || 'process', audit_date || null, auditor || '', supplier_name || '', scope || '', conclusion || '', score || 0, rating || '', status || 'draft', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_vda_audits WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建VDA6.7审核记录失败'));
  }
});

router.put('/vda/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { audit_code, audit_type, audit_date, auditor, supplier_name, scope, conclusion, score, rating, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_vda_audits WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('VDA6.7审核记录不存在'));
    }
    db.prepare(`
      UPDATE quality_vda_audits SET
        audit_code = ?, audit_type = ?, audit_date = ?, auditor = ?,
        supplier_name = ?, scope = ?, conclusion = ?, score = ?,
        rating = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      audit_code || existing.audit_code, audit_type || existing.audit_type,
      audit_date ?? existing.audit_date, auditor ?? existing.auditor,
      supplier_name ?? existing.supplier_name, scope ?? existing.scope,
      conclusion ?? existing.conclusion, score ?? existing.score,
      rating ?? existing.rating, status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_vda_audits WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新VDA6.7审核记录失败'));
  }
});

router.delete('/vda/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_vda_findings WHERE audit_id = ?').run(id);
    db.prepare('DELETE FROM quality_vda_audits WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除VDA6.7审核记录失败'));
  }
});

router.get('/vda/:auditId/findings', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { auditId } = req.params;
    const findings = db.prepare('SELECT * FROM quality_vda_findings WHERE audit_id = ? ORDER BY clause_number').all(auditId);
    res.json(createSuccessResponse(findings));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取VDA审核条款失败'));
  }
});

router.post('/vda/:auditId/findings', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { auditId } = req.params;
    const { clause_number, clause_title, requirement, finding_description, severity, classification, corrective_action, responsible, due_date, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_vda_findings (audit_id, clause_number, clause_title, requirement, finding_description, severity, classification, corrective_action, responsible, due_date, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, clause_number || '', clause_title || '', requirement || '', finding_description || '', severity || 0, classification || '', corrective_action || '', responsible || '', due_date || null, status || 'open', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_vda_findings WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建VDA审核条款失败'));
  }
});

router.put('/vda/findings/:findingId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { findingId } = req.params;
    const { clause_number, clause_title, requirement, finding_description, severity, classification, corrective_action, responsible, due_date, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_vda_findings WHERE id = ?').get(findingId) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('VDA审核条款不存在'));
    }
    db.prepare(`
      UPDATE quality_vda_findings SET
        clause_number = ?, clause_title = ?, requirement = ?, finding_description = ?,
        severity = ?, classification = ?, corrective_action = ?, responsible = ?,
        due_date = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      clause_number || existing.clause_number, clause_title ?? existing.clause_title,
      requirement ?? existing.requirement, finding_description ?? existing.finding_description,
      severity ?? existing.severity, classification ?? existing.classification,
      corrective_action ?? existing.corrective_action, responsible ?? existing.responsible,
      due_date ?? existing.due_date, status || existing.status, remark ?? existing.remark,
      findingId
    );
    const updated = db.prepare('SELECT * FROM quality_vda_findings WHERE id = ?').get(findingId);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新VDA审核条款失败'));
  }
});

router.delete('/vda/findings/:findingId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { findingId } = req.params;
    db.prepare('DELETE FROM quality_vda_findings WHERE id = ?').run(findingId);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除VDA审核条款失败'));
  }
});

router.get('/8d/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT e.*, u.name AS creator_name
      FROM quality_8d e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.project_id = ?
      ORDER BY e.created_at DESC
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取8D/CAPA列表失败'));
  }
});

router.get('/8d/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT e.*, u.name AS creator_name
      FROM quality_8d e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('8D/CAPA记录不存在'));
    }
    res.json(createSuccessResponse(item));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取8D/CAPA详情失败'));
  }
});

router.post('/8d', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { project_id, problem_number, problem_title, problem_description, d1_team, d2_problem, d3_interim_containment, d4_root_cause, d5_permanent_corrective, d6_implementation, d7_preventive, d8_recognition, responsible, target_date, status, remark } = req.body;
    const result = db.prepare(`
      INSERT INTO quality_8d (project_id, problem_number, problem_title, problem_description, d1_team, d2_problem, d3_interim_containment, d4_root_cause, d5_permanent_corrective, d6_implementation, d7_preventive, d8_recognition, responsible, target_date, status, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, problem_number || '', problem_title || '', problem_description || '', d1_team || '', d2_problem || '', d3_interim_containment || '', d4_root_cause || '', d5_permanent_corrective || '', d6_implementation || '', d7_preventive || '', d8_recognition || '', responsible || '', target_date || null, status || 'draft', remark || '', userId);
    const newItem = db.prepare('SELECT * FROM quality_8d WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建8D/CAPA记录失败'));
  }
});

router.put('/8d/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { problem_number, problem_title, problem_description, d1_team, d2_problem, d3_interim_containment, d4_root_cause, d5_permanent_corrective, d6_implementation, d7_preventive, d8_recognition, responsible, target_date, status, remark } = req.body;
    const existing = db.prepare('SELECT * FROM quality_8d WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('8D/CAPA记录不存在'));
    }
    db.prepare(`
      UPDATE quality_8d SET
        problem_number = ?, problem_title = ?, problem_description = ?, d1_team = ?,
        d2_problem = ?, d3_interim_containment = ?, d4_root_cause = ?,
        d5_permanent_corrective = ?, d6_implementation = ?, d7_preventive = ?,
        d8_recognition = ?, responsible = ?, target_date = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      problem_number || existing.problem_number, problem_title || existing.problem_title,
      problem_description ?? existing.problem_description, d1_team ?? existing.d1_team,
      d2_problem ?? existing.d2_problem, d3_interim_containment ?? existing.d3_interim_containment,
      d4_root_cause ?? existing.d4_root_cause, d5_permanent_corrective ?? existing.d5_permanent_corrective,
      d6_implementation ?? existing.d6_implementation, d7_preventive ?? existing.d7_preventive,
      d8_recognition ?? existing.d8_recognition, responsible ?? existing.responsible,
      target_date ?? existing.target_date, status || existing.status, remark ?? existing.remark,
      id
    );
    const updated = db.prepare('SELECT * FROM quality_8d WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新8D/CAPA记录失败'));
  }
});

router.delete('/8d/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare('DELETE FROM quality_8d WHERE id = ?').run(id);
    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除8D/CAPA记录失败'));
  }
});

router.get('/versions/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const versions = db.prepare(`
      SELECT v.*, u.name AS creator_name
      FROM document_versions v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.module LIKE 'quality_%' AND v.record_id IN (
        SELECT id FROM quality_fmea WHERE project_id = ?
        UNION SELECT id FROM quality_dvpr WHERE project_id = ?
        UNION SELECT id FROM quality_control_plans WHERE project_id = ?
        UNION SELECT id FROM quality_eco WHERE project_id = ?
        UNION SELECT id FROM quality_ppap WHERE project_id = ?
        UNION SELECT id FROM quality_msa WHERE project_id = ?
        UNION SELECT id FROM quality_spc WHERE project_id = ?
        UNION SELECT id FROM quality_vda_audits WHERE project_id = ?
        UNION SELECT id FROM quality_8d WHERE project_id = ?
      )
      ORDER BY v.created_at DESC
    `).all(projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId);
    res.json(createSuccessResponse(versions));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取版本历史失败'));
  }
});

router.post('/versions', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { module, record_id, version_label, change_summary, snapshot_data } = req.body;

    const currentMax = db.prepare('SELECT MAX(version_no) as max_v FROM document_versions WHERE module = ? AND record_id = ?').get(module, record_id) as any;
    const version_no = (currentMax?.max_v || 0) + 1;

    db.prepare('UPDATE document_versions SET is_current = 0 WHERE module = ? AND record_id = ?').run(module, record_id);

    const result = db.prepare(`
      INSERT INTO document_versions (module, record_id, version_no, version_label, status, is_current, source_type, change_summary, snapshot_data, created_by)
      VALUES (?, ?, ?, ?, 'released', 1, 'manual', ?, ?, ?)
    `).run(module, record_id, version_no, version_label || `V${version_no}`, change_summary || '', snapshot_data ? JSON.stringify(snapshot_data) : null, userId);

    const newVersion = db.prepare('SELECT * FROM document_versions WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newVersion));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建版本快照失败'));
  }
});

export default router;
