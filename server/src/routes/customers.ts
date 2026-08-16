import express, { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { keyword, customer_type, is_active } = req.query;
    let sql = 'SELECT c.*, u.name AS creator_name FROM customers c LEFT JOIN users u ON c.created_by = u.id WHERE 1=1';
    const params: any[] = [];
    if (keyword) {
      sql += ' AND (c.customer_code LIKE ? OR c.customer_name LIKE ? OR c.contact_person LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    if (customer_type) { sql += ' AND c.customer_type = ?'; params.push(customer_type); }
    if (is_active !== undefined) { sql += ' AND c.is_active = ?'; params.push(Number(is_active)); }
    sql += ' ORDER BY c.customer_code ASC, c.id ASC';
    const list = db.prepare(sql).all(...params);
    res.json(createSuccessResponse(list));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取客户列表失败'));
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const c = db.prepare('SELECT c.*, u.name AS creator_name FROM customers c LEFT JOIN users u ON c.created_by = u.id WHERE c.id = ?').get(req.params.id);
    if (!c) return res.status(404).json(createErrorResponse('客户不存在'));
    res.json(createSuccessResponse(c));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取客户详情失败'));
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { customer_code, customer_name, customer_type, contact_person, contact_phone, contact_email, address, csr_requirements, is_active, remark } = req.body;
    if (!customer_name) return res.status(400).json(createErrorResponse('客户名称不能为空'));
    const code = customer_code || ('C' + String(Date.now()).slice(-6));
    const r = db.prepare(`
      INSERT INTO customers (customer_code, customer_name, customer_type, contact_person, contact_phone, contact_email, address, csr_requirements, is_active, remark, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, customer_name, customer_type || 'automotive', contact_person || null, contact_phone || null, contact_email || null, address || null, csr_requirements || null, is_active ?? 1, remark || null, (req as any).user?.id || null);
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid);
    res.json(createSuccessResponse(c));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建客户失败'));
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!existing) return res.status(404).json(createErrorResponse('客户不存在'));
    const fields = ['customer_code', 'customer_name', 'customer_type', 'contact_person', 'contact_phone', 'contact_email', 'address', 'csr_requirements', 'is_active', 'remark'];
    const updates: string[] = [];
    const params: any[] = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f] === '' ? null : req.body[f]); }
    });
    if (updates.length === 0) return res.json(createSuccessResponse(existing));
    updates.push("updated_at = datetime('now','localtime')");
    params.push(id);
    db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json(createSuccessResponse(c));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新客户失败'));
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE customers SET is_active = 0, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(req.params.id);
    res.json(createSuccessResponse(null, '已停用'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '停用客户失败'));
  }
});

export default router;
