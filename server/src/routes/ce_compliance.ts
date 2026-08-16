import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';

const router = Router();

function enrichValidity<T extends { effective_date?: string | null; expiry_date?: string | null; status?: string }>(item: T): T & { validity_status: string; validity_label: string; days_to_expiry?: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let validity_status = 'permanent';
  let validity_label = '长期有效';
  let days_to_expiry: number | undefined;

  const eff = item.effective_date ? new Date(item.effective_date) : null;
  const exp = item.expiry_date ? new Date(item.expiry_date) : null;
  if (eff) eff.setHours(0, 0, 0, 0);
  if (exp) exp.setHours(0, 0, 0, 0);

  if (item.status === 'inactive') {
    validity_status = 'inactive';
    validity_label = exp ? `已废止(至${item.expiry_date})` : '已废止';
  } else if (eff && eff > today) {
    validity_status = 'pending';
    const days = Math.ceil((eff.getTime() - today.getTime()) / 86400000);
    days_to_expiry = days;
    validity_label = `未生效(${days}天)`;
  } else if (exp) {
    const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
    days_to_expiry = days;
    if (days < 0) {
      validity_status = 'expired';
      validity_label = `已过有效期(${item.expiry_date})`;
    } else if (days <= 90) {
      validity_status = 'expiring';
      validity_label = `即将到期(${days}天)`;
    } else {
      validity_status = 'valid';
      validity_label = `有效期至${item.expiry_date}`;
    }
  } else {
    validity_status = 'permanent';
    validity_label = '长期有效';
  }

  return { ...item, validity_status, validity_label, days_to_expiry };
}

function autoUpdateValidityStatus(_db: any, _table: string) {
}

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const ceUploadsDir = path.join(uploadsDir, 'ce_docs');
if (!fs.existsSync(ceUploadsDir)) {
  fs.mkdirSync(ceUploadsDir, { recursive: true });
}

const ceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { cb(null, ceUploadsDir); },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext).replace(/[\\/:*?"<>|]/g, '_');
    cb(null, `${timestamp}_${name}${ext}`);
  }
});
const ceUpload = multer({
  storage: ceStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|jpg|jpeg|png|gif|zip|rar|7z)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('仅支持 PDF/Word/Excel/PPT/图片/压缩包 格式') as any);
  }
});

const MARKET_MAP: Record<string, string> = {
  EU: '欧盟',
  NA: '北美(美/加)',
  CN: '中国',
  DE: '德国',
  SEA: '东南亚',
  JP: '日本',
  KR: '韩国',
  OTHER: '其他/英国'
};

const CATEGORY_MAP: Record<string, string> = {
  ce: 'CE认证',
  'EMC电磁兼容': 'EMC电磁兼容',
  'LVD低电压': 'LVD低电压',
  'MD机械安全': 'MD机械安全',
  safety: '安全标准',
  rohs: 'RoHS',
  reach: 'REACH',
  ul: 'UL/NFPA',
  fcc: 'FCC',
  ccc: 'CCC',
  china: '中国国标',
  pse: 'PSE(日本)',
  kc: 'KC(韩国)',
};

const RESTRICTION_LEVEL_MAP: Record<string, { label: string; color: string }> = {
  prohibited: { label: '禁止', color: 'red' },
  restricted: { label: '限制', color: 'orange' },
  warning: { label: '警示', color: 'gold' }
};

const CONTROL_TYPE_MAP: Record<string, string> = {
  brand: '品牌/企业',
  part: '物料/技术'
};

// ========== 国际法规清单 API ==========

// 获取法规清单（分页+筛选）
router.get('/regulations', (req: Request, res: Response) => {
  const db = getDb();
  autoUpdateValidityStatus(db, 'ce_regulations');
  const { market, category, status, keyword, page = '1', page_size = '50' } = req.query as any;
  const p = parseInt(page) || 1, ps = parseInt(page_size) || 50;
  const where: string[] = ['1=1'];
  const params: any[] = [];
  if (market) { where.push('market = ?'); params.push(market); }
  if (category) { where.push('category = ?'); params.push(category); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (keyword) {
    where.push('(regulation_name LIKE ? OR directive_name LIKE ? OR directive_no LIKE ? OR scope LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) c FROM ce_regulations ${whereSql}`).get(...params) as any).c;
  const list = db.prepare(`SELECT * FROM ce_regulations ${whereSql} ORDER BY sort_order ASC, market ASC, id ASC LIMIT ? OFFSET ?`)
    .all(...params, ps, (p - 1) * ps)
    .map((r: any) => enrichValidity(r));
  const stats = {
    total,
    active: (db.prepare(`SELECT COUNT(*) c FROM ce_regulations WHERE status='active'`).get() as any).c,
    inactive: (db.prepare(`SELECT COUNT(*) c FROM ce_regulations WHERE status='inactive'`).get() as any).c,
    expiring: (db.prepare(`SELECT COUNT(*) c FROM ce_regulations WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date < date('now','+90 days') AND expiry_date >= date('now')`).get() as any).c,
    overdue: (db.prepare(`SELECT COUNT(*) c FROM ce_regulations WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date < date('now')`).get() as any).c,
  };
  const byMarket = db.prepare(`SELECT market, COUNT(*) c FROM ce_regulations WHERE status='active' GROUP BY market`).all();
  res.json({ code: 0, data: { list, total, page: p, page_size: ps, stats, by_market: byMarket } });
});

// 获取单条法规详情
router.get('/regulations/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const item = db.prepare('SELECT * FROM ce_regulations WHERE id=?').get(id);
  if (!item) return res.status(404).json({ code: 404, message: '未找到' });
  res.json({ code: 0, data: enrichValidity(item as any) });
});

// 新增法规
router.post('/regulations', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const {
    market, category, regulation_code, regulation_name, directive_name, directive_no, version,
    effective_date, expiry_date, status, scope, key_requirements, applicable_products,
    source_url, remarks, sort_order
  } = req.body as any;
  if (!regulation_name) return res.status(400).json({ code: 400, message: '法规名称必填' });
  try {
    const result = db.prepare(`INSERT INTO ce_regulations
      (market, category, regulation_code, regulation_name, directive_name, directive_no, version,
       effective_date, expiry_date, status, scope, key_requirements, applicable_products,
       source_url, remarks, sort_order, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'), datetime('now','localtime'))`).run(
      market || 'EU', category || 'ce', regulation_code || null, regulation_name, directive_name || null,
      directive_no || null, version || null, effective_date || null, expiry_date || null,
      status || 'active', scope || null, key_requirements || null, applicable_products || null,
      source_url || null, remarks || null, sort_order || 0, u?.id || null
    );
    res.json({ code: 0, message: '新增成功', data: { id: result.lastInsertRowid } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 更新法规
router.put('/regulations/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM ce_regulations WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ code: 404, message: '未找到' });
  const fields = ['market','category','regulation_code','regulation_name','directive_name','directive_no','version',
    'effective_date','expiry_date','status','scope','key_requirements','applicable_products','source_url','remarks','sort_order'];
  const sets: string[] = [];
  const params: any[] = [];
  fields.forEach(f => {
    if (f in req.body) { sets.push(`${f}=?`); params.push((req.body as any)[f]); }
  });
  sets.push(`updated_at=datetime('now','localtime')`);
  params.push(id);
  try {
    db.prepare(`UPDATE ce_regulations SET ${sets.join(',')} WHERE id=?`).run(...params);
    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除法规
router.delete('/regulations/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM ce_regulations WHERE id=?').run(id);
  res.json({ code: 0, message: '删除成功' });
});

// 手动触发"检查更新"（更新last_checked_at，标记检查时间）
router.post('/regulations/check-updates', (req: Request, res: Response) => {
  const db = getDb();
  try {
    db.prepare(`UPDATE ce_regulations SET last_checked_at=datetime('now','localtime'), last_check_result='手动检查更新' WHERE status='active'`).run();
    res.json({ code: 0, message: '检查完成，已更新最新核查时间' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 上传法规文件附件
router.post('/regulations/:id/attachment', ceUpload.single('file'), (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM ce_regulations WHERE id=?').get(id) as any;
  if (!existing) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json(createErrorResponse('法规不存在'));
  }
  if (!req.file) return res.status(400).json(createErrorResponse('请选择文件'));
  try {
    if (existing.attachment_path) {
      const oldPath = path.join(uploadsDir, existing.attachment_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const relPath = path.relative(uploadsDir, req.file.path).replace(/\\/g, '/');
    db.prepare(`UPDATE ce_regulations SET attachment_path=?, attachment_name=?, attachment_size=?, attachment_type=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(relPath, req.file.originalname, req.file.size, req.file.mimetype, id);
    res.json(createSuccessResponse({
      path: relPath,
      name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      size: req.file.size,
      type: req.file.mimetype,
      url: `/uploads/${relPath}`
    }, '上传成功'));
  } catch (e: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json(createErrorResponse(e.message));
  }
});

// 删除法规附件
router.delete('/regulations/:id/attachment', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM ce_regulations WHERE id=?').get(id) as any;
  if (!existing) return res.status(404).json(createErrorResponse('法规不存在'));
  try {
    if (existing.attachment_path) {
      const filePath = path.join(uploadsDir, existing.attachment_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare(`UPDATE ce_regulations SET attachment_path=NULL, attachment_name=NULL, attachment_size=0, attachment_type=NULL, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(id);
    res.json(createSuccessResponse(null, '附件已删除'));
  } catch (e: any) {
    res.status(500).json(createErrorResponse(e.message));
  }
});

// 获取市场/分类选项
router.get('/regulation-options', (_req: Request, res: Response) => {
  const db = getDb();
  const dbCategories = db.prepare(`SELECT DISTINCT category FROM ce_regulations WHERE category IS NOT NULL AND category != '' ORDER BY category`).all() as { category: string }[];
  const dbMarkets = db.prepare(`SELECT DISTINCT market FROM ce_regulations WHERE market IS NOT NULL AND market != '' ORDER BY market`).all() as { market: string }[];
  
  const categorySet = new Set<string>(Object.keys(CATEGORY_MAP));
  dbCategories.forEach(r => categorySet.add(r.category));
  const marketSet = new Set<string>(Object.keys(MARKET_MAP));
  dbMarkets.forEach(r => marketSet.add(r.market));
  
  const categories = Array.from(categorySet).map(k => ({ value: k, label: CATEGORY_MAP[k] || k }));
  const markets = Array.from(marketSet).map(k => ({ value: k, label: MARKET_MAP[k] || k }));
  
  res.json({
    code: 0,
    data: {
      markets,
      categories,
      statuses: [
        { value: 'active', label: '有效' },
        { value: 'inactive', label: '失效' },
        { value: 'draft', label: '草案' }
      ]
    }
  });
});

// ========== 进出口管控清单 API ==========

// 获取管控清单
router.get('/export-controls', (req: Request, res: Response) => {
  const db = getDb();
  autoUpdateValidityStatus(db, 'ce_export_controls');
  const { control_type, control_region, restriction_level, status, keyword, page = '1', page_size = '50' } = req.query as any;
  const p = parseInt(page) || 1, ps = parseInt(page_size) || 50;
  const where: string[] = ['1=1'];
  const params: any[] = [];
  if (control_type) { where.push('control_type = ?'); params.push(control_type); }
  if (control_region) { where.push('control_region = ?'); params.push(control_region); }
  if (restriction_level) { where.push('restriction_level = ?'); params.push(restriction_level); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (keyword) {
    where.push('(part_code LIKE ? OR part_name LIKE ? OR brand LIKE ? OR manufacturer LIKE ? OR reason LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw, kw);
  }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls ${whereSql}`).get(...params) as any).c;
  const list = db.prepare(`SELECT * FROM ce_export_controls ${whereSql} ORDER BY
    CASE restriction_level WHEN 'prohibited' THEN 1 WHEN 'restricted' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,
    sort_order ASC, control_type ASC, id ASC LIMIT ? OFFSET ?`).all(...params, ps, (p - 1) * ps)
    .map((r: any) => enrichValidity(r));
  const stats = {
    total,
    prohibited: (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls WHERE restriction_level='prohibited' AND status='active'`).get() as any).c,
    restricted: (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls WHERE restriction_level='restricted' AND status='active'`).get() as any).c,
    warning: (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls WHERE restriction_level='warning' AND status='active'`).get() as any).c,
    expiring: (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date < date('now','+90 days') AND expiry_date >= date('now')`).get() as any).c,
    inactive: (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls WHERE status='inactive'`).get() as any).c,
    overdue: (db.prepare(`SELECT COUNT(*) c FROM ce_export_controls WHERE status='active' AND expiry_date IS NOT NULL AND expiry_date < date('now')`).get() as any).c,
  };
  const byRegion = db.prepare(`SELECT control_region, COUNT(*) c FROM ce_export_controls WHERE status='active' GROUP BY control_region`).all();
  res.json({ code: 0, data: { list, total, page: p, page_size: ps, stats, by_region: byRegion } });
});

// 获取单条管控详情
router.get('/export-controls/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const item = db.prepare('SELECT * FROM ce_export_controls WHERE id=?').get(id);
  if (!item) return res.status(404).json({ code: 404, message: '未找到' });
  res.json({ code: 0, data: enrichValidity(item as any) });
});

// 新增管控项
router.post('/export-controls', (req: Request, res: Response) => {
  const db = getDb();
  const u = (req as any).user;
  const {
    control_type, part_code, part_name, brand, manufacturer, control_region, control_list,
    restriction_level, reason, alternative_suggestion, hs_code, eccn_code,
    source, source_url, status, remarks, sort_order, version, effective_date, expiry_date
  } = req.body as any;
  if (!control_type) return res.status(400).json({ code: 400, message: '管控类型必填' });
  if (!part_name && !brand) return res.status(400).json({ code: 400, message: '物料名称或品牌至少填一个' });
  try {
    const result = db.prepare(`INSERT INTO ce_export_controls
      (control_type, part_code, part_name, brand, manufacturer, control_region, control_list,
       restriction_level, reason, alternative_suggestion, hs_code, eccn_code, source, source_url,
       version, effective_date, expiry_date,
       status, remarks, sort_order, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'), datetime('now','localtime'))`).run(
      control_type, part_code || null, part_name || null, brand || null, manufacturer || null,
      control_region || 'US', control_list || null, restriction_level || 'warning', reason || null,
      alternative_suggestion || null, hs_code || null, eccn_code || null, source || null, source_url || null,
      version || null, effective_date || null, expiry_date || null,
      status || 'active', remarks || null, sort_order || 0, u?.id || null
    );
    res.json({ code: 0, message: '新增成功', data: { id: result.lastInsertRowid } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 更新管控项
router.put('/export-controls/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM ce_export_controls WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ code: 404, message: '未找到' });
  const fields = ['control_type','part_code','part_name','brand','manufacturer','control_region','control_list',
    'restriction_level','reason','alternative_suggestion','hs_code','eccn_code','source','source_url','status','remarks','sort_order',
    'version','effective_date','expiry_date'];
  const sets: string[] = [];
  const params: any[] = [];
  fields.forEach(f => {
    if (f in req.body) { sets.push(`${f}=?`); params.push((req.body as any)[f]); }
  });
  sets.push(`updated_at=datetime('now','localtime')`);
  params.push(id);
  try {
    db.prepare(`UPDATE ce_export_controls SET ${sets.join(',')} WHERE id=?`).run(...params);
    res.json({ code: 0, message: '更新成功' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除管控项
router.delete('/export-controls/:id', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM ce_export_controls WHERE id=?').run(id);
  res.json({ code: 0, message: '删除成功' });
});

// 检查更新（标记核查时间）
router.post('/export-controls/check-updates', (req: Request, res: Response) => {
  const db = getDb();
  try {
    db.prepare(`UPDATE ce_export_controls SET last_checked_at=datetime('now','localtime'), last_check_result='手动检查更新' WHERE status='active'`).run();
    res.json({ code: 0, message: '检查完成，已更新最新核查时间' });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 上传管控清单附件
router.post('/export-controls/:id/attachment', ceUpload.single('file'), (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM ce_export_controls WHERE id=?').get(id) as any;
  if (!existing) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json(createErrorResponse('管控项不存在'));
  }
  if (!req.file) return res.status(400).json(createErrorResponse('请选择文件'));
  try {
    if (existing.attachment_path) {
      const oldPath = path.join(uploadsDir, existing.attachment_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const relPath = path.relative(uploadsDir, req.file.path).replace(/\\/g, '/');
    db.prepare(`UPDATE ce_export_controls SET attachment_path=?, attachment_name=?, attachment_size=?, attachment_type=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(relPath, req.file.originalname, req.file.size, req.file.mimetype, id);
    res.json(createSuccessResponse({
      path: relPath,
      name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      size: req.file.size,
      type: req.file.mimetype,
      url: `/uploads/${relPath}`
    }, '上传成功'));
  } catch (e: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json(createErrorResponse(e.message));
  }
});

// 删除管控清单附件
router.delete('/export-controls/:id/attachment', (req: Request, res: Response) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM ce_export_controls WHERE id=?').get(id) as any;
  if (!existing) return res.status(404).json(createErrorResponse('管控项不存在'));
  try {
    if (existing.attachment_path) {
      const filePath = path.join(uploadsDir, existing.attachment_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare(`UPDATE ce_export_controls SET attachment_path=NULL, attachment_name=NULL, attachment_size=0, attachment_type=NULL, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(id);
    res.json(createSuccessResponse(null, '附件已删除'));
  } catch (e: any) {
    res.status(500).json(createErrorResponse(e.message));
  }
});

// 快速BOM核查：根据BOM物料匹配管控品牌/物料
router.post('/export-controls/check-bom', (req: Request, res: Response) => {
  const db = getDb();
  const { items } = req.body as any;
  if (!Array.isArray(items) || items.length === 0) {
    return res.json({ code: 0, data: { hits: [], total_checked: 0 } });
  }
  const activeControls = db.prepare(`SELECT * FROM ce_export_controls WHERE status='active'`).all() as any[];
  const hits: any[] = [];
  items.forEach((bomItem: any) => {
    const searchText = [bomItem.brand, bomItem.manufacturer, bomItem.part_name, bomItem.material_name, bomItem.part_code, bomItem.model]
      .filter(Boolean).join(' ').toLowerCase();
    activeControls.forEach(ctrl => {
      let matched = false;
      let matchField = '';
      let matchKeyword = '';
      if (ctrl.brand && searchText.includes(ctrl.brand.toLowerCase().split('/')[0].trim())) {
        matched = true;
        matchField = 'brand';
        matchKeyword = ctrl.brand;
      }
      if (!matched && ctrl.part_name && searchText.includes(ctrl.part_name.toLowerCase().substring(0, 4))) {
        matched = true;
        matchField = 'part_name';
        matchKeyword = ctrl.part_name;
      }
      if (matched) {
        hits.push({
          bom_item: bomItem,
          control: ctrl,
          match_field: matchField,
          match_keyword: matchKeyword,
          level_info: RESTRICTION_LEVEL_MAP[ctrl.restriction_level] || { label: '警示', color: 'gold' }
        });
      }
    });
  });
  const summary = {
    total_checked: items.length,
    hit_count: hits.length,
    prohibited: hits.filter(h => h.control.restriction_level === 'prohibited').length,
    restricted: hits.filter(h => h.control.restriction_level === 'restricted').length,
    warning: hits.filter(h => h.control.restriction_level === 'warning').length,
  };
  res.json({ code: 0, data: { hits, summary } });
});

// 获取管控选项
router.get('/control-options', (_req: Request, res: Response) => {
  res.json({
    code: 0,
    data: {
      control_types: Object.entries(CONTROL_TYPE_MAP).map(([k, v]) => ({ value: k, label: v })),
      restriction_levels: Object.entries(RESTRICTION_LEVEL_MAP).map(([k, v]) => ({ value: k, label: v.label, color: v.color })),
      regions: [
        { value: 'US', label: '美国(US)' },
        { value: 'EU', label: '欧盟(EU)' },
        { value: 'CN', label: '中国(CN)' },
        { value: 'GLOBAL', label: '全球通用' },
        { value: 'JP', label: '日本(JP)' },
        { value: 'KR', label: '韩国(KR)' },
        { value: 'US/EU', label: '美欧双管制' }
      ]
    }
  });
});

// ========== 外部数据源配置 API ==========

router.use(authMiddleware);

const SOURCE_TYPE_MAP: Record<string, string> = {
  http_check: 'HTTP可用性检查',
  rss: 'RSS订阅',
  csv: 'CSV下载',
  json: 'JSON API',
  html: 'HTML页面解析'
};

const PARSER_TYPE_MAP: Record<string, string> = {
  status_check: '状态检查(HEAD/GET)',
  last_modified: 'Last-Modified头',
  rss_items: 'RSS条目提取',
  csv_rows: 'CSV行解析',
  json_items: 'JSON数组解析'
};

const DEFAULT_DATA_SOURCES: Array<Record<string, any>> = [
  { source_code: 'EURLEX_CE', source_name: 'EUR-Lex 欧盟官方法律数据库(CE指令)', target_table: 'regulations', market: 'EU', category: 'ce', url: 'https://eur-lex.europa.eu/homepage.html?locale=en', official_name: 'EUR-Lex (EU Official Journal)', enabled: 1, check_interval_hours: 168, sort_order: 10, description: '欧盟官方公报，所有CE新方法指令/法规的权威来源' },
  { source_code: 'ECHA_REACH', source_name: 'ECHA 欧洲化学品管理局(REACH候选清单)', target_table: 'regulations', market: 'EU', category: 'reach', url: 'https://echa.europa.eu/candidate-list-table', official_name: 'ECHA Candidate List', enabled: 1, check_interval_hours: 168, sort_order: 20, description: 'SVHC高关注物质清单，通常每年更新2次' },
  { source_code: 'EURLEX_ROHS', source_name: 'EUR-Lex RoHS指令(2011/65/EU修订)', target_table: 'regulations', market: 'EU', category: 'rohs', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:02011L0065-20240403', official_name: 'Directive 2011/65/EU (RoHS 2)', enabled: 1, check_interval_hours: 720, sort_order: 25, description: 'RoHS限制有害物质指令修订页' },
  { source_code: 'EURLEX_EMC', source_name: 'EUR-Lex EMC指令(2014/30/EU)', target_table: 'regulations', market: 'EU', category: 'ce', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014L0030', official_name: 'Directive 2014/30/EU (EMC)', enabled: 0, check_interval_hours: 720, sort_order: 30, description: '电磁兼容指令' },
  { source_code: 'EURLEX_LVD', source_name: 'EUR-Lex LVD低电压指令(2014/35/EU)', target_table: 'regulations', market: 'EU', category: 'ce', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014L0035', official_name: 'Directive 2014/35/EU (LVD)', enabled: 0, check_interval_hours: 720, sort_order: 35, description: '低电压指令' },
  { source_code: 'EURLEX_MACHINERY', source_name: 'EUR-Lex 机械法规(EU) 2023/1230', target_table: 'regulations', market: 'EU', category: 'ce', url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32023R1230', official_name: 'Regulation (EU) 2023/1230 (Machinery)', enabled: 1, check_interval_hours: 720, sort_order: 40, description: '新机械法规(替代2006/42/EC)，2027年强制适用，非标自动设备重点' },
  { source_code: 'BIS_EAR', source_name: '美国BIS出口管理条例(EAR)', target_table: 'export_controls', market: 'NA', category: 'export_control', url: 'https://www.bis.doc.gov/index.php/regulations/export-administration-regulations-ear', official_name: 'BIS Export Administration Regulations', enabled: 1, check_interval_hours: 168, sort_order: 110, description: '美国工业与安全局出口管制清单(EAR/ECL)，含实体清单' },
  { source_code: 'OFAC_SDN', source_name: '美国OFAC特别指定国民清单(SDN)', target_table: 'export_controls', market: 'NA', category: 'export_control', url: 'https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-list-sdn-list', official_name: 'OFAC SDN List', enabled: 1, check_interval_hours: 168, sort_order: 120, description: '美国财政部SDN制裁清单(禁止交易)' },
  { source_code: 'FEDERAL_REGISTER', source_name: '美国联邦公报(Federal Register)', target_table: 'regulations', market: 'NA', category: 'safety', url: 'https://www.federalregister.gov/', official_name: 'Federal Register', enabled: 1, check_interval_hours: 72, sort_order: 130, description: '美国所有新法规/管制修订的官方发布渠道' },
  { source_code: 'CFR_Title15', source_name: '美国eCFR 标题15(商业与外贸)', target_table: 'export_controls', market: 'NA', category: 'export_control', url: 'https://www.ecfr.gov/current/title-15', official_name: 'eCFR Title 15', enabled: 0, check_interval_hours: 720, sort_order: 140, description: '美国电子联邦法规汇编-商业外贸篇' },
  { source_code: 'UL_STANDARDS', source_name: 'UL标准库(UL Standards)', target_table: 'regulations', market: 'NA', category: 'ul', url: 'https://www.shopulstandards.com/StandardSearch.aspx', official_name: 'UL Standards', enabled: 1, check_interval_hours: 720, sort_order: 150, description: 'UL安全认证标准目录' },
  { source_code: 'NFPA_CODES', source_name: 'NFPA美国消防协会规范', target_table: 'regulations', market: 'NA', category: 'ul', url: 'https://www.nfpa.org/codes-and-standards/all-codes-and-standards/list-of-codes-and-standards', official_name: 'NFPA Codes & Standards', enabled: 0, check_interval_hours: 720, sort_order: 160, description: 'NFPA消防/电气规范(如NFPA 79工业机械电气标准)' },
  { source_code: 'FCC_RULES', source_name: 'FCC联邦通信委员会规则', target_table: 'regulations', market: 'NA', category: 'fcc', url: 'https://www.fcc.gov/wireless/bureau-divisions/technologies-systems-and-innovation-division/rules-regulations', official_name: 'FCC Rules & Regulations', enabled: 0, check_interval_hours: 720, sort_order: 170, description: 'FCC电磁兼容/射频规则' },
  { source_code: 'CNCA_CCC', source_name: '认监委CCC强制性产品认证目录', target_table: 'regulations', market: 'CN', category: 'ccc', url: 'https://www.cnca.gov.cn/zw/zwgk/qzxpzml/', official_name: '国家认监委CCC目录', enabled: 1, check_interval_hours: 168, sort_order: 210, description: '中国强制性产品认证(CCC)官方目录' },
  { source_code: 'CHINA_ROHS', source_name: '中国RoHS达标管理目录(电器电子产品)', target_table: 'regulations', market: 'CN', category: 'rohs', url: 'https://www.mee.gov.cn/xxgk2018/xxgk/xxgk01/201803/t20180302_631002.html', official_name: '电器电子产品有害物质限制使用管理办法', enabled: 1, check_interval_hours: 720, sort_order: 220, description: '中国RoHS2(中国RoHS达标管理目录)' },
  { source_code: 'MOFCOM_EXPORT', source_name: '商务部两用物项和技术出口管制清单', target_table: 'export_controls', market: 'CN', category: 'export_control', url: 'http://exportcontrol.mofcom.gov.cn/', official_name: '商务部出口管制系统', enabled: 1, check_interval_hours: 168, sort_order: 230, description: '中国两用物项(军民两用品)出口许可管制' },
  { source_code: 'CUSTOMS_RESTRICTED', source_name: '中国海关禁限类物品目录', target_table: 'export_controls', market: 'CN', category: 'export_control', url: 'http://www.customs.gov.cn/customs/302249/302266/index.html', official_name: '海关总署进出口禁限目录', enabled: 0, check_interval_hours: 720, sort_order: 240, description: '海关总署关于禁止/限制进出口物品的公告' },
  { source_code: 'JAPAN_PSE', source_name: '日本PSE电气用品安全法(meti.go.jp)', target_table: 'regulations', market: 'JP', category: 'pse', url: 'https://www.meti.go.jp/policy/consumer/seian/denki/', official_name: '電気用品安全法(PSE)', enabled: 0, check_interval_hours: 720, sort_order: 310, description: '日本PSE菱形/圆形认证(日语站)' },
  { source_code: 'KOREA_KC', source_name: '韩国KC认证标准(국가기술표준원)', target_table: 'regulations', market: 'KR', category: 'kc', url: 'https://www.kats.go.kr/', official_name: 'KATS KC认证', enabled: 0, check_interval_hours: 720, sort_order: 320, description: '韩国KC认证(韩语/英语站)' }
];

function ensureDefaultDataSources() {
  const db = getDb();
  const inserted: string[] = [];
  const tx = db.transaction(() => {
    for (const s of DEFAULT_DATA_SOURCES) {
      const exist = db.prepare('SELECT id FROM ce_data_sources WHERE source_code=?').get(s.source_code);
      if (!exist) {
        db.prepare(`INSERT INTO ce_data_sources
          (source_code, source_name, source_type, target_table, market, category, url, method,
           parser_type, parser_config, enabled, check_interval_hours, timeout_ms,
           description, official_name, sort_order)
          VALUES (?, ?, 'http_check', ?, ?, ?, ?, 'GET', 'status_check', NULL, ?, ?, 15000, ?, ?, ?)`)
          .run(
            s.source_code, s.source_name, s.target_table, s.market || null, s.category || null,
            s.url, s.enabled, s.check_interval_hours, s.description || null, s.official_name || null, s.sort_order
          );
        inserted.push(s.source_code);
      }
    }
  });
  tx();
  if (inserted.length > 0) {
    console.log(`[CE合规数据源] 已初始化默认数据源 ${inserted.length} 个: ${inserted.join(', ')}`);
  } else {
    console.log('[CE合规数据源] 默认数据源已存在，跳过初始化');
  }
}

// 获取数据源列表（含统计）
router.get('/data-sources', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { enabled, target_table, keyword } = req.query as any;
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (enabled !== undefined && enabled !== '') { where.push('enabled = ?'); params.push(parseInt(enabled)); }
    if (target_table) { where.push('target_table = ?'); params.push(target_table); }
    if (keyword) {
      where.push('(source_name LIKE ? OR source_code LIKE ? OR url LIKE ? OR official_name LIKE ?)');
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    const whereSql = 'WHERE ' + where.join(' AND ');
    const list = db.prepare(`SELECT * FROM ce_data_sources ${whereSql} ORDER BY sort_order ASC, id ASC`).all(...params);
    const total = (db.prepare(`SELECT COUNT(*) c FROM ce_data_sources ${whereSql}`).get(...params) as any).c;
    const enabledCount = (db.prepare(`SELECT COUNT(*) c FROM ce_data_sources WHERE enabled=1`).get() as any).c;
    const successCount = (db.prepare(`SELECT COUNT(*) c FROM ce_data_sources WHERE last_check_status='success'`).get() as any).c;
    const failedCount = (db.prepare(`SELECT COUNT(*) c FROM ce_data_sources WHERE last_check_status='failed'`).get() as any).c;
    const neverChecked = (db.prepare(`SELECT COUNT(*) c FROM ce_data_sources WHERE last_check_at IS NULL`).get() as any).c;
    const lastLogs = db.prepare(`SELECT * FROM ce_update_logs ORDER BY id DESC LIMIT 20`).all();
    res.json(createSuccessResponse({
      list, total,
      stats: { total, enabled: enabledCount, success: successCount, failed: failedCount, never_checked: neverChecked },
      recent_logs: lastLogs,
      options: {
        source_types: Object.entries(SOURCE_TYPE_MAP).map(([k, v]) => ({ value: k, label: v })),
        parser_types: Object.entries(PARSER_TYPE_MAP).map(([k, v]) => ({ value: k, label: v })),
        target_tables: [
          { value: 'regulations', label: '国际法规清单' },
          { value: 'export_controls', label: '进出口管控清单' }
        ],
        intervals: [
          { value: 6, label: '每6小时' },
          { value: 12, label: '每12小时' },
          { value: 24, label: '每天' },
          { value: 72, label: '每3天' },
          { value: 168, label: '每周(推荐)' },
          { value: 720, label: '每月' }
        ]
      }
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 获取单个数据源详情
router.get('/data-sources/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const source = db.prepare('SELECT * FROM ce_data_sources WHERE id=?').get(id);
    if (!source) return res.status(404).json(createErrorResponse('数据源不存在'));
    const logs = db.prepare('SELECT * FROM ce_update_logs WHERE source_id=? ORDER BY id DESC LIMIT 50').all(id);
    res.json(createSuccessResponse({ source, logs }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 新增数据源
router.post('/data-sources', (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('仅管理员可配置数据源'));
    }
    const db = getDb();
    const {
      source_code, source_name, source_type = 'http_check', target_table = 'regulations',
      market, category, url, method = 'GET', headers, parser_type = 'status_check',
      parser_config, enabled = 1, check_interval_hours = 168, timeout_ms = 15000,
      description, official_name, sort_order = 0
    } = req.body;
    if (!source_code || !source_name || !url) {
      return res.status(400).json(createErrorResponse('数据源编码、名称、URL为必填项'));
    }
    const exist = db.prepare('SELECT id FROM ce_data_sources WHERE source_code=?').get(source_code);
    if (exist) return res.status(400).json(createErrorResponse('数据源编码已存在'));
    const info = db.prepare(`INSERT INTO ce_data_sources
      (source_code, source_name, source_type, target_table, market, category, url, method,
       headers, parser_type, parser_config, enabled, check_interval_hours, timeout_ms,
       description, official_name, sort_order, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      source_code, source_name, source_type, target_table, market || null, category || null,
      url, method, headers ? JSON.stringify(headers) : null, parser_type,
      parser_config ? JSON.stringify(parser_config) : null, enabled ? 1 : 0,
      check_interval_hours, timeout_ms, description || null, official_name || null,
      sort_order, req.user?.id || null
    );
    res.json(createSuccessResponse({ id: info.lastInsertRowid }, '数据源已添加'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 更新数据源
router.put('/data-sources/:id', (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('仅管理员可修改数据源'));
    }
    const db = getDb();
    const id = parseInt(req.params.id);
    const source = db.prepare('SELECT id FROM ce_data_sources WHERE id=?').get(id);
    if (!source) return res.status(404).json(createErrorResponse('数据源不存在'));
    const allowed = ['source_name', 'source_type', 'target_table', 'market', 'category', 'url',
      'method', 'headers', 'parser_type', 'parser_config', 'enabled', 'check_interval_hours',
      'timeout_ms', 'description', 'official_name', 'sort_order'];
    const updates: string[] = [];
    const params: any[] = [];
    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        updates.push(`${key}=?`);
        let v = req.body[key];
        if (key === 'headers' || key === 'parser_config') {
          v = v ? (typeof v === 'string' ? v : JSON.stringify(v)) : null;
        }
        if (key === 'enabled') v = v ? 1 : 0;
        params.push(v);
      }
    });
    if (updates.length === 0) return res.json(createSuccessResponse(null, '无更新'));
    params.push(id);
    db.prepare(`UPDATE ce_data_sources SET ${updates.join(',')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...params);
    res.json(createSuccessResponse(null, '数据源已更新'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 删除数据源
router.delete('/data-sources/:id', (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('仅管理员可删除数据源'));
    }
    const db = getDb();
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM ce_data_sources WHERE id=?').run(id);
    db.prepare('DELETE FROM ce_update_logs WHERE source_id=?').run(id);
    res.json(createSuccessResponse(null, '数据源已删除'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 切换启用/禁用
router.post('/data-sources/:id/toggle', (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('仅管理员可操作'));
    }
    const db = getDb();
    const id = parseInt(req.params.id);
    const s: any = db.prepare('SELECT enabled FROM ce_data_sources WHERE id=?').get(id);
    if (!s) return res.status(404).json(createErrorResponse('数据源不存在'));
    const newVal = s.enabled ? 0 : 1;
    db.prepare('UPDATE ce_data_sources SET enabled=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(newVal, id);
    res.json(createSuccessResponse({ enabled: newVal }, newVal ? '已启用' : '已禁用'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// ========== 联网检查/更新服务 ==========

interface CheckResult {
  ok: boolean;
  httpStatus?: number;
  newCount: number;
  updatedCount: number;
  summary: string;
  error?: string;
  durationMs: number;
}

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function buildBrowserHeaders(source: any): Record<string, string> {
  const urlObj = new URL(source.url);
  const origin = `${urlObj.protocol}//${urlObj.host}`;
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive'
  };
  if (source.headers) {
    try { Object.assign(headers, JSON.parse(source.headers)); } catch (_) { /* ignore */ }
  }
  return headers;
}

async function fetchWithTimeout(url: string, options: any, timeoutMs: number): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return resp;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function checkSingleSource(source: any): Promise<CheckResult> {
  const start = Date.now();
  const timeoutMs = source.timeout_ms || 25000;
  const maxRetries = 2;
  let lastErr: any = null;
  let lastResp: globalThis.Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
      const headers = buildBrowserHeaders(source);
      const resp = await fetchWithTimeout(source.url, {
        method: source.method || 'GET',
        headers,
        redirect: 'follow'
      }, timeoutMs);
      lastResp = resp;
      if (resp.status === 403 && attempt < maxRetries) {
        const altHeaders = { ...headers };
        altHeaders['User-Agent'] = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
        delete altHeaders['Sec-Ch-Ua'];
        delete altHeaders['Sec-Ch-Ua-Mobile'];
        delete altHeaders['Sec-Ch-Ua-Platform'];
        delete altHeaders['Sec-Fetch-User'];
        altHeaders['Sec-Fetch-Site'] = 'none';
        const retryResp = await fetchWithTimeout(source.url, {
          method: source.method || 'GET',
          headers: altHeaders,
          redirect: 'follow'
        }, timeoutMs);
        lastResp = retryResp;
        if (retryResp.ok) break;
      }
      if (resp.ok || resp.status === 401 || resp.status === 403) {
        break;
      }
      if (attempt < maxRetries && (resp.status >= 500 || resp.status === 429)) {
        lastErr = new Error(`HTTP ${resp.status}`);
        continue;
      }
      break;
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxRetries) continue;
    }
  }

  const duration = Date.now() - start;

  if (!lastResp && lastErr) {
    return {
      ok: false, newCount: 0, updatedCount: 0,
      summary: `请求失败(重试${maxRetries}次): ${lastErr.message}`,
      error: lastErr.message, durationMs: duration
    };
  }

  if (!lastResp) {
    return {
      ok: false, newCount: 0, updatedCount: 0,
      summary: '未知错误', error: 'no response', durationMs: duration
    };
  }

  const resp = lastResp;
  let summary = `HTTP ${resp.status} ${resp.statusText}`;
  const lm = resp.headers.get('last-modified');
  const etag = resp.headers.get('etag');
  const cl = resp.headers.get('content-length');
  const contentType = resp.headers.get('content-type') || '';
  if (lm) summary += ` | Last-Modified: ${lm}`;
  if (etag) summary += ` | ETag: ${etag.slice(0, 40)}`;
  if (cl) summary += ` | Content-Length: ${cl}`;
  summary += ` | Content-Type: ${contentType.split(';')[0]}`;

  let newCount = 0, updatedCount = 0;
  const isReachable = resp.ok || resp.status === 401 || resp.status === 403;
  if (resp.status === 403) {
    summary += ' | 站点可达(反爬虫拦截，浏览器可正常访问)';
  }

  if (isReachable) {
    try {
      const db = getDb();
      const now = new Date().toLocaleString('zh-CN');
      const table = source.target_table === 'export_controls' ? 'ce_export_controls' : 'ce_regulations';
      const regionField = source.target_table === 'export_controls' ? 'control_region' : 'market';
      let targetRows: any[] = [];

      if (source.parser_type === 'status_check' || source.parser_type === 'metadata_check') {
        if (source.market && source.category && table === 'ce_regulations') {
          targetRows = db.prepare('SELECT id, source_code FROM ce_regulations WHERE market=? AND category=?').all(source.market, source.category) as any[];
        } else if (source.market) {
          targetRows = db.prepare(`SELECT id, source_code FROM ${table} WHERE ${regionField}=?`).all(source.market) as any[];
        }

        if (targetRows.length > 0) {
          let parsedInfo: any = {};
          if (source.parser_type === 'metadata_check') {
            try {
              const text = await resp.text();
              const dateMatches = {
                effective: text.match(/(?:effective|entry into force|Date of effect|生效)[^\d]{0,20}(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i),
                expiry: text.match(/(?:repealed|expired|expiry|ceases to apply|废止|失效)[^\d]{0,20}(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i),
                lastUpdate: text.match(/(?:last updated|Last modification|更新于|修订日期)[^\d]{0,20}(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i)
              };
              const normalizeDate = (m: RegExpMatchArray | null) => {
                if (!m) return null;
                const d = m[1].replace(/\./g, '-').replace(/\//g, '-');
                const parts = d.split('-');
                if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
                if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                return null;
              };
              parsedInfo = {
                parsed_effective: normalizeDate(dateMatches.effective as any),
                parsed_expiry: normalizeDate(dateMatches.expiry as any),
                parsed_last_update: normalizeDate(dateMatches.lastUpdate as any)
              };
            } catch (_) { /* ignore parse errors */ }
          }

          const updateFields = ['last_checked_at=?', 'last_check_result=?', 'source_code=?', 'source_updated_at=?'];
          const updateParams: any[] = [now, summary, source.source_code, now];
          if (parsedInfo.parsed_expiry) {
            updateFields.push('expiry_date=?');
            updateParams.push(parsedInfo.parsed_expiry);
          }
          if (parsedInfo.parsed_effective) {
            updateFields.push('effective_date=COALESCE(effective_date,?)');
            updateParams.push(parsedInfo.parsed_effective);
          }
          const updateSql = `UPDATE ${table} SET ${updateFields.join(', ')} WHERE id=?`;
          const update = db.prepare(updateSql);
          const tx = db.transaction(() => {
            targetRows.forEach(r => {
              update.run(...updateParams, r.id);
              updatedCount++;
            });
          });
          tx();

          let parseNote = '';
          if (parsedInfo.parsed_expiry) parseNote += ` | 识别到到期日期: ${parsedInfo.parsed_expiry}`;
          if (parsedInfo.parsed_effective) parseNote += ` | 识别到生效日期: ${parsedInfo.parsed_effective}`;
          summary += ` | 已更新 ${updatedCount} 条记录核查时间和数据源标记${parseNote}`;
        } else {
          summary += ` | 当前分类/市场下暂无本地记录，联网数据源可正常访问（管控清单数据由数据源动态维护，新增条目需人工确认后录入）`;
        }
      }
    } catch (e: any) {
      console.warn('[CE数据源] 解析结果处理失败:', e.message);
      summary += ` | 解析处理异常: ${e.message}`;
    }
  }

  return {
    ok: isReachable, httpStatus: resp.status, newCount, updatedCount,
    summary, durationMs: duration
  };
}

async function performSourceCheck(sourceId: number, checkType: 'manual' | 'auto', operatorId?: number): Promise<CheckResult> {
  const db = getDb();
  const source: any = db.prepare('SELECT * FROM ce_data_sources WHERE id=?').get(sourceId);
  if (!source) throw new Error('数据源不存在');

  const startedAt = new Date().toLocaleString('zh-CN');
  const logInfo = db.prepare(`INSERT INTO ce_update_logs
    (source_id, source_code, source_name, target_table, check_type, status, started_at, triggered_by)
    VALUES (?,?,?,?,?, 'running', ?, ?)`).run(
    source.id, source.source_code, source.source_name, source.target_table, checkType, startedAt, operatorId || null
  );
  const logId = logInfo.lastInsertRowid;

  const result = await checkSingleSource(source);

  const finishedAt = new Date().toLocaleString('zh-CN');
  const status = result.ok ? 'success' : 'failed';
  db.prepare(`UPDATE ce_update_logs SET status=?, http_status=?, finished_at=?, duration_ms=?,
    new_count=?, updated_count=?, error_message=?, response_summary=? WHERE id=?`).run(
    status, result.httpStatus || null, finishedAt, result.durationMs,
    result.newCount, result.updatedCount, result.error || null, result.summary, logId
  );

  db.prepare(`UPDATE ce_data_sources SET last_check_at=?, last_check_status=?, last_check_result=?,
    last_http_status=?, last_new_count=?, last_updated_count=?, updated_at=datetime('now','localtime')
    WHERE id=?`).run(
    finishedAt, status, result.summary, result.httpStatus || null,
    result.newCount, result.updatedCount, source.id
  );

  return result;
}

// 手动触发检查单个数据源
router.post('/data-sources/:id/check', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = await performSourceCheck(id, 'manual', req.user?.id);
    if (result.ok) {
      res.json(createSuccessResponse(result, `检查完成：${result.summary}`));
    } else {
      res.status(502).json(createErrorResponse(`检查失败：${result.error || result.summary}`));
    }
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 批量检查所有启用的数据源
router.post('/data-sources/check-all', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const sources: any[] = db.prepare('SELECT * FROM ce_data_sources WHERE enabled=1 ORDER BY sort_order ASC, id ASC').all();
    const results: any[] = [];
    for (const s of sources) {
      try {
        const r = await performSourceCheck(s.id, 'manual', req.user?.id);
        results.push({ id: s.id, name: s.source_name, ok: r.ok, summary: r.summary, duration: r.durationMs });
      } catch (e: any) {
        results.push({ id: s.id, name: s.source_name, ok: false, summary: e.message });
      }
    }
    const success = results.filter(r => r.ok).length;
    res.json(createSuccessResponse({
      total: sources.length, success, failed: sources.length - success, results
    }, `批量检查完成：成功${success}/${sources.length}`));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 获取最近更新日志
router.get('/update-logs', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const limit = Math.min(200, parseInt((req.query.limit as string) || '50'));
    const logs = db.prepare('SELECT * FROM ce_update_logs ORDER BY id DESC LIMIT ?').all(limit);
    res.json(createSuccessResponse({ list: logs }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// 获取全局合规更新状态（供页面显示）
router.get('/compliance-status', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const regLast = db.prepare(`SELECT MAX(last_checked_at) as t FROM ce_regulations`).get() as any;
    const ctrlLast = db.prepare(`SELECT MAX(last_checked_at) as t FROM ce_export_controls`).get() as any;
    const sourcesTotal = (db.prepare('SELECT COUNT(*) c FROM ce_data_sources').get() as any).c;
    const sourcesEnabled = (db.prepare('SELECT COUNT(*) c FROM ce_data_sources WHERE enabled=1').get() as any).c;
    const sourcesSuccess = (db.prepare('SELECT COUNT(*) c FROM ce_data_sources WHERE last_check_status=\'success\'').get() as any).c;
    const sourcesFailed = (db.prepare('SELECT COUNT(*) c FROM ce_data_sources WHERE last_check_status=\'failed\'').get() as any).c;
    const lastRun = db.prepare('SELECT * FROM ce_update_logs ORDER BY id DESC LIMIT 1').get();
    res.json(createSuccessResponse({
      regulations_last_check: regLast?.t || null,
      controls_last_check: ctrlLast?.t || null,
      sources: { total: sourcesTotal, enabled: sourcesEnabled, success: sourcesSuccess, failed: sourcesFailed },
      last_run: lastRun
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

// ========== 自动检查定时任务 ==========
let autoCheckTimer: NodeJS.Timeout | null = null;
let isChecking = false;

async function runAutoCheck() {
  if (isChecking) return;
  isChecking = true;
  try {
    const db = getDb();
    const sources: any[] = db.prepare(`SELECT * FROM ce_data_sources WHERE enabled=1
      AND (last_check_at IS NULL OR
           (strftime('%s','now','localtime') - strftime('%s',last_check_at)) > check_interval_hours * 3600)
      ORDER BY sort_order ASC, id ASC`).all();
    if (sources.length === 0) return;
    console.log(`[CE合规自动检查] 开始检查 ${sources.length} 个到期数据源...`);
    let success = 0, failed = 0;
    for (const s of sources) {
      try {
        const r = await performSourceCheck(s.id, 'auto');
        if (r.ok) success++; else failed++;
      } catch (e) { failed++; }
    }
    console.log(`[CE合规自动检查] 完成：成功${success}，失败${failed}`);
  } catch (err: any) {
    console.error('[CE合规自动检查] 任务异常:', err.message);
  } finally {
    isChecking = false;
  }
}

function startAutoCheck() {
  if (autoCheckTimer) clearInterval(autoCheckTimer);
  autoCheckTimer = setInterval(() => { runAutoCheck().catch(e => console.error('[CE合规自动检查]', e.message)); }, 60 * 60 * 1000);
  console.log('[CE合规自动检查] 定时任务已启动（每小时扫描一次，按各数据源设定间隔检查）');
  setTimeout(() => { runAutoCheck().catch(e => console.error('[CE合规自动检查] 首次检查:', e.message)); }, 10000);
}

export function initCeComplianceAutoCheck() {
  try { ensureDefaultDataSources(); } catch (e: any) { console.error('[CE合规数据源] 初始化默认数据失败:', e.message); }
  startAutoCheck();
}

export default router;
