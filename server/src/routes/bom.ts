import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { getDb } from '../db/database';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import { authMiddleware } from '../middleware/auth';

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
    cb(null, `bom_${timestamp}_${name}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.step', '.stp', '.dwg', '.dxf'];
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'));
    }
  }
});

router.get('/categories', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const categories = db.prepare('SELECT * FROM bom_categories WHERE is_active = 1 ORDER BY parent_id, sort_order').all();
    res.json(createSuccessResponse(categories));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取BOM分类失败'));
  }
});

router.get('/project/:projectId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { projectId } = req.params;
    const items = db.prepare(`
      SELECT b.*, u.name AS creator_name
      FROM bom_items b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.project_id = ?
      ORDER BY b.category_id, b.item_code
    `).all(projectId);
    res.json(createSuccessResponse(items));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取BOM列表失败'));
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const item = db.prepare(`
      SELECT b.*, u.name AS creator_name
      FROM bom_items b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `).get(id);
    if (!item) {
      return res.status(404).json(createErrorResponse('BOM项不存在'));
    }
    const attachments = db.prepare('SELECT * FROM bom_attachments WHERE item_id = ? ORDER BY created_at DESC').all(id);
    const versions = db.prepare(`
      SELECT v.*, u.name AS changer_name
      FROM bom_item_versions v
      LEFT JOIN users u ON v.changed_by = u.id
      WHERE v.item_id = ?
      ORDER BY v.version_no DESC
    `).all(id);
    res.json(createSuccessResponse({ ...item, attachments, versions }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取BOM详情失败'));
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const {
      project_id, item_code, item_name, item_spec, category_id, category_name,
      material, quantity, unit, unit_price, supplier, make_or_buy,
      drawing_no, drawing_version, is_key_part, is_safety_part, remark
    } = req.body;

    const total_price = (quantity || 1) * (unit_price || 0);
    const result = db.prepare(`
      INSERT INTO bom_items (
        project_id, item_code, item_name, item_spec, category_id, category_name,
        material, quantity, unit, unit_price, total_price, supplier, make_or_buy,
        drawing_no, drawing_version, is_key_part, is_safety_part, remark, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project_id, item_code, item_name, item_spec || '', category_id || null, category_name || '',
      material || '', quantity || 1, unit || 'PCS', unit_price || 0, total_price, supplier || '', make_or_buy || 'buy',
      drawing_no || '', drawing_version || '', is_key_part ? 1 : 0, is_safety_part ? 1 : 0, remark || '', userId
    );

    const newItem = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(newItem));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '创建BOM项失败'));
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      item_code, item_name, item_spec, category_id, category_name,
      material, quantity, unit, unit_price, supplier, make_or_buy,
      drawing_no, drawing_version, is_key_part, is_safety_part, status, remark
    } = req.body;

    const existing = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json(createErrorResponse('BOM项不存在'));
    }

    const total_price = (quantity ?? existing.quantity ?? 1) * (unit_price ?? existing.unit_price ?? 0);

    db.prepare(`
      INSERT INTO bom_item_versions (item_id, version_no, change_type, changed_by, snapshot_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, (db.prepare('SELECT MAX(version_no) as v FROM bom_item_versions WHERE item_id = ?').get(id) as any).v + 1 || 1, 'update', userId, JSON.stringify(existing));

    db.prepare(`
      UPDATE bom_items SET
        item_code = ?, item_name = ?, item_spec = ?, category_id = ?, category_name = ?,
        material = ?, quantity = ?, unit = ?, unit_price = ?, total_price = ?,
        supplier = ?, make_or_buy = ?, drawing_no = ?, drawing_version = ?,
        is_key_part = ?, is_safety_part = ?, status = ?, remark = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      item_code || existing.item_code, item_name || existing.item_name,
      item_spec ?? existing.item_spec, category_id ?? existing.category_id, category_name ?? existing.category_name,
      material ?? existing.material, quantity ?? existing.quantity, unit ?? existing.unit,
      unit_price ?? existing.unit_price, total_price,
      supplier ?? existing.supplier, make_or_buy ?? existing.make_or_buy,
      drawing_no ?? existing.drawing_no, drawing_version ?? existing.drawing_version,
      is_key_part !== undefined ? (is_key_part ? 1 : 0) : existing.is_key_part,
      is_safety_part !== undefined ? (is_safety_part ? 1 : 0) : existing.is_safety_part,
      status || existing.status, remark ?? existing.remark,
      id
    );

    const updated = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id);
    res.json(createSuccessResponse(updated));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '更新BOM项失败'));
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const attachments = db.prepare('SELECT file_path FROM bom_attachments WHERE item_id = ?').all(id) as any[];
    attachments.forEach(a => {
      const fp = path.join(uploadsDir, a.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    db.prepare('DELETE FROM bom_attachments WHERE item_id = ?').run(id);
    db.prepare('DELETE FROM bom_item_versions WHERE item_id = ?').run(id);
    db.prepare('DELETE FROM bom_items WHERE id = ?').run(id);

    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除BOM项失败'));
  }
});

router.post('/:id/attachments', upload.single('file'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.user!.id;
    const { id } = req.params;
    const { attach_type } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json(createErrorResponse('请选择文件'));
    }

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const result = db.prepare(`
      INSERT INTO bom_attachments (item_id, file_name, file_path, file_size, file_type, attach_type, uploaded_by, uploader_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, decodedName, file.filename, file.size, file.mimetype, attach_type || 'drawing', userId, user?.name || '');

    const attachment = db.prepare('SELECT * FROM bom_attachments WHERE id = ?').get(result.lastInsertRowid);
    res.json(createSuccessResponse(attachment));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '上传附件失败'));
  }
});

router.delete('/attachments/:attachId', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { attachId } = req.params;

    const attach = db.prepare('SELECT * FROM bom_attachments WHERE id = ?').get(attachId) as any;
    if (attach) {
      const fp = path.join(uploadsDir, attach.file_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.prepare('DELETE FROM bom_attachments WHERE id = ?').run(attachId);
    }

    res.json(createSuccessResponse({ success: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '删除附件失败'));
  }
});

router.post('/import', upload.single('file'), (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'BOM导入功能开发中' }));
});

export default router;
