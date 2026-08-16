import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import {
  createSuccessResponse,
  createErrorResponse,
  generateCode,
  exportToExcel,
  exportToPDF
} from '../utils/export';
import { createApprovalRecord } from '../utils/approval';

const router = express.Router();
router.use(authMiddleware);

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
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
    cb(null, `${timestamp}_${name}${ext}`);
  }
});
const upload = multer({ storage });

router.get('/configs', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_type, category } = req.query;
    let sql = 'SELECT * FROM acceptance_configs WHERE is_active = 1';
    const params: any[] = [];
    if (project_type) {
      sql += ' AND project_type = ?';
      params.push(project_type);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY sort_order ASC, id ASC';
    const configs = db.prepare(sql).all(...params);
    res.json(createSuccessResponse(configs));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/configs', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_type, category, item_name, item_description, standard, method, sort_order } = req.body;
    const userId = req.user!.id;
    const result = db.prepare(
      `INSERT INTO acceptance_configs (project_type, category, item_name, item_description, standard, method, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(project_type, category, item_name, item_description || '', standard || '', method || '', sort_order || 0, userId);
    const config = db.prepare('SELECT * FROM acceptance_configs WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(config));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/configs/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { project_type, category, item_name, item_description, standard, method, sort_order } = req.body;
    db.prepare(
      `UPDATE acceptance_configs SET project_type=?, category=?, item_name=?, item_description=?, standard=?, method=?, sort_order=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(project_type, category, item_name, item_description || '', standard || '', method || '', sort_order || 0, id);
    const config = db.prepare('SELECT * FROM acceptance_configs WHERE id = ?').get(id);
    res.json(createSuccessResponse(config));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.delete('/configs/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    db.prepare("UPDATE acceptance_configs SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(id);
    res.json(createSuccessResponse({ id }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/forms', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_id, status } = req.query;
    let sql = `SELECT f.*, p.project_name, p.project_code
               FROM acceptance_forms f
               LEFT JOIN projects p ON f.project_id = p.id
               WHERE 1=1`;
    const params: any[] = [];
    if (project_id) {
      sql += ' AND f.project_id = ?';
      params.push(parseInt(project_id as string));
    }
    if (status) {
      sql += ' AND f.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY f.created_at DESC';
    const forms = db.prepare(sql).all(...params);
    res.json(createSuccessResponse(forms));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/forms/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const form = db.prepare(
      `SELECT f.*, p.project_name, p.project_code
       FROM acceptance_forms f
       LEFT JOIN projects p ON f.project_id = p.id
       WHERE f.id = ?`
    ).get(id) as any;
    if (!form) {
      return res.status(404).json(createErrorResponse('验收单不存在'));
    }
    const items = db.prepare(
      `SELECT i.*, w.station_name, w.station_code, u.name as inspector_name
       FROM acceptance_form_items i
       LEFT JOIN workstations w ON i.workstation_id = w.id
       LEFT JOIN users u ON i.inspector_id = u.id
       WHERE i.form_id = ?
       ORDER BY w.sort_order ASC, i.category ASC, i.sort_order ASC`
    ).all(id);
    const grouped: any = {};
    (items as any[]).forEach(item => {
      const stationKey = item.workstation_id ? `${item.station_code}-${item.station_name}` : 'general';
      if (!grouped[stationKey]) {
        grouped[stationKey] = { workstation_id: item.workstation_id, station_name: item.station_name, station_code: item.station_code, categories: {} };
      }
      if (!grouped[stationKey].categories[item.category]) {
        grouped[stationKey].categories[item.category] = [];
      }
      grouped[stationKey].categories[item.category].push(item);
    });
    const attachments = db.prepare('SELECT * FROM acceptance_attachments WHERE form_id = ?').all(id);
    form.items_by_workstation = Object.values(grouped);
    form.attachments = attachments;
    res.json(createSuccessResponse(form));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/forms', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_id } = req.body;
    const userId = req.user!.id;
    const project = db.prepare('SELECT project_type FROM projects WHERE id = ?').get(project_id) as any;
    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }
    const form_code = generateCode('ACC');
    const result = db.prepare(
      `INSERT INTO acceptance_forms (project_id, project_type, form_code, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`
    ).run(project_id, project.project_type, form_code, userId);
    const form = db.prepare(
      `SELECT f.*, p.project_name, p.project_code
       FROM acceptance_forms f LEFT JOIN projects p ON f.project_id = p.id WHERE f.id = ?`
    ).get(result.lastInsertRowid);
    res.json(createSuccessResponse(form));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/generate/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const projectId = parseInt(req.params.projectId);
    const userId = req.user!.id;
    const project = db.prepare('SELECT id, project_type, project_code, project_name FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }
    const workstations = db.prepare('SELECT * FROM workstations WHERE project_id = ? ORDER BY sort_order ASC').all(projectId) as any[];
    const configs = db.prepare(
      'SELECT * FROM acceptance_configs WHERE project_type = ? AND is_active = 1 ORDER BY category ASC, sort_order ASC'
    ).all(project.project_type) as any[];
    const form_code = generateCode('ACC');
    const formResult = db.prepare(
      `INSERT INTO acceptance_forms (project_id, project_type, form_code, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`
    ).run(projectId, project.project_type, form_code, userId);
    const formId = formResult.lastInsertRowid as number;

    const insertItem = db.prepare(
      `INSERT INTO acceptance_form_items (form_id, workstation_id, config_id, category, item_name, standard, method, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let sortOrder = 1;
    if (workstations.length > 0) {
      workstations.forEach(ws => {
        configs.forEach(cfg => {
          insertItem.run(formId, ws.id, cfg.id, cfg.category, cfg.item_name, cfg.standard, cfg.method, sortOrder++);
        });
      });
    } else {
      configs.forEach(cfg => {
        insertItem.run(formId, null, cfg.id, cfg.category, cfg.item_name, cfg.standard, cfg.method, sortOrder++);
      });
    }

    const form = db.prepare(
      `SELECT f.*, p.project_name, p.project_code FROM acceptance_forms f LEFT JOIN projects p ON f.project_id = p.id WHERE f.id = ?`
    ).get(formId) as any;
    const items = db.prepare(
      `SELECT i.*, w.station_name, w.station_code FROM acceptance_form_items i LEFT JOIN workstations w ON i.workstation_id = w.id WHERE i.form_id = ? ORDER BY w.sort_order ASC, i.sort_order ASC`
    ).all(formId);
    form.items = items;
    res.json(createSuccessResponse(form));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/forms/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { form_data, items } = req.body;
    const userId = req.user!.id;

    if (form_data) {
      const { acceptance_date, conclusion } = form_data;
      db.prepare(
        `UPDATE acceptance_forms SET acceptance_date=?, conclusion=?, updated_at=datetime('now','localtime') WHERE id=?`
      ).run(acceptance_date || null, conclusion || null, id);
    }

    if (items && Array.isArray(items)) {
      const updateItem = db.prepare(
        `UPDATE acceptance_form_items SET result=?, is_pass=?, remark=?, inspector_id=?, inspect_date=?, updated_at=datetime('now','localtime') WHERE id=? AND form_id=?`
      );
      const today = dayjs().format('YYYY-MM-DD');
      items.forEach((item: any) => {
        updateItem.run(
          item.result || null,
          item.is_pass !== undefined ? (item.is_pass ? 1 : 0) : null,
          item.remark || null,
          item.inspector_id || userId,
          item.inspect_date || today,
          item.id,
          id
        );
      });
    }

    const form = db.prepare(
      `SELECT f.*, p.project_name, p.project_code FROM acceptance_forms f LEFT JOIN projects p ON f.project_id = p.id WHERE f.id = ?`
    ).get(id);
    res.json(createSuccessResponse(form));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/forms/:id/submit', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const form = db.prepare('SELECT * FROM acceptance_forms WHERE id = ?').get(id) as any;
    if (!form) {
      return res.status(404).json(createErrorResponse('验收单不存在'));
    }
    const approvalRecordId = createApprovalRecord('acceptance_form', id, 'acceptance_form', userId, { projectId: form.project_id });
    db.prepare(
      `UPDATE acceptance_forms SET status='pending', approval_record_id=?, submitted_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`
    ).run(approvalRecordId, id);
    res.json(createSuccessResponse({ id, status: 'pending', approval_record_id: approvalRecordId }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.delete('/forms/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM acceptance_forms WHERE id = ?').run(id);
    res.json(createSuccessResponse({ id }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/forms/:id/attachments', upload.single('file'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { attach_type } = req.body;
    const file = req.file;
    const userId = req.user!.id;
    if (!file) {
      return res.status(400).json(createErrorResponse('请上传文件'));
    }
    const validTypes = ['EHS', 'ESD', '红丹验证', '应力报告', '其他'];
    if (!validTypes.includes(attach_type)) {
      return res.status(400).json(createErrorResponse('附件类型无效'));
    }
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const result = db.prepare(
      `INSERT INTO acceptance_attachments (form_id, attach_type, file_name, file_path, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, attach_type, decodedName, file.filename, file.size, userId);
    const attachment = db.prepare('SELECT * FROM acceptance_attachments WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(attachment));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/plans', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_id, status } = req.query;
    let sql = `SELECT ap.*, p.project_name, p.project_code, u.name as creator_name
               FROM acceptance_plans ap
               LEFT JOIN projects p ON ap.project_id = p.id
               LEFT JOIN users u ON ap.created_by = u.id
               WHERE 1=1`;
    const params: any[] = [];
    if (project_id) {
      sql += ' AND ap.project_id = ?';
      params.push(parseInt(project_id as string));
    }
    if (status) {
      sql += ' AND ap.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY ap.created_at DESC';
    const plans = db.prepare(sql).all(...params);
    res.json(createSuccessResponse(plans));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/plans/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const plan = db.prepare(
      `SELECT ap.*, p.project_name, p.project_code, u.name as creator_name
       FROM acceptance_plans ap
       LEFT JOIN projects p ON ap.project_id = p.id
       LEFT JOIN users u ON ap.created_by = u.id
       WHERE ap.id = ?`
    ).get(id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('验收计划不存在'));
    }
    const items = db.prepare(
      `SELECT pi.*, u.name as assignee_name
       FROM acceptance_plan_items pi
       LEFT JOIN users u ON pi.assignee_id = u.id
       WHERE pi.plan_id = ?
       ORDER BY pi.sort_order ASC, pi.id ASC`
    ).all(id) as any[];
    const itemIds = items.map(i => i.id);
    let deliverables: any[] = [];
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      deliverables = db.prepare(
        `SELECT * FROM deliverables WHERE module='acceptance_plan_item' AND task_id IN (${placeholders})`
      ).all(...itemIds) as any[];
    }
    const itemsWithDeliverables = items.map(item => ({
      ...item,
      deliverables: deliverables.filter(d => d.task_id === item.id)
    }));
    plan.items = itemsWithDeliverables;
    res.json(createSuccessResponse(plan));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/plans', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { project_id, plan_name, items, start_date, end_date } = req.body;
    const userId = req.user!.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }
    const trx = db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO acceptance_plans (project_id, plan_name, plan_items, start_date, end_date, status, version, created_by)
         VALUES (?, ?, '[]', ?, ?, 'draft', 1, ?)`
      ).run(project_id, plan_name, start_date || null, end_date || null, userId);
      const planId = result.lastInsertRowid as number;
      if (items && Array.isArray(items)) {
        const insertItem = db.prepare(
          `INSERT INTO acceptance_plan_items (plan_id, item_name, item_type, assignee_id, planned_date, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        items.forEach((item: any, idx: number) => {
          insertItem.run(
            planId,
            item.item_name,
            item.item_type || 'task',
            item.assignee_id || null,
            item.planned_date || null,
            item.sort_order || idx + 1
          );
        });
      }
      return planId;
    });
    const planId = trx();
    const plan = db.prepare(
      `SELECT ap.*, p.project_name, p.project_code FROM acceptance_plans ap LEFT JOIN projects p ON ap.project_id = p.id WHERE ap.id = ?`
    ).get(planId);
    res.json(createSuccessResponse(plan));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/plans/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { plan_name, start_date, end_date, items } = req.body;
    const plan = db.prepare('SELECT * FROM acceptance_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('验收计划不存在'));
    }

    const trx = db.transaction(() => {
      let newVersion = plan.version;
      let newStatus = plan.status;
      if (plan.status === 'approved') {
        newVersion = plan.version + 1;
        newStatus = 'draft';
      }
      db.prepare(
        `UPDATE acceptance_plans SET plan_name=?, start_date=?, end_date=?, version=?, status=?, approval_record_id=NULL, updated_at=datetime('now','localtime') WHERE id=?`
      ).run(
        plan_name || plan.plan_name,
        start_date !== undefined ? start_date : plan.start_date,
        end_date !== undefined ? end_date : plan.end_date,
        newVersion,
        newStatus,
        id
      );
      if (items && Array.isArray(items)) {
        const insertItem = db.prepare(
          `INSERT INTO acceptance_plan_items (plan_id, item_name, item_type, assignee_id, planned_date, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        const updateItem = db.prepare(
          `UPDATE acceptance_plan_items SET item_name=?, item_type=?, assignee_id=?, planned_date=?, sort_order=?, updated_at=datetime('now','localtime') WHERE id=? AND plan_id=?`
        );
        const existingIds = items.filter((i: any) => i.id).map((i: any) => i.id);
        items.forEach((item: any, idx: number) => {
          if (item.id) {
            updateItem.run(
              item.item_name,
              item.item_type || 'task',
              item.assignee_id || null,
              item.planned_date || null,
              item.sort_order || idx + 1,
              item.id,
              id
            );
          } else {
            insertItem.run(
              id,
              item.item_name,
              item.item_type || 'task',
              item.assignee_id || null,
              item.planned_date || null,
              item.sort_order || idx + 1
            );
          }
        });
        if (existingIds.length > 0) {
          const placeholders = existingIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM acceptance_plan_items WHERE plan_id = ? AND id NOT IN (${placeholders})`).run(id, ...existingIds);
        } else {
          db.prepare('DELETE FROM acceptance_plan_items WHERE plan_id = ?').run(id);
        }
      }
    });
    trx();
    const updatedPlan = db.prepare(
      `SELECT ap.*, p.project_name, p.project_code FROM acceptance_plans ap LEFT JOIN projects p ON ap.project_id = p.id WHERE ap.id = ?`
    ).get(id);
    res.json(createSuccessResponse(updatedPlan));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/plans/:id/submit', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const userId = req.user!.id;
    const plan = db.prepare('SELECT * FROM acceptance_plans WHERE id = ?').get(id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('验收计划不存在'));
    }
    const approvalRecordId = createApprovalRecord('acceptance_plan', id, 'acceptance_plan', userId, { projectId: plan.project_id });
    db.prepare(
      `UPDATE acceptance_plans SET status='pending', approval_record_id=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(approvalRecordId, id);
    res.json(createSuccessResponse({ id, status: 'pending', approval_record_id: approvalRecordId }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.delete('/plans/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM acceptance_plans WHERE id = ?').run(id);
    res.json(createSuccessResponse({ id }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/plans/items/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { status, actual_date, result, remark } = req.body;
    const userId = req.user!.id;
    const item = db.prepare('SELECT * FROM acceptance_plan_items WHERE id = ?').get(id) as any;
    if (!item) {
      return res.status(404).json(createErrorResponse('计划项不存在'));
    }
    if (status === 'completed' && item.deliverable_required === 1) {
      const deliverableCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM deliverables WHERE module='acceptance_plan_item' AND task_id = ?"
      ).get(id) as any;
      if (deliverableCount.cnt === 0) {
        return res.status(400).json(createErrorResponse('该任务需要上传交付物后才能完成'));
      }
    }
    const finalActualDate = status === 'completed' ? (actual_date || dayjs().format('YYYY-MM-DD')) : actual_date;
    db.prepare(
      `UPDATE acceptance_plan_items SET status=?, actual_date=?, result=?, remark=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(
      status || item.status,
      finalActualDate || null,
      result || null,
      remark || null,
      id
    );
    const updatedItem = db.prepare(
      `SELECT pi.*, u.name as assignee_name FROM acceptance_plan_items pi LEFT JOIN users u ON pi.assignee_id = u.id WHERE pi.id = ?`
    ).get(id);
    res.json(createSuccessResponse(updatedItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/plans/items/:id/deliverables', upload.single('file'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const file = req.file;
    const userId = req.user!.id;
    if (!file) {
      return res.status(400).json(createErrorResponse('请上传文件'));
    }
    const item = db.prepare('SELECT * FROM acceptance_plan_items WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('计划项不存在'));
    }
    const planItem = item as any;
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const result = db.prepare(
      `INSERT INTO deliverables (module, record_id, task_id, file_name, file_path, file_size, file_type, uploaded_by)
       VALUES ('acceptance_plan_item', ?, ?, ?, ?, ?, ?, ?)`
    ).run(planItem.plan_id, id, decodedName, file.filename, file.size, file.mimetype, userId);
    const deliverable = db.prepare('SELECT * FROM deliverables WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(deliverable));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/forms/:id/export', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const format = (req.query.format as string) || 'excel';
    const form = db.prepare(
      `SELECT f.*, p.project_name, p.project_code
       FROM acceptance_forms f LEFT JOIN projects p ON f.project_id = p.id WHERE f.id = ?`
    ).get(id) as any;
    if (!form) {
      return res.status(404).json(createErrorResponse('验收单不存在'));
    }
    const items = db.prepare(
      `SELECT i.*, w.station_name, w.station_code, u.name as inspector_name
       FROM acceptance_form_items i
       LEFT JOIN workstations w ON i.workstation_id = w.id
       LEFT JOIN users u ON i.inspector_id = u.id
       WHERE i.form_id = ?
       ORDER BY w.sort_order ASC, i.category ASC, i.sort_order ASC`
    ).all(id) as any[];

    let approverName: string | undefined;
    let isApproved = form.status === 'approved';
    if (isApproved && form.approval_record_id) {
      const lastApproval = db.prepare(
        `SELECT approver_name FROM approval_step_records WHERE approval_record_id = ? AND status='approved' ORDER BY approved_at DESC LIMIT 1`
      ).get(form.approval_record_id) as any;
      if (lastApproval) approverName = lastApproval.approver_name;
    }

    const headers = ['工位', '类别', '验收项目', '验收标准', '检验方法', '检验结果', '是否合格', '备注', '检验人', '检验日期'];
    const rows = items.map(i => [
      i.station_name || '通用',
      i.category,
      i.item_name,
      i.standard || '',
      i.method || '',
      i.result || '',
      i.is_pass === 1 ? '合格' : i.is_pass === 0 ? '不合格' : '',
      i.remark || '',
      i.inspector_name || '',
      i.inspect_date || ''
    ]);

    const title = `验收单-${form.form_code}-${form.project_name}`;

    if (format === 'pdf') {
      return exportToPDF(res, `${form.form_code}.pdf`, title, { headers, rows }, {
        watermark: isApproved ? '已批准' : undefined,
        approverName,
        isControlled: true
      });
    }

    const metaRows: any[][] = [
      ['验收单编号', form.form_code, '项目名称', form.project_name],
      ['项目编号', form.project_code, '验收日期', form.acceptance_date || ''],
      ['状态', form.status, '结论', form.conclusion || '']
    ];

    await exportToExcel(res, `${form.form_code}.xlsx`, [
      { name: '验收单信息', headers: ['字段', '值', '字段', '值'], rows: metaRows },
      { name: '验收项目明细', headers, rows }
    ]);
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/plans/:id/export', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const format = (req.query.format as string) || 'excel';
    const plan = db.prepare(
      `SELECT ap.*, p.project_name, p.project_code, u.name as creator_name
       FROM acceptance_plans ap LEFT JOIN projects p ON ap.project_id = p.id LEFT JOIN users u ON ap.created_by = u.id WHERE ap.id = ?`
    ).get(id) as any;
    if (!plan) {
      return res.status(404).json(createErrorResponse('验收计划不存在'));
    }
    const items = db.prepare(
      `SELECT pi.*, u.name as assignee_name
       FROM acceptance_plan_items pi LEFT JOIN users u ON pi.assignee_id = u.id WHERE pi.plan_id = ? ORDER BY pi.sort_order ASC`
    ).all(id) as any[];

    let approverName: string | undefined;
    let isApproved = plan.status === 'approved';
    if (isApproved && plan.approval_record_id) {
      const lastApproval = db.prepare(
        `SELECT approver_name FROM approval_step_records WHERE approval_record_id = ? AND status='approved' ORDER BY approved_at DESC LIMIT 1`
      ).get(plan.approval_record_id) as any;
      if (lastApproval) approverName = lastApproval.approver_name;
    }

    const headers = ['序号', '验收项', '类型', '负责人', '计划日期', '实际日期', '状态', '结果', '备注'];
    const rows = items.map((i, idx) => [
      idx + 1,
      i.item_name,
      i.item_type,
      i.assignee_name || '',
      i.planned_date || '',
      i.actual_date || '',
      i.status,
      i.result || '',
      i.remark || ''
    ]);

    const title = `验收计划-${plan.plan_name}-${plan.project_name}`;

    if (format === 'pdf') {
      return exportToPDF(res, `${plan.plan_name}.pdf`, title, { headers, rows }, {
        watermark: isApproved ? '已批准' : undefined,
        approverName,
        isControlled: true
      });
    }

    const metaRows: any[][] = [
      ['计划名称', plan.plan_name, '项目名称', plan.project_name],
      ['项目编号', plan.project_code, '版本', 'V' + plan.version],
      ['开始日期', plan.start_date || '', '结束日期', plan.end_date || ''],
      ['状态', plan.status, '创建人', plan.creator_name || '']
    ];

    await exportToExcel(res, `${plan.plan_name}.xlsx`, [
      { name: '计划信息', headers: ['字段', '值', '字段', '值'], rows: metaRows },
      { name: '验收项明细', headers, rows }
    ]);
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

export default router;
