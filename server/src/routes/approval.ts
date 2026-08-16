import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import { createApprovalRecord } from '../utils/approval';

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${originalName}`);
  }
});
const upload = multer({ storage });

export { createApprovalRecord };

router.get('/flows', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const moduleFilter = req.query.module as string;

    let sql = 'SELECT * FROM approval_flows';
    let params: any[] = [];

    if (moduleFilter) {
      sql += ' WHERE module = ?';
      params.push(moduleFilter);
    }

    sql += ' ORDER BY module ASC, is_default DESC, created_at DESC';

    const flows = db.prepare(sql).all(...params) as any[];
    const result = flows.map(f => ({
      ...f,
      steps: JSON.parse(f.steps)
    }));

    return res.json(createSuccessResponse(result));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取审批流程列表失败'));
  }
});

router.post('/flows', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.user!;
    if (role !== 'admin' && role !== 'doc_controller') {
      return res.status(403).json(createErrorResponse('权限不足，仅管理员或文控可创建审批流程'));
    }

    const { module, flow_name, description, steps, is_default } = req.body;
    if (!module || !flow_name || !steps || !Array.isArray(steps)) {
      return res.status(400).json(createErrorResponse('模块名称、流程名称和步骤为必填项'));
    }

    const db = getDb();
    const stepsJson = JSON.stringify(steps);

    const result = db.prepare(
      `INSERT INTO approval_flows (module, flow_name, description, steps, is_default, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(module, flow_name, description || null, stepsJson, is_default ? 1 : 0, req.user!.id);

    if (is_default) {
      db.prepare('UPDATE approval_flows SET is_default = 0 WHERE module = ? AND id != ?').run(module, result.lastInsertRowid);
    }

    const newFlow = db.prepare('SELECT * FROM approval_flows WHERE id = ?').get(result.lastInsertRowid) as any;
    newFlow.steps = JSON.parse(newFlow.steps);

    return res.json(createSuccessResponse(newFlow, '审批流程创建成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '创建审批流程失败'));
  }
});

router.put('/flows/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.user!;
    if (role !== 'admin' && role !== 'doc_controller') {
      return res.status(403).json(createErrorResponse('权限不足，仅管理员或文控可更新审批流程'));
    }

    const flowId = parseInt(req.params.id);
    const { module, flow_name, description, steps, is_default } = req.body;
    const db = getDb();

    const existingFlow = db.prepare('SELECT * FROM approval_flows WHERE id = ?').get(flowId) as any;
    if (!existingFlow) {
      return res.status(404).json(createErrorResponse('审批流程不存在'));
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (module !== undefined) { updates.push('module = ?'); params.push(module); }
    if (flow_name !== undefined) { updates.push('flow_name = ?'); params.push(flow_name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (steps !== undefined && Array.isArray(steps)) {
      updates.push('steps = ?');
      params.push(JSON.stringify(steps));
    }
    if (is_default !== undefined) { updates.push('is_default = ?'); params.push(is_default ? 1 : 0); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now', 'localtime')");
      params.push(flowId);
      db.prepare(`UPDATE approval_flows SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      if (is_default) {
        const targetModule = module || existingFlow.module;
        db.prepare('UPDATE approval_flows SET is_default = 0 WHERE module = ? AND id != ?').run(targetModule, flowId);
      }
    }

    const updatedFlow = db.prepare('SELECT * FROM approval_flows WHERE id = ?').get(flowId) as any;
    updatedFlow.steps = JSON.parse(updatedFlow.steps);

    return res.json(createSuccessResponse(updatedFlow, '审批流程更新成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新审批流程失败'));
  }
});

router.delete('/flows/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.user!;
    if (role !== 'admin' && role !== 'doc_controller') {
      return res.status(403).json(createErrorResponse('权限不足，仅管理员或文控可删除审批流程'));
    }

    const flowId = parseInt(req.params.id);
    const db = getDb();

    const existingFlow = db.prepare('SELECT id FROM approval_flows WHERE id = ?').get(flowId);
    if (!existingFlow) {
      return res.status(404).json(createErrorResponse('审批流程不存在'));
    }

    const inUse = db.prepare('SELECT COUNT(*) as count FROM approval_records WHERE flow_id = ?').get(flowId) as any;
    if (inUse.count > 0) {
      return res.status(400).json(createErrorResponse('该审批流程已被使用，无法删除'));
    }

    db.prepare('DELETE FROM approval_flows WHERE id = ?').run(flowId);
    return res.json(createSuccessResponse(null, '审批流程删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除审批流程失败'));
  }
});

router.get('/records', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const moduleFilter = req.query.module as string;
    const statusFilter = req.query.status as string;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (moduleFilter) {
      whereClauses.push('ar.module = ?');
      params.push(moduleFilter);
    }
    if (statusFilter) {
      whereClauses.push('ar.status = ?');
      params.push(statusFilter);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const totalResult = db.prepare(`SELECT COUNT(*) as total FROM approval_records ar ${whereSql}`).get(...params) as any;
    const total = totalResult.total;

    const offset = (page - 1) * pageSize;
    const records = db.prepare(
      `SELECT ar.*, u.name as submitter_name,
              COALESCE(af.flow_name, CASE ar.module
                WHEN 'project_plan' THEN '项目计划审批流程'
                WHEN 'acceptance_form' THEN '验收单审批流程'
                WHEN 'acceptance_plan' THEN '验收计划审批流程'
                WHEN 'improvement' THEN '持续改进审批流程'
                WHEN 'apqp_gate' THEN 'APQP门控评审流程'
                WHEN 'ce_archive' THEN 'CE物料存档审批流程'
                WHEN 'ce_material_change' THEN 'CE物料信息变更审批流程'
                WHEN 'ce_bom' THEN 'CE项目BOM审批流程'
                ELSE ar.module END) as flow_name,
              COALESCE(af.steps, '[{"step":1,"name":"系统管理员审批","role":"admin"}]') as flow_steps
       FROM approval_records ar
       LEFT JOIN users u ON ar.submitter_id = u.id
       LEFT JOIN approval_flows af ON ar.flow_id = af.id
       ${whereSql}
       ORDER BY ar.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);

    const listWithFlow = (records as any[]).map(r => ({
      ...r,
      flow: {
        flow_name: r.flow_name,
        steps: typeof r.flow_steps === 'string' ? JSON.parse(r.flow_steps) : r.flow_steps
      }
    }));

    return res.json(createSuccessResponse({
      list: listWithFlow,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取审批记录列表失败'));
  }
});

router.get('/records/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = parseInt(req.params.id);
    const db = getDb();

    const record = db.prepare(
      `SELECT ar.*, u.name as submitter_name,
              COALESCE(af.flow_name, CASE ar.module
                WHEN 'project_plan' THEN '项目计划审批流程'
                WHEN 'acceptance_form' THEN '验收单审批流程'
                WHEN 'acceptance_plan' THEN '验收计划审批流程'
                WHEN 'improvement' THEN '持续改进审批流程'
                WHEN 'apqp_gate' THEN 'APQP门控评审流程'
                WHEN 'ce_archive' THEN 'CE物料存档审批流程'
                WHEN 'ce_material_change' THEN 'CE物料信息变更审批流程'
                WHEN 'ce_bom' THEN 'CE项目BOM审批流程'
                ELSE ar.module END) as flow_name,
              COALESCE(af.steps, '[{"step":1,"name":"系统管理员审批","role":"admin"}]') as flow_steps
       FROM approval_records ar
       LEFT JOIN users u ON ar.submitter_id = u.id
       LEFT JOIN approval_flows af ON ar.flow_id = af.id
       WHERE ar.id = ?`
    ).get(recordId) as any;

    if (!record) {
      return res.status(404).json(createErrorResponse('审批记录不存在'));
    }

    const stepRecords = db.prepare(
      `SELECT * FROM approval_step_records WHERE approval_record_id = ? ORDER BY step_index ASC`
    ).all(recordId);

    const parsedSteps = typeof record.flow_steps === 'string' ? JSON.parse(record.flow_steps) : (record.flow_steps || []);
    record.flow = {
      flow_name: record.flow_name,
      steps: parsedSteps
    };
    record.step_records = stepRecords;

    // 附加业务数据（CE批量审批）
    if (record.module === 'ce_archive' && String(record.record_id).startsWith('ce_batch_')) {
      const batchId = parseInt(String(record.record_id).replace('ce_batch_', ''));
      const batch = db.prepare('SELECT * FROM ce_archive_batches WHERE id=?').get(batchId) as any;
      if (batch) {
        const material = db.prepare('SELECT * FROM ce_materials WHERE id=?').get(batch.material_id) as any;
        const archiveIds = JSON.parse(batch.archive_ids || '[]');
        if (archiveIds.length > 0) {
          const ph = archiveIds.map(() => '?').join(',');
          const archives = db.prepare(`SELECT a.*, dt.type_name FROM ce_material_archives a
              JOIN ce_doc_types dt ON a.doc_type_id=dt.id WHERE a.id IN (${ph})`).all(...archiveIds);
          record.business_data = { batch, material, archives };
        } else {
          record.business_data = { batch, material, archives: [] };
        }
      }
    }

    // 附加业务数据（CE项目BOM审批）
    if (record.module === 'ce_bom') {
      const versionId = record.record_id;
      const version = db.prepare('SELECT * FROM ce_project_bom_versions WHERE id=?').get(versionId) as any;
      if (version) {
        const bom = db.prepare('SELECT * FROM ce_project_bom WHERE id=?').get(version.ce_bom_id) as any;
        const project = db.prepare('SELECT id, project_code, project_name FROM projects WHERE id=?').get(version.project_id) as any;
        let workstation = null;
        if (version.workstation_id) {
          workstation = db.prepare('SELECT id, station_code, station_name FROM workstations WHERE id=?').get(version.workstation_id) as any;
        }
        const items = db.prepare(`SELECT bi.*,
            COALESCE(m.part_name,m.material_name) ce_name,
            COALESCE(m.spec,m.specification) ce_spec,
            m.brand ce_brand, m.compliance_status,
            m.archive_status_manual, m.nande_status, m.ouce_status
          FROM ce_project_bom_items bi
          LEFT JOIN ce_materials m ON bi.ce_material_id=m.id
          WHERE bi.ce_bom_id=? AND bi.is_deleted=0
          ORDER BY bi.bom_row_no, bi.id`).all(version.ce_bom_id);
        record.business_data = { version, bom, project, workstation, items };
      }
    }

    return res.json(createSuccessResponse(record));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取审批记录详情失败'));
  }
});

router.get('/my-pending', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const db = getDb();

    const flowNameByModule: Record<string, string> = {
      project_plan: '项目计划审批流程',
      acceptance_form: '验收单审批流程',
      acceptance_plan: '验收计划审批流程',
      improvement: '持续改进审批流程',
      apqp_gate: 'APQP门控评审流程',
      ce_archive: 'CE物料存档审批流程',
      ce_material_change: 'CE物料信息变更审批流程',
      ce_bom: 'CE项目BOM审批流程'
    };

    const pendingRecords = db.prepare(
      `SELECT ar.*, u.name as submitter_name,
              COALESCE(af.flow_name, CASE ar.module
                WHEN 'project_plan' THEN '项目计划审批流程'
                WHEN 'acceptance_form' THEN '验收单审批流程'
                WHEN 'acceptance_plan' THEN '验收计划审批流程'
                WHEN 'improvement' THEN '持续改进审批流程'
                WHEN 'apqp_gate' THEN 'APQP门控评审流程'
                WHEN 'ce_archive' THEN 'CE物料存档审批流程'
                WHEN 'ce_material_change' THEN 'CE物料信息变更审批流程'
                WHEN 'ce_bom' THEN 'CE项目BOM审批流程'
                ELSE ar.module END) as flow_name,
              COALESCE(af.steps, '[{"step":1,"name":"系统管理员审批","role":"admin"}]') as flow_steps,
              asr.id as step_record_id, asr.step_index, asr.approver_name, asr.status as step_status
       FROM approval_records ar
       INNER JOIN approval_step_records asr ON asr.approval_record_id = ar.id
       LEFT JOIN users u ON ar.submitter_id = u.id
       LEFT JOIN approval_flows af ON ar.flow_id = af.id
       WHERE asr.approver_id = ?
         AND asr.status = 'pending'
         AND ar.status = 'pending'
         AND asr.step_index = ar.current_step
       ORDER BY ar.created_at ASC`
    ).all(userId);

    const result = (pendingRecords as any[]).map(r => ({
      ...r,
      flow: {
        flow_name: r.flow_name,
        steps: typeof r.flow_steps === 'string' ? JSON.parse(r.flow_steps) : r.flow_steps
      }
    }));

    return res.json(createSuccessResponse(result));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取待审批列表失败'));
  }
});

router.post('/records/:id/approve', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = parseInt(req.params.id);
    const userId = req.user!.id;
    const { comment, form_data } = req.body;
    const db = getDb();

    const record = db.prepare('SELECT * FROM approval_records WHERE id = ?').get(recordId) as any;
    if (!record) {
      return res.status(404).json(createErrorResponse('审批记录不存在'));
    }

    if (record.status !== 'pending') {
      return res.status(400).json(createErrorResponse('该审批记录已处理，无法重复操作'));
    }

    const currentStep = db.prepare(
      `SELECT * FROM approval_step_records
       WHERE approval_record_id = ? AND step_index = ? AND status = 'pending'`
    ).get(recordId, record.current_step) as any;

    if (!currentStep) {
      return res.status(400).json(createErrorResponse('未找到当前待审批步骤'));
    }

    if (currentStep.approver_id !== userId) {
      return res.status(403).json(createErrorResponse('您不是当前步骤的审批人'));
    }

    const totalSteps = db.prepare(
      'SELECT COUNT(*) as count FROM approval_step_records WHERE approval_record_id = ?'
    ).get(recordId) as any;

    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE approval_step_records
         SET status = 'approved', comment = ?, approved_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(comment || null, currentStep.id);

      if (record.current_step >= totalSteps.count) {
        db.prepare(
          `UPDATE approval_records
           SET status = 'approved', approved_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        ).run(recordId);

        const module = record.module;
        const businessId = record.record_id;
        switch (module) {
          case 'project_plan': {
            db.prepare(`UPDATE project_plans SET status='approved', updated_at=datetime('now','localtime') WHERE id=?`).run(businessId);
            const plan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(businessId) as any;
            const tasks = db.prepare(`SELECT pt.*, u.name AS assignee_name FROM plan_tasks pt LEFT JOIN users u ON pt.assignee_id = u.id WHERE pt.plan_id = ?`).all(businessId);
            const versionLabel = 'V' + String(plan.version).padStart(2, '0');
            const existingSnap = db.prepare(`SELECT id FROM document_versions WHERE module = ? AND record_id = ? AND version_no = ?`).get('project_plan', businessId, plan.version);
            if (existingSnap) {
              db.prepare(`UPDATE document_versions SET status = 'approved', is_current = 1, approval_record_id = ? WHERE id = ?`).run(recordId, (existingSnap as any).id);
              db.prepare(`UPDATE document_versions SET is_current = 0 WHERE module = ? AND record_id = ? AND id != ?`).run('project_plan', businessId, (existingSnap as any).id);
            } else {
              db.prepare(`
                INSERT INTO document_versions (module, record_id, version_no, version_label, status, is_current, source_type, snapshot_data, approval_record_id, created_at, approved_at)
                VALUES (?, ?, ?, ?, 'approved', 1, 'approval', ?, ?, datetime('now','localtime'), datetime('now','localtime'))
              `).run(
                'project_plan', businessId, plan.version, versionLabel,
                JSON.stringify({ plan: { ...plan, status: 'approved' }, tasks }),
                recordId
              );
              db.prepare(`UPDATE document_versions SET is_current = 0 WHERE module = ? AND record_id = ? AND version_no != ?`).run('project_plan', businessId, plan.version);
            }
            break;
          }
          case 'acceptance_form':
            db.prepare(`UPDATE acceptance_forms SET status='approved', updated_at=datetime('now','localtime') WHERE id=?`).run(businessId);
            break;
          case 'acceptance_plan':
            db.prepare(`UPDATE acceptance_plans SET status='approved', updated_at=datetime('now','localtime') WHERE id=?`).run(businessId);
            break;
          case 'apqp_gate': {
            const gate = db.prepare('SELECT * FROM apqp_gates WHERE id = ?').get(businessId) as any;
            if (gate) {
              const approverName = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
              db.prepare(`
                UPDATE apqp_gates SET
                  gate_status = 'completed', approval_status = 'approved',
                  review_date = datetime('now','localtime'),
                  reviewer_id = ?, reviewer_name = ?
                WHERE id = ?
              `).run(userId, approverName?.name || null, businessId);
              db.prepare(`
                UPDATE projects SET apqp_phase = ?, apqp_status = 'phase_gate_passed', updated_at = datetime('now','localtime')
                WHERE id = ?
              `).run(Math.min(Number(gate.phase_no) + 1, 5), gate.project_id);
            }
            break;
          }
          case 'ce_archive': {
            const approverName = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
            // 判断是否为批量批次 (business_id = ce_batch_<id>)
            const bidStr = String(businessId);
            if (bidStr.startsWith('ce_batch_')) {
              const batchId = parseInt(bidStr.replace('ce_batch_', ''));
              const batch = db.prepare('SELECT * FROM ce_archive_batches WHERE id = ?').get(batchId) as any;
              if (batch) {
                // 审批人编辑的表单字段
                const fd = form_data || (batch.form_data ? JSON.parse(batch.form_data) : {});
                const nande_status = fd.nande_status || 'pending';
                const ouce_status = fd.ouce_status || 'pending';
                const archive_status_manual = fd.archive_status_manual || 'archived';
                const alternative_suggestion = fd.alternative_suggestion || null;
                const approval_remark = fd.approval_remark || comment || null;
                // 审批通过 → 合规
                const compliance_status = 'compliant';

                db.prepare(`UPDATE ce_materials SET
                    nande_status=?, ouce_status=?, archive_status_manual=?, compliance_status=?,
                    alternative_model=COALESCE(?, alternative_model), alternative_suggestion=?,
                    updated_at=datetime('now','localtime') WHERE id=?`)
                  .run(nande_status, ouce_status, archive_status_manual, compliance_status,
                       alternative_suggestion, alternative_suggestion, batch.material_id);

                // 批次更新为approved
                db.prepare(`UPDATE ce_archive_batches SET status='approved', approval_status='approved',
                    approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
                    reject_reason=NULL, form_data=? WHERE id=?`)
                  .run(userId, approverName?.name || null, JSON.stringify(fd), batchId);

                // 关联存档都改为approved
                const archiveIds = JSON.parse(batch.archive_ids || '[]');
                const updArch = db.prepare(`UPDATE ce_material_archives SET status='approved',
                    approval_status='approved', approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
                    approval_form_data=? WHERE id=?`);
                archiveIds.forEach((aid: number) => updArch.run(userId, approverName?.name || null, JSON.stringify(fd), aid));

                // 处理变更替换：新版本审批通过后，删除被替换的旧版本
                const getArch = db.prepare(`SELECT * FROM ce_material_archives WHERE id=?`);
                archiveIds.forEach((aid: number) => {
                  const newArch = getArch.get(aid) as any;
                  if (newArch && newArch.replaces_archive_id) {
                    const oldArch = getArch.get(newArch.replaces_archive_id) as any;
                    if (oldArch) {
                      // 检查文件引用计数（排除旧记录自身）
                      const refCount = db.prepare(`SELECT COUNT(*) c FROM ce_material_archives WHERE file_path=? AND id<>?`).get(oldArch.file_path, oldArch.id) as any;
                      if (!oldArch.is_bound && (refCount?.c || 0) <= 0) {
                        try { fs.unlinkSync(oldArch.file_path); } catch {}
                      }
                      db.prepare(`DELETE FROM ce_material_archives WHERE id=?`).run(oldArch.id);
                    }
                  }
                });
              }
            } else {
              // 单存档审批（兼容旧数据）
              const archive = db.prepare('SELECT * FROM ce_material_archives WHERE id = ?').get(businessId) as any;
              if (archive) {
                db.prepare(`UPDATE ce_material_archives SET
                    status='approved', approval_status='approved',
                    approver_id=?, approver_name=?, approved_at=datetime('now','localtime') WHERE id=?`)
                  .run(userId, approverName?.name || null, businessId);
                db.prepare(`UPDATE ce_materials SET compliance_status='compliant',
                    archive_status_manual=CASE WHEN archive_status_manual='not_archived' THEN 'archived' ELSE archive_status_manual END,
                    updated_at=datetime('now','localtime') WHERE id=?`).run(archive.material_id);
              }
            }
            break;
          }
          case 'ce_material_change': {
            // CE物料信息变更审批通过 → 将document_versions中pending的快照应用到ce_materials
            const versionId = businessId;
            const version = db.prepare(`SELECT * FROM document_versions WHERE id=? AND module='ce_material' AND status='pending'`).get(versionId) as any;
            if (version) {
              try {
                const data = JSON.parse(version.snapshot_data || '{}');
                const materialId = version.record_id;
                db.prepare(`UPDATE ce_materials SET
                  sort_no=?, sort_order=?, part_code=?, material_code=?, part_name=?, material_name=?,
                  spec=?, specification=?, brand=?, category=?,
                  alternative_model=?, selector_name=?, purchaser_name=?, remarks=?,
                  updated_at=datetime('now','localtime') WHERE id=?`).run(
                  data.sort_no || 0, data.sort_no || 0,
                  data.part_code || '', data.part_code || '',
                  data.part_name || '', data.part_name || '',
                  data.spec || '', data.spec || '',
                  data.brand || '', data.category || '',
                  data.alternative_model || '', data.selector_name || '',
                  data.purchaser_name || '', data.remarks || '',
                  materialId
                );
                db.prepare(`UPDATE document_versions SET status='approved', is_current=1, approved_at=datetime('now','localtime') WHERE id=?`)
                  .run(versionId);
                db.prepare(`UPDATE document_versions SET is_current=0 WHERE module='ce_material' AND record_id=? AND id<>? AND status='approved'`).run(materialId, versionId);
              } catch (e) { console.error('apply ce_material_change error:', e); }
            }
            break;
          }
          case 'ce_bom': {
            // CE项目BOM审批通过 → BOM受控，处理审批人删除的物料行，版本标记为approved
            const versionId = businessId;
            const version = db.prepare(`SELECT * FROM ce_project_bom_versions WHERE id=?`).get(versionId) as any;
            if (version) {
              const approverName = db.prepare('SELECT name FROM users WHERE id=?').get(userId) as any;
              const fd = form_data || {};
              const deleteItemIds: number[] = Array.isArray(fd.delete_item_ids) ? fd.delete_item_ids : [];
              if (deleteItemIds.length > 0) {
                const markDelete = db.prepare(`UPDATE ce_project_bom_items SET is_deleted=1, delete_reason=?, deleted_at=datetime('now','localtime') WHERE id=? AND ce_bom_id=? AND is_deleted=0`);
                deleteItemIds.forEach((itemId: number) => {
                  try { markDelete.run('审批删减', itemId, version.ce_bom_id); } catch {}
                });
              }
              db.prepare(`UPDATE ce_project_bom_versions SET
                  status='approved', approver_id=?, approver_name=?, approved_at=datetime('now','localtime')
                  WHERE id=?`).run(userId, approverName?.name || null, versionId);
              db.prepare(`UPDATE ce_project_bom SET
                  status='approved', approver_id=?, approver_name=?, approved_at=datetime('now','localtime'),
                  current_version_id=?, updated_at=datetime('now','localtime'), reject_reason=NULL
                  WHERE id=?`).run(userId, approverName?.name || null, versionId, version.ce_bom_id);
              db.prepare(`DELETE FROM ce_project_bom_items WHERE ce_bom_id=? AND is_deleted=1`).run(version.ce_bom_id);
            }
            break;
          }
        }
      } else {
        db.prepare(
          `UPDATE approval_records
           SET current_step = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`
        ).run(record.current_step + 1, recordId);
      }
    });

    transaction();

    const updatedRecord = db.prepare(
      `SELECT ar.*, u.name as submitter_name, af.flow_name
       FROM approval_records ar
       LEFT JOIN users u ON ar.submitter_id = u.id
       LEFT JOIN approval_flows af ON ar.flow_id = af.id
       WHERE ar.id = ?`
    ).get(recordId) as any;

    const stepRecords = db.prepare(
      'SELECT * FROM approval_step_records WHERE approval_record_id = ? ORDER BY step_index ASC'
    ).all(recordId);

    updatedRecord.step_records = stepRecords;

    return res.json(createSuccessResponse(updatedRecord, '审批通过成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '审批操作失败'));
  }
});

router.post('/records/:id/reject', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const recordId = parseInt(req.params.id);
    const userId = req.user!.id;
    const { reject_reason, reason, comment, form_data } = req.body;
    const finalReason = reject_reason || reason;

    if (!finalReason) {
      return res.status(400).json(createErrorResponse('驳回原因为必填项'));
    }

    const db = getDb();

    const record = db.prepare('SELECT * FROM approval_records WHERE id = ?').get(recordId) as any;
    if (!record) {
      return res.status(404).json(createErrorResponse('审批记录不存在'));
    }

    if (record.status !== 'pending') {
      return res.status(400).json(createErrorResponse('该审批记录已处理，无法重复操作'));
    }

    const currentStep = db.prepare(
      `SELECT * FROM approval_step_records
       WHERE approval_record_id = ? AND step_index = ? AND status = 'pending'`
    ).get(recordId, record.current_step) as any;

    if (!currentStep) {
      return res.status(400).json(createErrorResponse('未找到当前待审批步骤'));
    }

    if (currentStep.approver_id !== userId) {
      return res.status(403).json(createErrorResponse('您不是当前步骤的审批人'));
    }

    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE approval_step_records
         SET status = 'rejected', comment = ?, approved_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(comment || finalReason, currentStep.id);

      db.prepare(
        `UPDATE approval_records
         SET status = 'rejected', reject_reason = ?, rejected_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
         WHERE id = ?`
      ).run(finalReason, recordId);

      const module = record.module;
      const businessId = record.record_id;
      switch (module) {
        case 'project_plan':
          db.prepare(`UPDATE project_plans SET status='draft', updated_at=datetime('now','localtime') WHERE id=?`).run(businessId);
          break;
        case 'acceptance_form':
          db.prepare(`UPDATE acceptance_forms SET status='draft', updated_at=datetime('now','localtime') WHERE id=?`).run(businessId);
          break;
        case 'acceptance_plan':
          db.prepare(`UPDATE acceptance_plans SET status='draft', updated_at=datetime('now','localtime') WHERE id=?`).run(businessId);
          break;
        case 'apqp_gate':
          db.prepare(`UPDATE apqp_gates SET gate_status='draft', approval_status='rejected', flow_instance_id=NULL WHERE id=?`).run(businessId);
          break;
        case 'ce_archive': {
          const bidStr2 = String(businessId);
          if (bidStr2.startsWith('ce_batch_')) {
            const batchId = parseInt(bidStr2.replace('ce_batch_', ''));
            const batch = db.prepare('SELECT * FROM ce_archive_batches WHERE id = ?').get(batchId) as any;
            if (batch) {
              const fd = form_data || (batch.form_data ? JSON.parse(batch.form_data) : {});
              const nande_status = fd.nande_status || 'pending';
              const ouce_status = fd.ouce_status || 'pending';
              const archive_status_manual = fd.archive_status_manual || 'not_archived';
              const alternative_suggestion = fd.alternative_suggestion || null;
              const approval_remark = fd.approval_remark || finalReason;
              db.prepare(`UPDATE ce_materials SET compliance_status='non_compliant',
                  nande_status=?, ouce_status=?, archive_status_manual=?,
                  alternative_model=COALESCE(?, alternative_model), alternative_suggestion=?,
                  updated_at=datetime('now','localtime') WHERE id=?`)
                .run(nande_status, ouce_status, archive_status_manual,
                     alternative_suggestion, alternative_suggestion, batch.material_id);
              db.prepare(`UPDATE ce_archive_batches SET status='rejected', approval_status='rejected',
                  approver_id=?, approver_name=?, rejected_at=datetime('now','localtime'),
                  reject_reason=?, form_data=? WHERE id=?`)
                .run(userId, (db.prepare('SELECT name FROM users WHERE id=?').get(userId) as any)?.name || null,
                     finalReason, JSON.stringify(fd), batchId);
              const archiveIds = JSON.parse(batch.archive_ids || '[]');
              const updArch = db.prepare(`UPDATE ce_material_archives SET status='rejected',
                  approval_status='rejected', reject_reason=?, approval_form_data=? WHERE id=?`);
              archiveIds.forEach((aid: number) => updArch.run(finalReason, JSON.stringify(fd), aid));
            }
          } else {
            db.prepare(`UPDATE ce_material_archives SET status='rejected', approval_status='rejected', reject_reason=? WHERE id=?`).run(finalReason, businessId);
          }
          break;
        }
        case 'ce_material_change': {
          // CE物料信息变更审批驳回 → 将pending版本标记为rejected，不更新物料
          const versionId = businessId;
          db.prepare(`UPDATE document_versions SET status='rejected', approved_at=datetime('now','localtime') WHERE id=? AND module='ce_material' AND status='pending'`)
            .run(versionId);
          break;
        }
        case 'ce_bom': {
          // CE项目BOM审批驳回 → 版本标记rejected，BOM回到draft状态，恢复软删除的行
          const versionId = businessId;
          const version = db.prepare(`SELECT * FROM ce_project_bom_versions WHERE id=?`).get(versionId) as any;
          if (version) {
            db.prepare(`UPDATE ce_project_bom_versions SET status='rejected', reject_reason=?, approved_at=datetime('now','localtime') WHERE id=?`)
              .run(finalReason, versionId);
            db.prepare(`UPDATE ce_project_bom SET status='draft', reject_reason=?, updated_at=datetime('now','localtime') WHERE id=?`)
              .run(finalReason, version.ce_bom_id);
            db.prepare(`UPDATE ce_project_bom_items SET is_deleted=0, delete_reason=NULL, deleted_at=NULL WHERE ce_bom_id=? AND is_deleted=1`)
              .run(version.ce_bom_id);
          }
          break;
        }
      }
    });

    transaction();

    const updatedRecord = db.prepare(
      `SELECT ar.*, u.name as submitter_name, af.flow_name
       FROM approval_records ar
       LEFT JOIN users u ON ar.submitter_id = u.id
       LEFT JOIN approval_flows af ON ar.flow_id = af.id
       WHERE ar.id = ?`
    ).get(recordId) as any;

    const stepRecords = db.prepare(
      'SELECT * FROM approval_step_records WHERE approval_record_id = ? ORDER BY step_index ASC'
    ).all(recordId);

    updatedRecord.step_records = stepRecords;

    return res.json(createSuccessResponse(updatedRecord, '审批驳回成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '驳回操作失败'));
  }
});

export default router;
