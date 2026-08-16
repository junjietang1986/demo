import express, { Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import dayjs from 'dayjs';

const router = express.Router();
router.use(authMiddleware);

function ensureTables(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_name TEXT NOT NULL,
      project_type TEXT,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_template_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      parent_id INTEGER DEFAULT 0,
      predecessor_temp_id INTEGER DEFAULT 0,
      scheduling_mode TEXT DEFAULT 'auto',
      task_name TEXT NOT NULL,
      task_type TEXT DEFAULT 'task',
      department TEXT,
      assignee_role TEXT,
      duration_days INTEGER DEFAULT 1,
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      milestone_summary TEXT,
      sort_order INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      is_milestone INTEGER DEFAULT 0,
      description TEXT,
      FOREIGN KEY (template_id) REFERENCES plan_templates(id) ON DELETE CASCADE
    )
  `);
  const cols = db.prepare("PRAGMA table_info(plan_template_tasks)").all() as any[];
  const colNames = cols.map(c => c.name);
  const addColIfMissing = (name: string, def: string) => {
    if (!colNames.includes(name)) {
      try { db.exec(`ALTER TABLE plan_template_tasks ADD COLUMN ${name} ${def}`); } catch (e) {}
    }
  };
  addColIfMissing('predecessor_temp_id', 'INTEGER DEFAULT 0');
  addColIfMissing('scheduling_mode', 'TEXT DEFAULT \'auto\'');
  addColIfMissing('progress', 'INTEGER DEFAULT 0');
  addColIfMissing('status', 'TEXT DEFAULT \'pending\'');
  addColIfMissing('milestone_summary', 'TEXT');
}

function buildTemplateTaskTree(tasks: any[]) {
  const map = new Map<number, any>();
  const roots: any[] = [];
  tasks.forEach(t => map.set(t.id, { ...t, children: [] }));
  tasks.forEach(t => {
    const node = map.get(t.id)!;
    if (t.parent_id && t.parent_id !== 0 && map.has(t.parent_id)) {
      map.get(t.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  function sortNodes(nodes: any[]) {
    nodes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
    nodes.forEach(n => sortNodes(n.children));
  }
  sortNodes(roots);
  return roots;
}

router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const templates = db.prepare(`
      SELECT t.*, u.name AS creator_name,
        (SELECT COUNT(*) FROM plan_template_tasks tt WHERE tt.template_id = t.id) AS task_count
      FROM plan_templates t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.is_default DESC, t.created_at DESC
    `).all() as any[];
    return res.json(createSuccessResponse(templates));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const { id } = req.params;
    const template = db.prepare('SELECT * FROM plan_templates WHERE id = ?').get(id) as any;
    if (!template) {
      return res.status(404).json(createErrorResponse('模板不存在'));
    }
    const tasks = db.prepare(`
      SELECT * FROM plan_template_tasks WHERE template_id = ? ORDER BY sort_order ASC, id ASC
    `).all(id) as any[];
    return res.json(createSuccessResponse({ ...template, tasks: buildTemplateTaskTree(tasks) }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const { template_name, project_type, description, tasks = [] } = req.body;
    if (!template_name) {
      return res.status(400).json(createErrorResponse('模板名称不能为空'));
    }
    const result = db.prepare(`
      INSERT INTO plan_templates (template_name, project_type, description, created_by)
      VALUES (?, ?, ?, ?)
    `).run(template_name, project_type || null, description || null, req.user?.id || null);
    const templateId = result.lastInsertRowid;
    if (tasks && tasks.length > 0) {
      saveTemplateTasks(db, templateId, tasks, 0, 1);
    }
    const created = db.prepare('SELECT * FROM plan_templates WHERE id = ?').get(templateId);
    return res.json(createSuccessResponse(created, '模板创建成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

function saveTemplateTasks(db: any, templateId: number, tasks: any[], parentId: number, level: number) {
  const insert = db.prepare(`
    INSERT INTO plan_template_tasks (template_id, parent_id, predecessor_temp_id, scheduling_mode, task_name, task_type, department, assignee_role, duration_days, progress, status, milestone_summary, sort_order, level, is_milestone, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const oldToNew = new Map<any, number>();
  const ordered = [...tasks];
  ordered.forEach((t: any, idx: number) => {
    const isMilestone = t.task_type === 'milestone' ? 1 : (t.is_milestone ? 1 : 0);
    let duration = t.duration_days || 0;
    if (!duration && t.start_date && t.end_date) {
      duration = Math.max(1, dayjs(t.end_date).diff(dayjs(t.start_date), 'day') + 1);
    }
    const r = insert.run(
      templateId,
      parentId,
      0,
      t.scheduling_mode || 'auto',
      t.task_name,
      t.task_type || 'task',
      t.department || null,
      t.assignee_role || null,
      duration,
      t.progress || 0,
      t.status || 'pending',
      t.milestone_summary || null,
      t.sort_order || idx,
      level,
      isMilestone,
      t.description || null
    );
    oldToNew.set(t.id || t._tempId || idx, r.lastInsertRowid);
    if (t.children && t.children.length > 0) {
      saveTemplateTasks(db, templateId, t.children, r.lastInsertRowid, level + 1);
    }
  });
  ordered.forEach((t: any, idx: number) => {
    if (t.predecessor_id || t.predecessor_temp_id) {
      const predKey = t.predecessor_temp_id || t.predecessor_id;
      const myNewId = oldToNew.get(t.id || t._tempId || idx);
      const predNewId = oldToNew.get(predKey);
      if (myNewId && predNewId) {
        db.prepare('UPDATE plan_template_tasks SET predecessor_temp_id = ? WHERE id = ?').run(predNewId, myNewId);
      }
    }
  });
}

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const { id } = req.params;
    const { template_name, project_type, description, tasks } = req.body;
    const existing = db.prepare('SELECT id FROM plan_templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(createErrorResponse('模板不存在'));
    }
    db.prepare(`
      UPDATE plan_templates SET
        template_name = COALESCE(?, template_name),
        project_type = COALESCE(?, project_type),
        description = COALESCE(?, description),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(template_name || null, project_type || null, description || null, id);
    if (tasks !== undefined) {
      db.prepare('DELETE FROM plan_template_tasks WHERE template_id = ?').run(id);
      if (tasks.length > 0) {
        saveTemplateTasks(db, Number(id), tasks, 0, 1);
      }
    }
    const updated = db.prepare('SELECT * FROM plan_templates WHERE id = ?').get(id);
    return res.json(createSuccessResponse(updated, '模板更新成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM plan_templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json(createErrorResponse('模板不存在'));
    }
    db.prepare('DELETE FROM plan_template_tasks WHERE template_id = ?').run(id);
    db.prepare('DELETE FROM plan_templates WHERE id = ?').run(id);
    return res.json(createSuccessResponse(null, '删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/:id/apply/:planId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const { id, planId } = req.params;
    const { replace = true } = req.body || {};
    const template = db.prepare('SELECT * FROM plan_templates WHERE id = ?').get(id) as any;
    if (!template) {
      return res.status(404).json(createErrorResponse('模板不存在'));
    }
    const plan = db.prepare('SELECT id FROM project_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json(createErrorResponse('计划不存在'));
    }
    const templateTasks = db.prepare(`
      SELECT * FROM plan_template_tasks WHERE template_id = ? ORDER BY sort_order ASC, id ASC
    `).all(id) as any[];
    if (templateTasks.length === 0) {
      return res.status(400).json(createErrorResponse('模板中没有任务'));
    }

    if (replace) {
      db.prepare('DELETE FROM plan_tasks WHERE plan_id = ?').run(planId);
    }

    const flatTasks = buildTemplateTaskTree(templateTasks);
    const tplIdToPlanId = new Map<number, number>();
    const insertTask = db.prepare(`
      INSERT INTO plan_tasks (plan_id, parent_id, predecessor_id, scheduling_mode, task_name, task_type, department, assignee_id, start_date, end_date, duration_days, progress, status, milestone_summary, sort_order, level)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    function insertTasks(tasks: any[], parentDbId: number, startDate: dayjs.Dayjs) {
      tasks.forEach((t: any, idx: number) => {
        let taskStart = startDate;
        if (t.predecessor_temp_id && tplIdToPlanId.has(t.predecessor_temp_id)) {
          const predPlanId = tplIdToPlanId.get(t.predecessor_temp_id)!;
          const predRow = db.prepare('SELECT end_date FROM plan_tasks WHERE id = ?').get(predPlanId) as any;
          if (predRow && predRow.end_date) {
            taskStart = dayjs(predRow.end_date).add(1, 'day');
          } else {
            taskStart = startDate.add(idx, 'day');
          }
        } else if (!t.parent_id || t.parent_id === 0) {
          taskStart = startDate.add(idx, 'day');
        }
        const dur = t.duration_days > 0 ? t.duration_days : 1;
        let taskEnd = t.task_type === 'milestone' ? taskStart : taskStart.add(dur - 1, 'day');
        const r = insertTask.run(
          planId,
          parentDbId,
          0,
          t.scheduling_mode || 'auto',
          t.task_name,
          t.task_type || 'task',
          t.department || null,
          taskStart.format('YYYY-MM-DD'),
          taskEnd.format('YYYY-MM-DD'),
          dur,
          t.progress || 0,
          t.status || 'pending',
          t.milestone_summary || null,
          t.sort_order || idx,
          t.level || 1
        );
        const newPlanId = r.lastInsertRowid as number;
        tplIdToPlanId.set(t.id, newPlanId);
        if (t.children && t.children.length > 0) {
          insertTasks(t.children, newPlanId, taskStart);
        }
      });
    }
    const today = dayjs();
    insertTasks(flatTasks, 0, today);

    const updPred = db.prepare('UPDATE plan_tasks SET predecessor_id = ? WHERE id = ?');
    templateTasks.forEach((tt: any) => {
      if (tt.predecessor_temp_id) {
        const planId_ofTt = tplIdToPlanId.get(tt.id);
        const planId_ofPred = tplIdToPlanId.get(tt.predecessor_temp_id);
        if (planId_ofTt && planId_ofPred) {
          updPred.run(planId_ofPred, planId_ofTt);
        }
      }
    });

    return res.json(createSuccessResponse({ inserted: templateTasks.length }, replace ? '模板应用成功（已替换现有任务）' : '模板应用成功（已追加任务）'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/save-from-plan/:planId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    ensureTables(db);
    const { planId } = req.params;
    const { template_name, project_type, description } = req.body;
    if (!template_name) {
      return res.status(400).json(createErrorResponse('模板名称不能为空'));
    }
    const plan = db.prepare('SELECT id, project_id FROM project_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json(createErrorResponse('计划不存在'));
    }
    const tasks = db.prepare(`
      SELECT id, parent_id, predecessor_id, scheduling_mode, task_name, task_type, department, assignee_id,
        start_date, end_date, progress, status, duration_days, sort_order, level, milestone_summary
      FROM plan_tasks WHERE plan_id = ? ORDER BY sort_order ASC, id ASC
    `).all(planId) as any[];
    const result = db.prepare(`
      INSERT INTO plan_templates (template_name, project_type, description, created_by)
      VALUES (?, ?, ?, ?)
    `).run(template_name, project_type || null, description || null, req.user?.id || null);
    const templateId = result.lastInsertRowid;
    const insertTplTask = db.prepare(`
      INSERT INTO plan_template_tasks (template_id, parent_id, predecessor_temp_id, scheduling_mode, task_name, task_type, department, assignee_role, duration_days, progress, status, milestone_summary, sort_order, level, is_milestone)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `);
    const oldToNew = new Map<number, number>();
    const sortedTasks = [...tasks].sort((a, b) => a.level - b.level || a.sort_order - b.sort_order);
    sortedTasks.forEach((t: any) => {
      const duration = t.duration_days && t.duration_days > 0 ? t.duration_days : (() => {
        const startDate = t.start_date ? dayjs(t.start_date) : dayjs();
        const endDate = t.end_date ? dayjs(t.end_date) : startDate;
        return Math.max(1, endDate.diff(startDate, 'day') + 1);
      })();
      const newParentId = t.parent_id && t.parent_id !== 0 ? (oldToNew.get(t.parent_id) || 0) : 0;
      const newPredId = t.predecessor_id && t.predecessor_id !== 0 ? (oldToNew.get(t.predecessor_id) || 0) : 0;
      const isMilestone = t.task_type === 'milestone' ? 1 : 0;
      const r = insertTplTask.run(
        templateId,
        newParentId,
        newPredId,
        t.scheduling_mode || 'auto',
        t.task_name,
        t.task_type || 'task',
        t.department || null,
        duration,
        t.progress || 0,
        t.status || 'pending',
        t.milestone_summary || null,
        t.sort_order || 0,
        t.level || 1,
        isMilestone
      );
      oldToNew.set(t.id, r.lastInsertRowid);
    });
    const created = db.prepare('SELECT * FROM plan_templates WHERE id = ?').get(templateId);
    return res.json(createSuccessResponse(created, '模板保存成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

function seedDefaultTemplates(db: any) {
  const count = db.prepare('SELECT COUNT(*) as c FROM plan_templates').get() as any;

  const insert = db.prepare(`
    INSERT INTO plan_templates (template_name, project_type, description, is_default, created_by)
    VALUES (?, ?, ?, 1, 1)
  `);

  if (count.c === 0) {
    const gTemplate = insert.run('G项目标准模板', 'G项目-小工装', 'G项目-小工装项目标准任务模板（部门请根据实际组织架构分配）');
    const gTasks = [
      { name: '项目启动', type: 'milestone', days: 0, level: 1, children: [
        { name: '需求分析', type: 'task', days: 3, level: 2 },
        { name: '方案设计评审', type: 'task', days: 2, level: 2 }
      ]},
      { name: '机械设计', type: 'task', days: 7, level: 1 },
      { name: '电气设计', type: 'task', days: 7, level: 1 },
      { name: '加工制造', type: 'task', days: 10, level: 1 },
      { name: '装配调试', type: 'task', days: 5, level: 1, children: [
        { name: '机械装配', type: 'task', days: 3, level: 2 },
        { name: '电气接线', type: 'task', days: 2, level: 2 }
      ]},
      { name: '内部验收', type: 'milestone', days: 1, level: 1 },
      { name: '客户验收', type: 'milestone', days: 1, level: 1 }
    ];
    seedTemplateTasks(db, gTemplate.lastInsertRowid, gTasks, 0, 1);
    const pTemplate = insert.run('P项目产线标准模板', 'P项目-产线', 'P项目-产线项目标准任务模板（部门请根据实际组织架构分配）');
    const pTasks = [
      { name: '项目启动', type: 'milestone', days: 0, level: 1 },
      { name: '方案设计', type: 'task', days: 10, level: 1, children: [
        { name: '机械方案', type: 'task', days: 5, level: 2 },
        { name: '电气方案', type: 'task', days: 5, level: 2 },
        { name: '方案评审', type: 'milestone', days: 1, level: 2 }
      ]},
      { name: '详细设计', type: 'task', days: 15, level: 1, children: [
        { name: '机械详细设计', type: 'task', days: 10, level: 2 },
        { name: '电气详细设计', type: 'task', days: 10, level: 2 },
        { name: 'BOM输出', type: 'task', days: 3, level: 2 }
      ]},
      { name: '物料采购', type: 'task', days: 20, level: 1 },
      { name: '加工制造', type: 'task', days: 20, level: 1 },
      { name: '装配', type: 'task', days: 15, level: 1 },
      { name: '厂内调试', type: 'task', days: 10, level: 1, children: [
        { name: '单工位调试', type: 'task', days: 5, level: 2 },
        { name: '联线调试', type: 'task', days: 5, level: 2 }
      ]},
      { name: '预验收', type: 'milestone', days: 2, level: 1 },
      { name: '客户现场安装', type: 'task', days: 7, level: 1 },
      { name: '客户现场调试', type: 'task', days: 7, level: 1 },
      { name: '终验收', type: 'milestone', days: 2, level: 1 }
    ];
    seedTemplateTasks(db, pTemplate.lastInsertRowid, pTasks, 0, 1);
    const plabTemplate = insert.run('P项目实验室设备标准模板', 'P项目-实验室设备', 'P项目-实验室设备标准任务模板（部门请根据实际组织架构分配）');
    const plabTasks = [
      { name: '项目启动', type: 'milestone', days: 0, level: 1 },
      { name: '方案设计', type: 'task', days: 10, level: 1 },
      { name: '详细设计', type: 'task', days: 15, level: 1 },
      { name: '物料采购', type: 'task', days: 20, level: 1 },
      { name: '加工制造', type: 'task', days: 20, level: 1 },
      { name: '装配调试', type: 'task', days: 10, level: 1 },
      { name: '厂内验收', type: 'milestone', days: 1, level: 1 },
      { name: '终验收', type: 'milestone', days: 1, level: 1 }
    ];
    seedTemplateTasks(db, plabTemplate.lastInsertRowid, plabTasks, 0, 1);
  } else {
    db.prepare('UPDATE plan_template_tasks SET department = NULL WHERE template_id IN (SELECT id FROM plan_templates WHERE is_default = 1)').run();
  }
}

function seedTemplateTasks(db: any, templateId: number, tasks: any[], parentId: number, level: number) {
  const insert = db.prepare(`
    INSERT INTO plan_template_tasks (template_id, parent_id, task_name, task_type, department, duration_days, sort_order, level, is_milestone)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
  `);
  tasks.forEach((t: any, idx: number) => {
    const r = insert.run(
      templateId, parentId, t.name, t.type, t.days, idx, level, t.type === 'milestone' ? 1 : 0
    );
    if (t.children && t.children.length > 0) {
      seedTemplateTasks(db, templateId, t.children, r.lastInsertRowid, level + 1);
    }
  });
}

export function initPlanTemplates() {
  const db = getDb();
  ensureTables(db);
  seedDefaultTemplates(db);
}

export default router;
