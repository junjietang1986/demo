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
  generateCode
} from '../utils/export';

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

const DEFAULT_STEP_DATA = {
  current_step: 1,
  steps: {
    define: { completed: false, data: {} },
    measure: { completed: false, data: {} },
    analyze: { completed: false, data: {} },
    improve: { completed: false, data: {} },
    control: { completed: false, data: {} }
  }
};

const STEP_NAMES = ['define', 'measure', 'analyze', 'improve', 'control'];

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { status, source_module, responsible_dept } = req.query;
    let sql = `SELECT i.*,
               u1.name as responsible_person_name,
               u2.name as verifier_name,
               u3.name as creator_name
               FROM improvements i
               LEFT JOIN users u1 ON i.responsible_person_id = u1.id
               LEFT JOIN users u2 ON i.verifier_id = u2.id
               LEFT JOIN users u3 ON i.created_by = u3.id
               WHERE 1=1`;
    const params: any[] = [];
    if (status) {
      sql += ' AND i.status = ?';
      params.push(status);
    }
    if (source_module) {
      sql += ' AND i.source_module = ?';
      params.push(source_module);
    }
    if (responsible_dept) {
      sql += ' AND i.responsible_dept = ?';
      params.push(responsible_dept);
    }
    sql += ' ORDER BY i.created_at DESC';
    const improvements = db.prepare(sql).all(...params);
    res.json(createSuccessResponse(improvements));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const improvement = db.prepare(
      `SELECT i.*,
       u1.name as responsible_person_name,
       u2.name as verifier_name,
       u3.name as creator_name
       FROM improvements i
       LEFT JOIN users u1 ON i.responsible_person_id = u1.id
       LEFT JOIN users u2 ON i.verifier_id = u2.id
       LEFT JOIN users u3 ON i.created_by = u3.id
       WHERE i.id = ?`
    ).get(id) as any;
    if (!improvement) {
      return res.status(404).json(createErrorResponse('改进记录不存在'));
    }
    if (improvement.step_data) {
      try {
        improvement.step_data_parsed = JSON.parse(improvement.step_data);
      } catch (e) {
        improvement.step_data_parsed = DEFAULT_STEP_DATA;
      }
    } else {
      improvement.step_data_parsed = DEFAULT_STEP_DATA;
    }
    const attachments = db.prepare(
      'SELECT * FROM improvement_attachments WHERE improvement_id = ? ORDER BY created_at ASC'
    ).all(id);
    improvement.attachments = attachments;
    res.json(createSuccessResponse(improvement));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const {
      title,
      problem_description,
      source_module,
      source_record_id,
      responsible_dept,
      responsible_person_id,
      planned_completion_date
    } = req.body;

    if (!title || !problem_description) {
      return res.status(400).json(createErrorResponse('标题和问题描述不能为空'));
    }

    const improvement_code = generateCode('IMP');
    const stepData = JSON.stringify(DEFAULT_STEP_DATA);

    const result = db.prepare(
      `INSERT INTO improvements (
        improvement_code, title, problem_description, source_module, source_record_id,
        responsible_dept, responsible_person_id, planned_completion_date,
        status, step_data, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).run(
      improvement_code,
      title,
      problem_description,
      source_module || null,
      source_record_id || null,
      responsible_dept || null,
      responsible_person_id || null,
      planned_completion_date || null,
      stepData,
      userId
    );

    const improvement = db.prepare(
      `SELECT i.*, u1.name as responsible_person_name, u3.name as creator_name
       FROM improvements i
       LEFT JOIN users u1 ON i.responsible_person_id = u1.id
       LEFT JOIN users u3 ON i.created_by = u3.id
       WHERE i.id = ?`
    ).get(result.lastInsertRowid);
    res.json(createSuccessResponse(improvement));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const {
      title,
      problem_description,
      root_cause_analysis,
      corrective_action,
      preventive_action,
      responsible_dept,
      responsible_person_id,
      planned_completion_date
    } = req.body;

    const existing = db.prepare('SELECT * FROM improvements WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('改进记录不存在'));
    }

    db.prepare(
      `UPDATE improvements SET
       title=?, problem_description=?, root_cause_analysis=?, corrective_action=?, preventive_action=?,
       responsible_dept=?, responsible_person_id=?, planned_completion_date=?,
       updated_at=datetime('now','localtime')
       WHERE id=?`
    ).run(
      title || existing.title,
      problem_description || existing.problem_description,
      root_cause_analysis !== undefined ? root_cause_analysis : existing.root_cause_analysis,
      corrective_action !== undefined ? corrective_action : existing.corrective_action,
      preventive_action !== undefined ? preventive_action : existing.preventive_action,
      responsible_dept !== undefined ? responsible_dept : existing.responsible_dept,
      responsible_person_id !== undefined ? responsible_person_id : existing.responsible_person_id,
      planned_completion_date !== undefined ? planned_completion_date : existing.planned_completion_date,
      id
    );

    const improvement = db.prepare(
      `SELECT i.*, u1.name as responsible_person_name, u2.name as verifier_name, u3.name as creator_name
       FROM improvements i
       LEFT JOIN users u1 ON i.responsible_person_id = u1.id
       LEFT JOIN users u2 ON i.verifier_id = u2.id
       LEFT JOIN users u3 ON i.created_by = u3.id
       WHERE i.id = ?`
    ).get(id);
    res.json(createSuccessResponse(improvement));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/:id/step', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { step, data } = req.body;
    const userId = req.user!.id;

    if (!step || step < 1 || step > 5) {
      return res.status(400).json(createErrorResponse('步骤编号必须在1-5之间'));
    }

    const existing = db.prepare('SELECT * FROM improvements WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('改进记录不存在'));
    }

    let stepData: any;
    try {
      stepData = existing.step_data ? JSON.parse(existing.step_data) : { ...DEFAULT_STEP_DATA };
    } catch (e) {
      stepData = { ...DEFAULT_STEP_DATA };
    }

    if (!stepData.steps) {
      stepData.steps = { ...DEFAULT_STEP_DATA.steps };
    }

    const stepName = STEP_NAMES[step - 1];
    if (!stepData.steps[stepName]) {
      stepData.steps[stepName] = { completed: false, data: {} };
    }

    stepData.steps[stepName].data = { ...stepData.steps[stepName].data, ...data };
    stepData.steps[stepName].completed = true;
    stepData.steps[stepName].completed_at = dayjs().format('YYYY-MM-DD HH:mm:ss');
    stepData.steps[stepName].completed_by = userId;

    if (step === 1) {
      stepData.current_step = 2;
    } else if (step === 5) {
      if (data.effectiveness_verification && data.verifier_id) {
        stepData.current_step = 5;
        db.prepare(
          `UPDATE improvements SET status='completed', effectiveness_verification=?, verifier_id=?, verify_date=?, actual_completion_date=?, updated_at=datetime('now','localtime') WHERE id=?`
        ).run(
          data.effectiveness_verification,
          data.verifier_id,
          data.verify_date || dayjs().format('YYYY-MM-DD'),
          data.actual_completion_date || dayjs().format('YYYY-MM-DD'),
          id
        );
      } else {
        stepData.current_step = 5;
      }
    } else {
      stepData.current_step = step + 1;
    }

    db.prepare(
      `UPDATE improvements SET step_data=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(JSON.stringify(stepData), id);

    if (step === 2 && data) {
      const updateFields: string[] = [];
      const updateParams: any[] = [];
      if (data.problem_description !== undefined) {
        updateFields.push('problem_description=?');
        updateParams.push(data.problem_description);
      }
      if (updateFields.length > 0) {
        updateParams.push(id);
        db.prepare(`UPDATE improvements SET ${updateFields.join(',')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...updateParams);
      }
    }
    if (step === 3 && data && data.root_cause_analysis) {
      db.prepare(`UPDATE improvements SET root_cause_analysis=?, updated_at=datetime('now','localtime') WHERE id=?`).run(data.root_cause_analysis, id);
    }
    if (step === 4 && data) {
      const updateFields: string[] = [];
      const updateParams: any[] = [];
      if (data.corrective_action !== undefined) {
        updateFields.push('corrective_action=?');
        updateParams.push(data.corrective_action);
      }
      if (data.preventive_action !== undefined) {
        updateFields.push('preventive_action=?');
        updateParams.push(data.preventive_action);
      }
      if (updateFields.length > 0) {
        updateParams.push(id);
        db.prepare(`UPDATE improvements SET ${updateFields.join(',')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...updateParams);
      }
    }

    const improvement = db.prepare(
      `SELECT i.*, u1.name as responsible_person_name, u2.name as verifier_name, u3.name as creator_name
       FROM improvements i
       LEFT JOIN users u1 ON i.responsible_person_id = u1.id
       LEFT JOIN users u2 ON i.verifier_id = u2.id
       LEFT JOIN users u3 ON i.created_by = u3.id
       WHERE i.id = ?`
    ).get(id) as any;
    improvement.step_data_parsed = stepData;
    res.json(createSuccessResponse(improvement));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM improvements WHERE id = ?').run(id);
    res.json(createSuccessResponse({ id }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/from-opl/:oplId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const oplId = parseInt(req.params.oplId);
    const userId = req.user!.id;
    const opl = db.prepare('SELECT * FROM opl_records WHERE id = ?').get(oplId) as any;
    if (!opl) {
      return res.status(404).json(createErrorResponse('OPL记录不存在'));
    }

    const improvement_code = generateCode('IMP');
    const title = `OPL改进-${opl.problem_description.substring(0, 30)}`;
    const stepData = JSON.stringify(DEFAULT_STEP_DATA);

    const trx = db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO improvements (
          improvement_code, title, problem_description, source_module, source_record_id,
          responsible_dept, responsible_person_id, planned_completion_date,
          status, step_data, created_by
        ) VALUES (?, ?, ?, 'opl', ?, ?, ?, ?, 'draft', ?, ?)`
      ).run(
        improvement_code,
        title,
        opl.problem_description,
        oplId,
        opl.responsible_dept,
        opl.responsible_person_id,
        opl.planned_completion_date || null,
        stepData,
        userId
      );
      db.prepare('UPDATE opl_records SET improvement_initiated=1, improvement_id=? WHERE id=?').run(result.lastInsertRowid, oplId);
      return result.lastInsertRowid;
    });

    const newId = trx();
    const improvement = db.prepare(
      `SELECT i.*, u1.name as responsible_person_name, u3.name as creator_name
       FROM improvements i
       LEFT JOIN users u1 ON i.responsible_person_id = u1.id
       LEFT JOIN users u3 ON i.created_by = u3.id
       WHERE i.id = ?`
    ).get(newId);
    res.json(createSuccessResponse(improvement));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/from-anomaly/:anomalyId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const anomalyId = parseInt(req.params.anomalyId);
    const userId = req.user!.id;
    const anomaly = db.prepare('SELECT * FROM anomaly_records WHERE id = ?').get(anomalyId) as any;
    if (!anomaly) {
      return res.status(404).json(createErrorResponse('异常记录不存在'));
    }

    const improvement_code = generateCode('IMP');
    const title = `异常改进-${anomaly.problem_description.substring(0, 30)}`;
    const stepData = JSON.stringify(DEFAULT_STEP_DATA);

    const trx = db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO improvements (
          improvement_code, title, problem_description, source_module, source_record_id,
          responsible_dept, responsible_person_id, planned_completion_date,
          status, step_data, created_by
        ) VALUES (?, ?, ?, 'anomaly', ?, ?, ?, ?, 'draft', ?, ?)`
      ).run(
        improvement_code,
        title,
        anomaly.problem_description,
        anomalyId,
        anomaly.responsible_dept,
        anomaly.responsible_person_id,
        anomaly.planned_completion_date || null,
        stepData,
        userId
      );
      db.prepare('UPDATE anomaly_records SET improvement_initiated=1, improvement_id=? WHERE id=?').run(result.lastInsertRowid, anomalyId);
      return result.lastInsertRowid;
    });

    const newId = trx();
    const improvement = db.prepare(
      `SELECT i.*, u1.name as responsible_person_name, u3.name as creator_name
       FROM improvements i
       LEFT JOIN users u1 ON i.responsible_person_id = u1.id
       LEFT JOIN users u3 ON i.created_by = u3.id
       WHERE i.id = ?`
    ).get(newId);
    res.json(createSuccessResponse(improvement));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/:id/attachments', upload.single('file'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const { step_name } = req.body;
    const file = req.file;
    const userId = req.user!.id;

    if (!file) {
      return res.status(400).json(createErrorResponse('请上传文件'));
    }

    const improvement = db.prepare('SELECT id FROM improvements WHERE id = ?').get(id);
    if (!improvement) {
      return res.status(404).json(createErrorResponse('改进记录不存在'));
    }

    const validSteps = ['define', 'measure', 'analyze', 'improve', 'control'];
    if (step_name && !validSteps.includes(step_name)) {
      return res.status(400).json(createErrorResponse('步骤名称无效，必须是 define/measure/analyze/improve/control 之一'));
    }

    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const result = db.prepare(
      `INSERT INTO improvement_attachments (improvement_id, step_name, file_name, file_path, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, step_name || null, decodedName, file.filename, file.size, userId);

    const attachment = db.prepare('SELECT * FROM improvement_attachments WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(attachment));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

export default router;
