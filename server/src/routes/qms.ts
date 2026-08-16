import express, { Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse, generateCode } from '../utils/export';
import dayjs from 'dayjs';

const router = express.Router();

router.use(authMiddleware);

// GET /opl - List OPL records with filters
router.get('/opl', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { status, responsible_dept, project_id, keyword, start_date, end_date, page = '1', page_size = '20' } = req.query;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (status) {
      whereClauses.push('o.status = ?');
      params.push(status);
    }
    if (responsible_dept) {
      whereClauses.push('o.responsible_dept = ?');
      params.push(responsible_dept);
    }
    if (project_id) {
      whereClauses.push('o.project_id = ?');
      params.push(Number(project_id));
    }
    if (start_date) {
      whereClauses.push('o.occurrence_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push('o.occurrence_date <= ?');
      params.push(end_date);
    }
    if (keyword) {
      whereClauses.push('(o.problem_description LIKE ? OR o.project_name LIKE ? OR o.station_name LIKE ? OR o.solution_plan LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM opl_records o ${whereSql}`;
    const totalResult = db.prepare(countSql).get(...params) as any;
    const total = totalResult.total;

    const pageNum = Number(page);
    const pageSizeNum = Number(page_size);
    const offset = (pageNum - 1) * pageSizeNum;

    const listSql = `
      SELECT o.*,
        u1.name as responsible_person_name,
        u2.name as handler_name
      FROM opl_records o
      LEFT JOIN users u1 ON o.responsible_person_id = u1.id
      LEFT JOIN users u2 ON o.handler_id = u2.id
      ${whereSql}
      ORDER BY o.occurrence_date DESC
      LIMIT ? OFFSET ?
    `;

    const records = db.prepare(listSql).all(...params, pageSizeNum, offset);

    res.json(createSuccessResponse({
      list: records,
      total,
      page: pageNum,
      page_size: pageSizeNum
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取OPL记录失败'));
  }
});

// GET /opl/:id - Get single OPL record
router.get('/opl/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const sql = `
      SELECT o.*,
        u1.name as responsible_person_name,
        u2.name as handler_name,
        u3.name as created_by_name
      FROM opl_records o
      LEFT JOIN users u1 ON o.responsible_person_id = u1.id
      LEFT JOIN users u2 ON o.handler_id = u2.id
      LEFT JOIN users u3 ON o.created_by = u3.id
      WHERE o.id = ?
    `;
    const record = db.prepare(sql).get(Number(id));

    if (!record) {
      return res.status(404).json(createErrorResponse('OPL记录不存在'));
    }

    res.json(createSuccessResponse(record));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取OPL记录失败'));
  }
});

// POST /opl - Create OPL record
router.post('/opl', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = (req.user as any)?.id;
    const {
      occurrence_date,
      project_id,
      project_code,
      project_name,
      workstation_id,
      station_code,
      station_name,
      responsible_dept,
      responsible_person_id,
      handler_id,
      problem_description,
      solution_plan,
      planned_completion_date
    } = req.body;

    if (!occurrence_date || !responsible_dept || !problem_description) {
      return res.status(400).json(createErrorResponse('发生日期、责任部门、问题描述为必填项'));
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const insertSql = `
      INSERT INTO opl_records (
        occurrence_date, project_id, project_code, project_name,
        workstation_id, station_code, station_name, responsible_dept,
        responsible_person_id, handler_id, problem_description,
        solution_plan, planned_completion_date, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `;

    const result = db.prepare(insertSql).run(
      occurrence_date,
      project_id || null,
      project_code || null,
      project_name || null,
      workstation_id || null,
      station_code || null,
      station_name || null,
      responsible_dept,
      responsible_person_id || null,
      handler_id || null,
      problem_description,
      solution_plan || null,
      planned_completion_date || null,
      userId || null,
      now,
      now
    );

    const newRecord = db.prepare('SELECT * FROM opl_records WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newRecord, 'OPL记录创建成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建OPL记录失败'));
  }
});

// PUT /opl/:id - Update OPL record
router.put('/opl/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      occurrence_date,
      project_id,
      project_code,
      project_name,
      workstation_id,
      station_code,
      station_name,
      responsible_dept,
      responsible_person_id,
      handler_id,
      problem_description,
      solution_plan,
      planned_completion_date,
      actual_completion_date,
      status
    } = req.body;

    const existing = db.prepare('SELECT * FROM opl_records WHERE id = ?').get(Number(id));
    if (!existing) {
      return res.status(404).json(createErrorResponse('OPL记录不存在'));
    }

    let newStatus = status || (existing as any).status;
    let newActualCompletion = actual_completion_date !== undefined ? actual_completion_date : (existing as any).actual_completion_date;

    if (newActualCompletion && (existing as any).status === 'open') {
      newStatus = 'closed';
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const updateSql = `
      UPDATE opl_records SET
        occurrence_date = ?,
        project_id = ?,
        project_code = ?,
        project_name = ?,
        workstation_id = ?,
        station_code = ?,
        station_name = ?,
        responsible_dept = ?,
        responsible_person_id = ?,
        handler_id = ?,
        problem_description = ?,
        solution_plan = ?,
        planned_completion_date = ?,
        actual_completion_date = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `;

    db.prepare(updateSql).run(
      occurrence_date || (existing as any).occurrence_date,
      project_id !== undefined ? project_id : (existing as any).project_id,
      project_code !== undefined ? project_code : (existing as any).project_code,
      project_name !== undefined ? project_name : (existing as any).project_name,
      workstation_id !== undefined ? workstation_id : (existing as any).workstation_id,
      station_code !== undefined ? station_code : (existing as any).station_code,
      station_name !== undefined ? station_name : (existing as any).station_name,
      responsible_dept || (existing as any).responsible_dept,
      responsible_person_id !== undefined ? responsible_person_id : (existing as any).responsible_person_id,
      handler_id !== undefined ? handler_id : (existing as any).handler_id,
      problem_description || (existing as any).problem_description,
      solution_plan !== undefined ? solution_plan : (existing as any).solution_plan,
      planned_completion_date !== undefined ? planned_completion_date : (existing as any).planned_completion_date,
      newActualCompletion,
      newStatus,
      now,
      Number(id)
    );

    const updated = db.prepare('SELECT * FROM opl_records WHERE id = ?').get(Number(id));
    res.json(createSuccessResponse(updated, 'OPL记录更新成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新OPL记录失败'));
  }
});

// DELETE /opl/:id - Delete OPL
router.delete('/opl/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM opl_records WHERE id = ?').get(Number(id));
    if (!existing) {
      return res.status(404).json(createErrorResponse('OPL记录不存在'));
    }

    db.prepare('DELETE FROM opl_records WHERE id = ?').run(Number(id));
    res.json(createSuccessResponse(null, 'OPL记录删除成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除OPL记录失败'));
  }
});

// GET /anomaly - List anomaly/inspection records
router.get('/anomaly', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { status, responsible_dept, project_id, keyword, anomaly_type, start_date, end_date, page = '1', page_size = '20' } = req.query;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (status) {
      whereClauses.push('a.status = ?');
      params.push(status);
    }
    if (responsible_dept) {
      whereClauses.push('a.responsible_dept = ?');
      params.push(responsible_dept);
    }
    if (project_id) {
      whereClauses.push('a.project_id = ?');
      params.push(Number(project_id));
    }
    if (anomaly_type) {
      whereClauses.push('a.anomaly_type = ?');
      params.push(anomaly_type);
    }
    if (start_date) {
      whereClauses.push('a.occurrence_date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push('a.occurrence_date <= ?');
      params.push(end_date);
    }
    if (keyword) {
      whereClauses.push('(a.problem_description LIKE ? OR a.project_name LIKE ? OR a.station_name LIKE ? OR a.part_number LIKE ? OR a.supplier LIKE ? OR a.solution_plan LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw, kw, kw);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM anomaly_records a ${whereSql}`;
    const totalResult = db.prepare(countSql).get(...params) as any;
    const total = totalResult.total;

    const pageNum = Number(page);
    const pageSizeNum = Number(page_size);
    const offset = (pageNum - 1) * pageSizeNum;

    const listSql = `
      SELECT a.*,
        u1.name as responsible_person_name,
        u2.name as project_manager_name,
        u3.name as designer_name
      FROM anomaly_records a
      LEFT JOIN users u1 ON a.responsible_person_id = u1.id
      LEFT JOIN users u2 ON a.project_manager_id = u2.id
      LEFT JOIN users u3 ON a.designer_id = u3.id
      ${whereSql}
      ORDER BY a.occurrence_date DESC
      LIMIT ? OFFSET ?
    `;

    const records = db.prepare(listSql).all(...params, pageSizeNum, offset);

    res.json(createSuccessResponse({
      list: records,
      total,
      page: pageNum,
      page_size: pageSizeNum
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取异常记录失败'));
  }
});

// GET /anomaly/:id - Get single anomaly record
router.get('/anomaly/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const sql = `
      SELECT a.*,
        u1.name as responsible_person_name,
        u2.name as project_manager_name,
        u3.name as designer_name,
        u4.name as created_by_name
      FROM anomaly_records a
      LEFT JOIN users u1 ON a.responsible_person_id = u1.id
      LEFT JOIN users u2 ON a.project_manager_id = u2.id
      LEFT JOIN users u3 ON a.designer_id = u3.id
      LEFT JOIN users u4 ON a.created_by = u4.id
      WHERE a.id = ?
    `;
    const record = db.prepare(sql).get(Number(id));

    if (!record) {
      return res.status(404).json(createErrorResponse('异常记录不存在'));
    }

    res.json(createSuccessResponse(record));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取异常记录失败'));
  }
});

// POST /anomaly - Create anomaly record
router.post('/anomaly', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = (req.user as any)?.id;
    const {
      occurrence_date,
      anomaly_type = 'process',
      project_id,
      project_code,
      project_name,
      workstation_id,
      station_code,
      station_name,
      responsible_dept,
      responsible_person_id,
      project_manager_id,
      problem_description,
      solution_plan,
      planned_completion_date,
      part_number,
      part_spec,
      supplier,
      designer_id
    } = req.body;

    if (!occurrence_date || !responsible_dept || !problem_description) {
      return res.status(400).json(createErrorResponse('发生日期、责任部门、问题描述为必填项'));
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const insertSql = `
      INSERT INTO anomaly_records (
        occurrence_date, anomaly_type, project_id, project_code, project_name,
        workstation_id, station_code, station_name, responsible_dept,
        responsible_person_id, project_manager_id, problem_description,
        solution_plan, planned_completion_date, part_number, part_spec,
        supplier, designer_id, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `;

    const result = db.prepare(insertSql).run(
      occurrence_date,
      anomaly_type,
      project_id || null,
      project_code || null,
      project_name || null,
      workstation_id || null,
      station_code || null,
      station_name || null,
      responsible_dept,
      responsible_person_id || null,
      project_manager_id || null,
      problem_description,
      solution_plan || null,
      planned_completion_date || null,
      part_number || null,
      part_spec || null,
      supplier || null,
      designer_id || null,
      userId || null,
      now,
      now
    );

    const newRecord = db.prepare('SELECT * FROM anomaly_records WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newRecord, '异常记录创建成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建异常记录失败'));
  }
});

// PUT /anomaly/:id - Update anomaly record
router.put('/anomaly/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      occurrence_date,
      anomaly_type,
      project_id,
      project_code,
      project_name,
      workstation_id,
      station_code,
      station_name,
      responsible_dept,
      responsible_person_id,
      project_manager_id,
      problem_description,
      solution_plan,
      planned_completion_date,
      actual_completion_date,
      part_number,
      part_spec,
      supplier,
      designer_id,
      status
    } = req.body;

    const existing = db.prepare('SELECT * FROM anomaly_records WHERE id = ?').get(Number(id));
    if (!existing) {
      return res.status(404).json(createErrorResponse('异常记录不存在'));
    }

    let newStatus = status || (existing as any).status;
    let newActualCompletion = actual_completion_date !== undefined ? actual_completion_date : (existing as any).actual_completion_date;

    if (newActualCompletion && (existing as any).status === 'open') {
      newStatus = 'closed';
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const updateSql = `
      UPDATE anomaly_records SET
        occurrence_date = ?,
        anomaly_type = ?,
        project_id = ?,
        project_code = ?,
        project_name = ?,
        workstation_id = ?,
        station_code = ?,
        station_name = ?,
        responsible_dept = ?,
        responsible_person_id = ?,
        project_manager_id = ?,
        problem_description = ?,
        solution_plan = ?,
        planned_completion_date = ?,
        actual_completion_date = ?,
        part_number = ?,
        part_spec = ?,
        supplier = ?,
        designer_id = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `;

    db.prepare(updateSql).run(
      occurrence_date || (existing as any).occurrence_date,
      anomaly_type || (existing as any).anomaly_type,
      project_id !== undefined ? project_id : (existing as any).project_id,
      project_code !== undefined ? project_code : (existing as any).project_code,
      project_name !== undefined ? project_name : (existing as any).project_name,
      workstation_id !== undefined ? workstation_id : (existing as any).workstation_id,
      station_code !== undefined ? station_code : (existing as any).station_code,
      station_name !== undefined ? station_name : (existing as any).station_name,
      responsible_dept || (existing as any).responsible_dept,
      responsible_person_id !== undefined ? responsible_person_id : (existing as any).responsible_person_id,
      project_manager_id !== undefined ? project_manager_id : (existing as any).project_manager_id,
      problem_description || (existing as any).problem_description,
      solution_plan !== undefined ? solution_plan : (existing as any).solution_plan,
      planned_completion_date !== undefined ? planned_completion_date : (existing as any).planned_completion_date,
      newActualCompletion,
      part_number !== undefined ? part_number : (existing as any).part_number,
      part_spec !== undefined ? part_spec : (existing as any).part_spec,
      supplier !== undefined ? supplier : (existing as any).supplier,
      designer_id !== undefined ? designer_id : (existing as any).designer_id,
      newStatus,
      now,
      Number(id)
    );

    const updated = db.prepare('SELECT * FROM anomaly_records WHERE id = ?').get(Number(id));
    res.json(createSuccessResponse(updated, '异常记录更新成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新异常记录失败'));
  }
});

// DELETE /anomaly/:id - Delete anomaly
router.delete('/anomaly/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM anomaly_records WHERE id = ?').get(Number(id));
    if (!existing) {
      return res.status(404).json(createErrorResponse('异常记录不存在'));
    }

    db.prepare('DELETE FROM anomaly_records WHERE id = ?').run(Number(id));
    res.json(createSuccessResponse(null, '异常记录删除成功'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除异常记录失败'));
  }
});

export default router;
