import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse, exportToExcel, exportToMSProjectXml } from '../utils/export';
import { createApprovalRecord } from '../utils/approval';
import dayjs from 'dayjs';

const router = express.Router();

router.use(authMiddleware);

function canEditPlan(plan: any, user: any): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'system_admin') return true;
  if (plan && plan.created_by === user.id) return true;
  return false;
}

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    cb(null, `${timestamp}_${baseName}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function buildTaskTree(tasks: any[]) {
  const map = new Map<number, any>();
  const roots: any[] = [];

  tasks.forEach(task => {
    map.set(task.id, { ...task, children: [] });
  });

  tasks.forEach(task => {
    const node = map.get(task.id)!;
    if (task.parent_id && map.has(task.parent_id)) {
      map.get(task.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  function sortChildren(nodes: any[]) {
    nodes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
    nodes.forEach(n => sortChildren(n.children));
  }
  sortChildren(roots);

  return roots;
}

function getDescendantTaskIds(db: any, taskId: number): number[] {
  const ids: number[] = [];
  const queue = [taskId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ids.push(current);
    const children = db.prepare('SELECT id FROM plan_tasks WHERE parent_id = ?').all(current) as any[];
    children.forEach(c => queue.push(c.id));
  }
  return ids;
}

function calculateTaskLevel(db: any, parentId: number): number {
  if (!parentId || parentId === 0) return 1;
  const parent = db.prepare('SELECT level FROM plan_tasks WHERE id = ?').get(parentId) as any;
  return parent ? parent.level + 1 : 1;
}

router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { project_id } = req.query;

    let sql = `
      SELECT pp.*,
        p.project_name,
        p.project_code,
        u.name AS creator_name,
        (SELECT COUNT(*) FROM plan_tasks pt WHERE pt.plan_id = pp.id) AS task_count,
        (SELECT COUNT(*) FROM plan_tasks pt WHERE pt.plan_id = pp.id AND pt.task_type = 'milestone') AS milestone_count,
        (SELECT ROUND(AVG(pt.progress), 0) FROM plan_tasks pt WHERE pt.plan_id = pp.id AND pt.progress IS NOT NULL) AS avg_progress
      FROM project_plans pp
      LEFT JOIN projects p ON pp.project_id = p.id
      LEFT JOIN users u ON pp.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (project_id) {
      sql += ' AND pp.project_id = ?';
      params.push(project_id);
    }

    sql += ' ORDER BY pp.created_at DESC';

    const plans = db.prepare(sql).all(...params);
    return res.json(createSuccessResponse(plans));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取计划列表失败'));
  }
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const plan = db.prepare(`
      SELECT pp.*,
        p.project_name,
        p.project_code,
        u.name AS creator_name
      FROM project_plans pp
      LEFT JOIN projects p ON pp.project_id = p.id
      LEFT JOIN users u ON pp.created_by = u.id
      WHERE pp.id = ?
    `).get(id);

    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }

    const tasks = db.prepare(`
      SELECT pt.*,
        u.name AS assignee_name
      FROM plan_tasks pt
      LEFT JOIN users u ON pt.assignee_id = u.id
      WHERE pt.plan_id = ?
      ORDER BY pt.sort_order ASC, pt.id ASC
    `).all(id) as any[];

    const taskIds = tasks.map(t => t.id);
    const deliverablesMap = new Map<number, any[]>();
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      const deliverables = db.prepare(`
        SELECT d.*, u.name AS uploader_name
        FROM deliverables d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.task_id IN (${placeholders}) AND d.module = 'plan_task'
        ORDER BY d.created_at ASC
      `).all(...taskIds) as any[];

      deliverables.forEach(d => {
        if (!deliverablesMap.has(d.task_id)) {
          deliverablesMap.set(d.task_id, []);
        }
        deliverablesMap.get(d.task_id)!.push(d);
      });
    }

    tasks.forEach(task => {
      task.deliverables = deliverablesMap.get(task.id) || [];
    });

    return res.json(createSuccessResponse({ ...plan, tasks: tasks }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取计划详情失败'));
  }
});

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { project_id, plan_name, department } = req.body;

    if (!project_id || !plan_name) {
      return res.status(400).json(createErrorResponse('项目ID和计划名称不能为空'));
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) {
      return res.status(404).json(createErrorResponse('关联项目不存在'));
    }

    const result = db.prepare(`
      INSERT INTO project_plans (project_id, plan_name, department, version, status, created_by)
      VALUES (?, ?, ?, 1, 'draft', ?)
    `).run(project_id, plan_name, department || null, req.user?.id || null);

    const newPlan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(result.lastInsertRowid);
    return res.json(createSuccessResponse(newPlan));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '创建计划失败'));
  }
});

router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { plan_name, department, project_id } = req.body;

    const existing = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }

    let newStatus = existing.status;
    let newVersion = existing.version;

    if (existing.status === 'approved') {
      newStatus = 'pending';
      newVersion = existing.version + 1;
    }

    db.prepare(`
      UPDATE project_plans SET
        plan_name = COALESCE(?, plan_name),
        department = COALESCE(?, department),
        project_id = COALESCE(?, project_id),
        status = ?,
        version = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      plan_name || null,
      department || null,
      project_id || null,
      newStatus,
      newVersion,
      id
    );

    if (existing.status === 'approved') {
      const approvalRecordId = createApprovalRecord('project_plan', Number(id), 'project_plan', req.user?.id || 0, { projectId: existing.project_id });
      db.prepare('UPDATE project_plans SET approval_record_id = ? WHERE id = ?').run(approvalRecordId, id);
    }

    const updated = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id);
    return res.json(createSuccessResponse(updated));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新计划失败'));
  }
});

router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM project_plans WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }

    const deliverables = db.prepare(`
      SELECT d.* FROM deliverables d
      INNER JOIN plan_tasks pt ON d.task_id = pt.id
      WHERE pt.plan_id = ? AND d.module = 'plan_task'
    `).all(id) as any[];

    deliverables.forEach(d => {
      try {
        if (fs.existsSync(d.file_path)) fs.unlinkSync(d.file_path);
      } catch (_e) {}
    });

    db.prepare('DELETE FROM deliverables WHERE module = ? AND task_id IN (SELECT id FROM plan_tasks WHERE plan_id = ?)').run('plan_task', id);
    db.prepare('DELETE FROM plan_tasks WHERE plan_id = ?').run(id);
    db.prepare('DELETE FROM project_plans WHERE id = ?').run(id);

    return res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除计划失败'));
  }
});

router.post('/:id/save', (req: Request, res: Response, next: NextFunction) => {
  const db = getDb();
  const { id } = req.params;
  const { tasks } = req.body as { tasks: any[] };

  const tx = db.transaction(() => {
    const plan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id) as any;
    if (!plan) throw new Error('项目计划不存在');

    if (!canEditPlan(plan, (req as any).user)) throw new Error('无权修改此计划');

    const oldTasks = db.prepare(`SELECT pt.*, u.name AS assignee_name FROM plan_tasks pt LEFT JOIN users u ON pt.assignee_id = u.id WHERE pt.plan_id = ?`).all(id) as any[];

    const shouldSnapshot = oldTasks.length > 0;
    if (shouldSnapshot) {
      const versionLabel = 'V' + String(plan.version).padStart(2, '0');
      const existingSnap = db.prepare(`SELECT id FROM document_versions WHERE module = ? AND record_id = ? AND version_no = ?`).get('project_plan', id, plan.version);
      if (!existingSnap) {
        db.prepare(`
          INSERT INTO document_versions (module, record_id, version_no, version_label, status, is_current, source_type, snapshot_data, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, 0, 'manual', ?, ?, datetime('now','localtime'))
        `).run(
          'project_plan',
          id,
          plan.version,
          versionLabel,
          plan.status,
          JSON.stringify({ plan: { ...plan }, tasks: oldTasks }),
          (req as any).user?.id || null
        );
      }
    }

    db.prepare('DELETE FROM plan_tasks WHERE plan_id = ?').run(id);

    const newVersion = shouldSnapshot ? plan.version + 1 : plan.version;
    let newStatus = plan.status;
    if (plan.status === 'approved') {
      newStatus = 'draft';
    }

    const insertTask = db.prepare(`
      INSERT INTO plan_tasks (
        plan_id, parent_id, predecessor_id, scheduling_mode, task_name, task_type,
        department, assignee_id, start_date, end_date, actual_start_date, actual_end_date,
        progress, status, duration_days, sort_order, level, milestone_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tempIdMap = new Map<number, number>();
    const sortedTasks = [...(tasks || [])].sort((a, b) => (a.level || 1) - (b.level || 1));

    sortedTasks.forEach((t: any) => {
      const rawParent = t.parent_id || 0;
      const rawPred = t.predecessor_id || 0;
      const resolvedParent = rawParent < 0 ? (tempIdMap.get(rawParent) || 0) : rawParent;
      const resolvedPred = rawPred < 0 ? (tempIdMap.get(rawPred) || 0) : rawPred;
      const info = insertTask.run(
        id,
        resolvedParent,
        resolvedPred,
        t.scheduling_mode || 'auto',
        t.task_name,
        t.task_type || 'task',
        t.department || null,
        t.assignee_id || null,
        t.start_date || null,
        t.end_date || null,
        t.actual_start_date || null,
        t.actual_end_date || null,
        t.progress ?? 0,
        t.status || 'pending',
        t.duration_days || 1,
        t.sort_order || 0,
        t.level || 1,
        t.milestone_summary || null
      );
      if (t.id < 0) {
        tempIdMap.set(t.id, Number(info.lastInsertRowid));
      }
    });

    db.prepare(`
      UPDATE project_plans SET version = ?, status = ?, updated_at = datetime('now','localtime'), approval_record_id = NULL WHERE id = ?
    `).run(newVersion, newStatus, id);

    return { newVersion, newStatus, changes: { created: sortedTasks.length, deleted: oldTasks.length }, isFirstSave: !shouldSnapshot };
  });

  try {
    const result = tx();
    const updated = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id);
    const freshTasks = db.prepare(`SELECT pt.*, u.name AS assignee_name FROM plan_tasks pt LEFT JOIN users u ON pt.assignee_id = u.id WHERE pt.plan_id = ? ORDER BY pt.sort_order`).all(id);
    return res.json(createSuccessResponse({ plan: updated, tasks: freshTasks, ...result }, result.isFirstSave ? '保存成功' : `保存成功，已创建新版本 V${String((result as any).newVersion).padStart(2, '0')}`));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '保存失败'));
  }
});

router.post('/:id/submit', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const plan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }

    if (plan.status === 'approved') {
      return res.status(400).json(createErrorResponse('已审批通过的计划不能重复提交'));
    }

    const taskCount = db.prepare('SELECT COUNT(*) as cnt FROM plan_tasks WHERE plan_id = ?').get(id) as any;
    if (taskCount.cnt === 0) {
      return res.status(400).json(createErrorResponse('计划中没有任务，无法提交审批'));
    }

    const approvalRecordId = createApprovalRecord('project_plan', Number(id), 'project_plan', req.user?.id || 0, { projectId: plan.project_id });

    db.prepare(`
      UPDATE project_plans SET
        status = 'pending',
        approval_record_id = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(approvalRecordId, id);

    const updated = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id);
    return res.json(createSuccessResponse(updated, '提交审批成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '提交审批失败'));
  }
});

router.post('/:id/tasks', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      parent_id = 0,
      predecessor_id = 0,
      scheduling_mode = 'auto',
      task_name,
      task_type = 'task',
      department,
      assignee_id,
      start_date,
      end_date,
      duration_days = 1,
      sort_order = 0,
      level
    } = req.body;

    const plan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }
    if (!canEditPlan(plan, req.user)) {
      return res.status(403).json(createErrorResponse('只有计划编制者或管理员才能修改计划'));
    }
    if (plan.status === 'submitted' || plan.status === 'approved') {
      return res.status(400).json(createErrorResponse(plan.status === 'approved' ? '计划已审批通过，不能修改' : '计划审批中，不能修改'));
    }

    if (!task_name) {
      return res.status(400).json(createErrorResponse('任务名称不能为空'));
    }

    if (parent_id && parent_id !== 0) {
      const parentTask = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(parent_id) as any;
      if (!parentTask) {
        return res.status(404).json(createErrorResponse('父任务不存在'));
      }
      if (parentTask.plan_id !== Number(id)) {
        return res.status(400).json(createErrorResponse('父任务不属于当前计划'));
      }
      if (end_date && parentTask.end_date && end_date > parentTask.end_date) {
        return res.status(400).json(createErrorResponse(`子任务完成时间(${end_date})不能晚于父阶段"${parentTask.task_name}"的完成时间(${parentTask.end_date})`));
      }
    }

    const calculatedLevel = level || calculateTaskLevel(db, parent_id || 0);

    let finalStart = start_date || null;
    let finalEnd = end_date || null;
    if (scheduling_mode === 'auto' && predecessor_id && !start_date) {
      const predTask = db.prepare('SELECT end_date FROM plan_tasks WHERE id = ? AND plan_id = ?').get(predecessor_id, id) as any;
      if (predTask && predTask.end_date) {
        finalStart = addDays(predTask.end_date, 1);
        finalEnd = calcEndDate(finalStart, duration_days);
      }
    }

    const result = db.prepare(`
      INSERT INTO plan_tasks (
        plan_id, parent_id, predecessor_id, scheduling_mode, task_name, task_type, department,
        assignee_id, start_date, end_date, progress, status,
        duration_days, sort_order, level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?)
    `).run(
      id,
      parent_id || 0,
      predecessor_id || 0,
      scheduling_mode,
      task_name,
      task_type,
      department || null,
      assignee_id || null,
      finalStart,
      finalEnd,
      duration_days,
      sort_order || 0,
      calculatedLevel
    );

    const newTask = db.prepare(`
      SELECT pt.*, u.name AS assignee_name
      FROM plan_tasks pt
      LEFT JOIN users u ON pt.assignee_id = u.id
      WHERE pt.id = ?
    `).get(result.lastInsertRowid);

    return res.json(createSuccessResponse(newTask));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '添加任务失败'));
  }
});

router.put('/tasks/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const updates = req.body;

    const existing = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('任务不存在'));
    }

    const plan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(existing.plan_id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }
    if (!canEditPlan(plan, req.user)) {
      return res.status(403).json(createErrorResponse('只有计划编制者或管理员才能修改计划'));
    }
    if (plan.status === 'submitted' || plan.status === 'approved') {
      return res.status(400).json(createErrorResponse(plan.status === 'approved' ? '计划已审批通过，不能修改' : '计划审批中，不能修改'));
    }

    const fields: string[] = [];
    const values: any[] = [];
    const allowedFields = ['task_name', 'department', 'assignee_id', 'start_date', 'end_date',
      'actual_start_date', 'actual_end_date', 'status', 'progress', 'milestone_summary',
      'task_type', 'sort_order', 'parent_id', 'predecessor_id', 'scheduling_mode', 'duration_days'];

    const currentMode = updates.scheduling_mode !== undefined ? updates.scheduling_mode : existing.scheduling_mode;

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field] === '' ? null : updates[field]);
      }
    });

    const startDateAfter = updates.start_date !== undefined ? (updates.start_date || null) : existing.start_date;
    const endDateAfter = updates.end_date !== undefined ? (updates.end_date || null) : existing.end_date;
    const durationAfter = updates.duration_days !== undefined ? updates.duration_days : existing.duration_days;

    if (currentMode === 'auto') {
      if (updates.start_date !== undefined && updates.end_date === undefined && updates.duration_days === undefined && startDateAfter) {
        const newEnd = calcEndDate(startDateAfter, durationAfter || 1);
        fields.push('end_date = ?');
        values.push(newEnd);
      } else if (updates.end_date !== undefined && updates.start_date !== undefined && startDateAfter && endDateAfter) {
        const s = new Date(startDateAfter);
        const e = new Date(endDateAfter);
        const diffDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        fields.push('duration_days = ?');
        values.push(diffDays);
      }
    }

    if (updates.predecessor_id !== undefined && currentMode === 'auto' && updates.predecessor_id && !updates.start_date) {
      const predTask = db.prepare('SELECT end_date FROM plan_tasks WHERE id = ?').get(updates.predecessor_id) as any;
      if (predTask && predTask.end_date) {
        const newStart = addDays(predTask.end_date, 1);
        const newEnd = calcEndDate(newStart, durationAfter || 1);
        if (!updates.start_date) { fields.push('start_date = ?'); values.push(newStart); }
        if (!updates.end_date) { fields.push('end_date = ?'); values.push(newEnd); }
      }
    }

    if (updates.scheduling_mode === 'auto' && existing.scheduling_mode !== 'auto') {
      const predId = updates.predecessor_id !== undefined ? updates.predecessor_id : existing.predecessor_id;
      if (predId) {
        const predTask = db.prepare('SELECT end_date FROM plan_tasks WHERE id = ?').get(predId) as any;
        if (predTask && predTask.end_date) {
          const newStart = addDays(predTask.end_date, 1);
          const newEnd = calcEndDate(newStart, durationAfter || 1);
          fields.push('start_date = ?', 'end_date = ?');
          values.push(newStart, newEnd);
        }
      }
    }

    if (updates.parent_id !== undefined) {
      const newLevel = calculateTaskLevel(db, updates.parent_id || 0);
      fields.push('level = ?');
      values.push(newLevel);
    }

    const parentIdAfter = updates.parent_id !== undefined ? (updates.parent_id || 0) : existing.parent_id;
    let endDateToCheck = endDateAfter;
    if (fields.includes('end_date = ?')) {
      const idx = fields.indexOf('end_date = ?');
      endDateToCheck = values[idx];
    }
    if (parentIdAfter && parentIdAfter !== 0 && endDateToCheck) {
      const parentRow = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(parentIdAfter) as any;
      if (parentRow && parentRow.end_date && endDateToCheck > parentRow.end_date) {
        return res.status(400).json(createErrorResponse(`子任务完成时间(${endDateToCheck})不能晚于父阶段"${parentRow.task_name}"的完成时间(${parentRow.end_date})`));
      }
    }

    if (fields.length === 0) {
      const current = db.prepare(`SELECT pt.*, u.name AS assignee_name FROM plan_tasks pt LEFT JOIN users u ON pt.assignee_id = u.id WHERE pt.id = ?`).get(id);
      return res.json(createSuccessResponse(current));
    }

    fields.push(`updated_at = datetime('now', 'localtime')`);
    values.push(id);

    db.prepare(`UPDATE plan_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (updates.parent_id !== undefined) {
      updateDescendantLevels(db, Number(id));
    }

    const updatedTask = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(id) as any;
    if (updatedTask) {
      cascadeAutoScheduledTasks(db, updatedTask);
    }

    const updated = db.prepare(`
      SELECT pt.*, u.name AS assignee_name
      FROM plan_tasks pt
      LEFT JOIN users u ON pt.assignee_id = u.id
      WHERE pt.id = ?
    `).get(id);

    return res.json(createSuccessResponse(updated));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新任务失败'));
  }
});

function updateDescendantLevels(db: any, parentId: number) {
  const parent = db.prepare('SELECT level FROM plan_tasks WHERE id = ?').get(parentId) as any;
  if (!parent) return;
  const parentLevel = parent.level;
  
  const children = db.prepare('SELECT id FROM plan_tasks WHERE parent_id = ?').all(parentId) as any[];
  for (const child of children) {
    const childLevel = parentLevel + 1;
    db.prepare('UPDATE plan_tasks SET level = ? WHERE id = ?').run(childLevel, child.id);
    updateDescendantLevels(db, child.id);
  }
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function calcEndDate(startDate: string, durationDays: number): string {
  if (!startDate) return '';
  return addDays(startDate, Math.max(1, durationDays) - 1);
}

function cascadeAutoScheduledTasks(db: any, sourceTask: any) {
  const successors = db.prepare(
    'SELECT * FROM plan_tasks WHERE plan_id = ? AND predecessor_id = ? AND scheduling_mode = ?'
  ).all(sourceTask.plan_id, sourceTask.id, 'auto') as any[];

  for (const succ of successors) {
    if (!sourceTask.end_date) continue;
    const newStart = addDays(sourceTask.end_date, 1);
    const newEnd = calcEndDate(newStart, succ.duration_days || 1);
    db.prepare(
      'UPDATE plan_tasks SET start_date = ?, end_date = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?'
    ).run(newStart, newEnd, succ.id);
    const updatedSucc = { ...succ, start_date: newStart, end_date: newEnd };
    cascadeAutoScheduledTasks(db, updatedSucc);
  }
}

router.delete('/tasks/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('任务不存在'));
    }

    const plan = db.prepare('SELECT * FROM project_plans WHERE id = ?').get(existing.plan_id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }
    if (!canEditPlan(plan, req.user)) {
      return res.status(403).json(createErrorResponse('只有计划编制者或管理员才能修改计划'));
    }
    if (plan.status === 'submitted' || plan.status === 'approved') {
      return res.status(400).json(createErrorResponse(plan.status === 'approved' ? '计划已审批通过，不能修改' : '计划审批中，不能修改'));
    }

    const allDescendantIds = getDescendantTaskIds(db, Number(id));

    const placeholders = allDescendantIds.map(() => '?').join(',');
    const deliverables = db.prepare(`
      SELECT * FROM deliverables WHERE task_id IN (${placeholders}) AND module = 'plan_task'
    `).all(...allDescendantIds) as any[];

    deliverables.forEach(d => {
      try {
        if (fs.existsSync(d.file_path)) fs.unlinkSync(d.file_path);
      } catch (_e) {}
    });

    db.prepare(`DELETE FROM deliverables WHERE task_id IN (${placeholders}) AND module = 'plan_task'`).run(...allDescendantIds);

    for (let i = allDescendantIds.length - 1; i >= 0; i--) {
      db.prepare('DELETE FROM plan_tasks WHERE id = ?').run(allDescendantIds[i]);
    }

    return res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除任务失败'));
  }
});

router.put('/tasks/:id/progress', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { progress } = req.body;

    if (progress == null || progress < 0 || progress > 100) {
      return res.status(400).json(createErrorResponse('进度值必须在0-100之间'));
    }

    const existing = db.prepare('SELECT id, actual_start_date FROM plan_tasks WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('任务不存在'));
    }

    let taskStatus = 'in_progress';
    if (progress === 0) taskStatus = 'pending';
    if (progress === 100) taskStatus = 'completed';

    const updates: string[] = ['progress = ?', 'status = ?', 'updated_at = datetime(\'now\', \'localtime\')'];
    const params: any[] = [progress, taskStatus];

    if (progress === 100) {
      updates.push('actual_end_date = COALESCE(actual_end_date, date(\'now\', \'localtime\'))');
    }
    if (progress > 0 && !existing.actual_start_date) {
      updates.push('actual_start_date = date(\'now\', \'localtime\')');
    }

    params.push(id);

    db.prepare(`UPDATE plan_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare(`
      SELECT pt.*, u.name AS assignee_name
      FROM plan_tasks pt
      LEFT JOIN users u ON pt.assignee_id = u.id
      WHERE pt.id = ?
    `).get(id);

    return res.json(createSuccessResponse(updated));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新任务进度失败'));
  }
});

router.get('/:id/gantt', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const plan = db.prepare('SELECT id FROM project_plans WHERE id = ?').get(id);
    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }

    const tasks = db.prepare(`
      SELECT pt.*, u.name AS assignee_name
      FROM plan_tasks pt
      LEFT JOIN users u ON pt.assignee_id = u.id
      WHERE pt.plan_id = ?
      ORDER BY pt.sort_order ASC, pt.id ASC
    `).all(id) as any[];

    const statusColorMap: Record<string, string> = {
      pending: 'gantt-pending',
      in_progress: 'gantt-in-progress',
      completed: 'gantt-completed',
      delayed: 'gantt-delayed'
    };

    const ganttTasks = tasks.map(t => ({
      id: t.id,
      name: t.task_name,
      start: t.start_date,
      end: t.end_date,
      progress: t.progress || 0,
      dependencies: t.parent_id && t.parent_id !== 0 ? t.parent_id : null,
      custom_class: statusColorMap[t.status] || 'gantt-pending',
      type: t.task_type,
      assignee: t.assignee_name,
      level: t.level,
      parent: t.parent_id || 0,
      milestone_summary: t.milestone_summary
    }));

    return res.json(createSuccessResponse(ganttTasks));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取甘特图数据失败'));
  }
});

router.get('/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const viewType = (req.query.view_type as string) || 'all';
    const format = (req.query.format as string) || 'excel';

    const plan = db.prepare(`
      SELECT pp.*, p.project_name, p.project_code, u.name AS creator_name
      FROM project_plans pp
      LEFT JOIN projects p ON pp.project_id = p.id
      LEFT JOIN users u ON pp.created_by = u.id
      WHERE pp.id = ?
    `).get(id) as any;

    if (!plan) {
      return res.status(404).json(createErrorResponse('项目计划不存在'));
    }

    const rawTasks = db.prepare(`
      SELECT pt.*, u.name AS assignee_name
      FROM plan_tasks pt
      LEFT JOIN users u ON pt.assignee_id = u.id
      WHERE pt.plan_id = ?
      ORDER BY pt.id ASC
    `).all(id) as any[];

    const taskMap = new Map<number, any>();
    rawTasks.forEach(t => taskMap.set(t.id, { ...t, children: [] }));

    const roots: any[] = [];
    rawTasks.forEach(t => {
      const task = taskMap.get(t.id)!;
      if (t.parent_id && t.parent_id > 0 && taskMap.has(t.parent_id)) {
        taskMap.get(t.parent_id)!.children.push(task);
      } else {
        roots.push(task);
      }
    });

    const sortChildren = (list: any[]) => {
      list.sort((a, b) => a.sort_order - b.sort_order);
      list.forEach(t => { if (t.children && t.children.length > 0) sortChildren(t.children); });
    };
    sortChildren(roots);

    const orderedTasks: any[] = [];
    const flattenWalk = (list: any[]) => {
      for (const t of list) {
        orderedTasks.push(t);
        if (t.children && t.children.length > 0) flattenWalk(t.children);
      }
    };
    flattenWalk(roots);

    const tasks = orderedTasks;

    const statusTextMap: Record<string, string> = {
      pending: '未开始',
      in_progress: '进行中',
      completed: '已完成',
      delayed: '已延期'
    };

    const taskTypeTextMap: Record<string, string> = {
      milestone: '里程碑',
      phase: '阶段任务',
      task: '普通任务'
    };

    const planStatusText = plan.status === 'draft' ? '草稿' : plan.status === 'pending' ? '审批中' : plan.status === 'approved' ? '已审批' : plan.status;

    const overviewHeaders = ['项目编码', '项目名称', '计划名称', '部门', '版本', '状态', '创建人', '创建时间'];
    const overviewRows = [[
      plan.project_code || '',
      plan.project_name || '',
      plan.plan_name,
      plan.department || '',
      `V${plan.version}`,
      planStatusText,
      plan.creator_name || '',
      plan.created_at || ''
    ]];

    const milestones = tasks.filter(t => t.task_type === 'milestone');
    const phases = tasks.filter(t => t.task_type === 'phase' || (t.children && t.children.length > 0));

    const milestoneHeaders = ['序号', '里程碑名称', '负责人', '部门', '计划开始', '计划完成', '状态', '进度(%)', '备注'];
    const milestoneRows = milestones.map((m, idx) => [
      idx + 1,
      m.task_name,
      m.assignee_name || '',
      m.department || '',
      m.start_date || '',
      m.end_date || '',
      statusTextMap[m.status] || m.status,
      m.progress || 0,
      m.milestone_summary || ''
    ]);

    const phaseHeaders = ['序号', '阶段/任务名称', '类型', '负责人', '部门', '计划开始', '计划完成', '工期(天)', '状态', '进度(%)'];
    const phaseRows = phases.map((p, idx) => {
      let duration = '';
      if (p.start_date && p.end_date) {
        duration = String(dayjs(p.end_date).diff(dayjs(p.start_date), 'day') + 1);
      }
      return [
        idx + 1,
        '  '.repeat(Math.max(0, p.level - 1)) + p.task_name,
        taskTypeTextMap[p.task_type] || '普通任务',
        p.assignee_name || '',
        p.department || '',
        p.start_date || '',
        p.end_date || '',
        duration,
        statusTextMap[p.status] || p.status,
        p.progress || 0
      ];
    });

    const taskHeaders = ['序号', '层级', '任务名称', '类型', '负责人', '部门', '计划开始', '计划完成', '工期(天)', '实际开始', '实际完成', '状态', '进度(%)', '备注'];
    const taskRows = tasks.map((t, idx) => {
      let duration = '';
      if (t.start_date && t.end_date) {
        duration = String(dayjs(t.end_date).diff(dayjs(t.start_date), 'day') + 1);
      }
      return [
        idx + 1,
        t.level,
        '  '.repeat(Math.max(0, t.level - 1)) + t.task_name,
        taskTypeTextMap[t.task_type] || '普通任务',
        t.assignee_name || '',
        t.department || '',
        t.start_date || '',
        t.end_date || '',
        duration,
        t.actual_start_date || '',
        t.actual_end_date || '',
        statusTextMap[t.status] || t.status,
        t.progress || 0,
        t.milestone_summary || ''
      ];
    });

    const ganttHeaders = ['序号', 'WBS', '任务名称', '类型', '负责人', '计划开始', '计划完成', '工期(天)', '进度(%)', '状态', '前置任务'];
    const ganttRows = tasks.map((t, idx) => {
      let duration = '';
      if (t.start_date && t.end_date) {
        duration = String(dayjs(t.end_date).diff(dayjs(t.start_date), 'day') + 1);
      }
      const wbs = t.wbs_code || `${t.level}-${t.sort_order}`;
      return [
        idx + 1,
        wbs,
        '  '.repeat(Math.max(0, t.level - 1)) + t.task_name,
        taskTypeTextMap[t.task_type] || '普通任务',
        t.assignee_name || '',
        t.start_date || '',
        t.end_date || '',
        duration,
        t.progress || 0,
        statusTextMap[t.status] || t.status,
        t.parent_id > 0 ? rawTasks.find(x => x.id === t.parent_id)?.task_name || '' : ''
      ];
    });

    const safePlanName = plan.plan_name.replace(/[\\/:*?"<>|]/g, '_');
    const viewNameMap: Record<string, string> = { list: '任务表', split: '组合视图', gantt: '甘特图', all: '全部' };
    const viewSuffix = viewNameMap[viewType] || '全部';
    let ext = 'xlsx';
    if (format === 'pdf') ext = 'pdf';
    else if (format === 'mpp_xml') ext = 'xml';
    const filename = `${plan.project_code || 'PLAN'}_${safePlanName}_${viewSuffix}_V${plan.version}_${dayjs().format('YYYYMMDD')}.${ext}`;

    if (format === 'mpp_xml') {
      exportToMSProjectXml(res, filename, plan, tasks);
      return;
    }

    if (format === 'pdf') {
      const { exportToPDF } = await import('../utils/export');
      let pdfTitle = `${plan.plan_name} - ${viewSuffix}`;
      let pdfContent: { headers: string[]; rows: any[][] };
      if (viewType === 'list') {
        pdfContent = { headers: taskHeaders, rows: taskRows };
      } else if (viewType === 'split') {
        pdfContent = { headers: phaseHeaders, rows: phaseRows };
      } else if (viewType === 'gantt') {
        pdfContent = { headers: ganttHeaders, rows: ganttRows };
      } else {
        pdfContent = { headers: taskHeaders, rows: taskRows };
      }
      exportToPDF(res, filename, pdfTitle, pdfContent);
      return;
    }

    let sheets: { name: string; headers: string[]; rows: any[][] }[] = [];

    if (viewType === 'list') {
      sheets = [
        { name: '项目计划概览', headers: overviewHeaders, rows: overviewRows },
        { name: '任务明细表', headers: taskHeaders, rows: taskRows }
      ];
    } else if (viewType === 'split') {
      sheets = [
        { name: '项目计划概览', headers: overviewHeaders, rows: overviewRows },
        { name: '阶段任务', headers: phaseHeaders, rows: phaseRows },
        { name: '里程碑列表', headers: milestoneHeaders, rows: milestoneRows },
        { name: '任务明细表', headers: taskHeaders, rows: taskRows }
      ];
    } else if (viewType === 'gantt') {
      sheets = [
        { name: '项目计划概览', headers: overviewHeaders, rows: overviewRows },
        { name: '甘特图数据', headers: ganttHeaders, rows: ganttRows },
        { name: '里程碑列表', headers: milestoneHeaders, rows: milestoneRows }
      ];
    } else {
      sheets = [
        { name: '项目计划概览', headers: overviewHeaders, rows: overviewRows },
        { name: '阶段任务', headers: phaseHeaders, rows: phaseRows },
        { name: '里程碑列表', headers: milestoneHeaders, rows: milestoneRows },
        { name: '任务明细表', headers: taskHeaders, rows: taskRows },
        { name: '甘特图数据', headers: ganttHeaders, rows: ganttRows }
      ];
    }

    await exportToExcel(res, filename, sheets);
  } catch (err: any) {
    if (!res.headersSent) {
      return res.status(500).json(createErrorResponse(err.message || '导出计划失败'));
    }
  }
});

router.post('/tasks/:id/deliverables', upload.array('files', 10), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    const task = db.prepare('SELECT id, plan_id FROM plan_tasks WHERE id = ?').get(id);
    if (!task) {
      if (files) {
        files.forEach(f => {
          try { fs.unlinkSync(f.path); } catch (_e) {}
        });
      }
      return res.status(404).json(createErrorResponse('任务不存在'));
    }

    if (!files || files.length === 0) {
      return res.status(400).json(createErrorResponse('请选择要上传的文件'));
    }

    const insertDeliverable = db.prepare(`
      INSERT INTO deliverables (module, record_id, task_id, file_name, file_path, file_size, file_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const savedDeliverables: any[] = [];

    files.forEach(file => {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const result = insertDeliverable.run(
        'plan_task',
        Number(id),
        Number(id),
        originalName,
        file.path,
        file.size,
        file.mimetype,
        req.user?.id || null
      );

      const saved = db.prepare(`
        SELECT d.*, u.name AS uploader_name
        FROM deliverables d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = ?
      `).get(result.lastInsertRowid);
      savedDeliverables.push(saved);
    });

    return res.json(createSuccessResponse(savedDeliverables, '上传成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '上传交付物失败'));
  }
});

router.delete('/deliverables/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const deliverable = db.prepare('SELECT * FROM deliverables WHERE id = ?').get(id) as any;
    if (!deliverable) {
      return res.status(404).json(createErrorResponse('交付物不存在'));
    }

    try {
      if (fs.existsSync(deliverable.file_path)) {
        fs.unlinkSync(deliverable.file_path);
      }
    } catch (_e) {}

    db.prepare('DELETE FROM deliverables WHERE id = ?').run(id);
    return res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除交付物失败'));
  }
});

export default router;
