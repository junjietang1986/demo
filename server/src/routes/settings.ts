import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getDb } from '../db/database';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/database-config', requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const dbPath = path.join(__dirname, '..', '..', 'data', 'qms.db');
    const dbStats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
    
    let tableCount = 0;
    let tables: any[] = [];
    try {
      const db = getDb();
      tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as any[];
      tableCount = tables.length;
    } catch (e) {}

    const config = {
      database: {
        type: 'SQLite (better-sqlite3)',
        path: dbPath,
        filename: path.basename(dbPath),
        size_bytes: dbStats?.size || 0,
        size_mb: dbStats ? (dbStats.size / (1024 * 1024)).toFixed(2) : '0.00',
        created_at: dbStats?.birthtime || null,
        modified_at: dbStats?.mtime || null,
        exists: fs.existsSync(dbPath)
      },
      connection: {
        client: 'better-sqlite3',
        mode: 'synchronous (WAL)',
        journal_mode: 'WAL',
        foreign_keys: 'ON',
        busy_timeout: 5000
      },
      server: {
        platform: os.platform(),
        arch: os.arch(),
        node_version: process.version,
        uptime_hours: (process.uptime() / 3600).toFixed(2),
        memory_usage_mb: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2),
        total_memory_gb: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2),
        free_memory_gb: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2),
        cpus: os.cpus().length,
        hostname: os.hostname()
      },
      storage: {
        uploads_dir: path.join(__dirname, '..', '..', 'uploads'),
        data_dir: path.join(__dirname, '..', '..', 'data')
      },
      tables: {
        count: tableCount,
        list: tables.map((t: any) => t.name)
      }
    };

    res.json({ code: 0, data: config });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

router.get('/table-stats', requireRole('admin'), (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as any[];
    const stats: Array<{ name: string; count: number }> = [];
    let totalRecords = 0;
    tables.forEach((t: any) => {
      try {
        const count = (db.prepare(`SELECT COUNT(*) c FROM "${t.name}"`).get() as any)?.c || 0;
        stats.push({ name: t.name, count });
        totalRecords += count;
      } catch (e) {}
    });
    res.json({ code: 0, data: { table_stats: stats, total_records: totalRecords } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

router.get('/tables/:tableName/schema', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const tableName = req.params.tableName;
    if (!tableName || /[^a-zA-Z0-9_]/.test(tableName)) {
      return res.status(400).json({ code: 400, message: '无效的表名' });
    }
    const db = getDb();
    const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%'`).get(tableName);
    if (!tableCheck) {
      return res.status(404).json({ code: 404, message: '表不存在' });
    }
    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${tableName}")`).all() as any[];
    res.json({ code: 0, data: { columns, foreign_keys: foreignKeys } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

router.get('/tables/:tableName/data', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const tableName = req.params.tableName;
    if (!tableName || /[^a-zA-Z0-9_]/.test(tableName)) {
      return res.status(400).json({ code: 400, message: '无效的表名' });
    }
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const search = (req.query.search as string) || '';
    const sortBy = (req.query.sortBy as string) || '';
    const sortOrder = (req.query.sortOrder as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const offset = (page - 1) * pageSize;

    const db = getDb();
    const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%'`).get(tableName);
    if (!tableCheck) {
      return res.status(404).json({ code: 404, message: '表不存在' });
    }

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    const pkColumn = columns.find(c => c.pk === 1);

    let whereClause = '';
    let params: any[] = [];
    if (search) {
      const searchConditions = columns
        .filter(c => c.type.toLowerCase().includes('text') || c.type.toLowerCase().includes('char') || c.type.toLowerCase().includes('varchar'))
        .map(c => `"${c.name}" LIKE ?`)
        .join(' OR ');
      if (searchConditions) {
        whereClause = `WHERE ${searchConditions}`;
        params = columns
          .filter(c => c.type.toLowerCase().includes('text') || c.type.toLowerCase().includes('char') || c.type.toLowerCase().includes('varchar'))
          .map(() => `%${search}%`);
      }
    }

    let orderClause = '';
    if (sortBy && columns.find(c => c.name === sortBy)) {
      orderClause = `ORDER BY "${sortBy}" ${sortOrder}`;
    } else if (pkColumn) {
      orderClause = `ORDER BY "${pkColumn.name}" ASC`;
    }

    const countSql = `SELECT COUNT(*) c FROM "${tableName}" ${whereClause}`;
    const total = (db.prepare(countSql).get(...params) as any)?.c || 0;

    const dataSql = `SELECT * FROM "${tableName}" ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const rows = db.prepare(dataSql).all(...params, pageSize, offset) as any[];

    res.json({
      code: 0,
      data: {
        rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

router.put('/tables/:tableName/data/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const tableName = req.params.tableName;
    const id = req.params.id;
    if (!tableName || /[^a-zA-Z0-9_]/.test(tableName)) {
      return res.status(400).json({ code: 400, message: '无效的表名' });
    }
    const db = getDb();
    const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%'`).get(tableName);
    if (!tableCheck) {
      return res.status(404).json({ code: 404, message: '表不存在' });
    }

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    const pkColumn = columns.find(c => c.pk === 1);
    if (!pkColumn) {
      return res.status(400).json({ code: 400, message: '该表没有主键，无法更新' });
    }

    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ code: 400, message: '无效的数据' });
    }

    const allowedColumns = columns.filter(c => !c.pk || c.name !== pkColumn.name);
    const updateFields: string[] = [];
    const updateParams: any[] = [];

    for (const col of allowedColumns) {
      if (data.hasOwnProperty(col.name)) {
        updateFields.push(`"${col.name}" = ?`);
        updateParams.push(data[col.name] === null ? null : data[col.name]);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段' });
    }

    updateParams.push(id);
    const sql = `UPDATE "${tableName}" SET ${updateFields.join(', ')} WHERE "${pkColumn.name}" = ?`;
    const result = db.prepare(sql).run(...updateParams);

    res.json({ code: 0, data: { changes: result.changes } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

router.post('/tables/:tableName/data', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const tableName = req.params.tableName;
    if (!tableName || /[^a-zA-Z0-9_]/.test(tableName)) {
      return res.status(400).json({ code: 400, message: '无效的表名' });
    }
    const db = getDb();
    const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%'`).get(tableName);
    if (!tableCheck) {
      return res.status(404).json({ code: 404, message: '表不存在' });
    }

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ code: 400, message: '无效的数据' });
    }

    const insertColumns: string[] = [];
    const insertValues: any[] = [];
    const placeholders: string[] = [];

    for (const col of columns) {
      if (data.hasOwnProperty(col.name)) {
        insertColumns.push(`"${col.name}"`);
        placeholders.push('?');
        insertValues.push(data[col.name] === null ? null : data[col.name]);
      }
    }

    if (insertColumns.length === 0) {
      return res.status(400).json({ code: 400, message: '没有可插入的字段' });
    }

    const sql = `INSERT INTO "${tableName}" (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const result = db.prepare(sql).run(...insertValues);

    res.json({ code: 0, data: { id: result.lastInsertRowid } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

router.delete('/tables/:tableName/data/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const tableName = req.params.tableName;
    const id = req.params.id;
    if (!tableName || /[^a-zA-Z0-9_]/.test(tableName)) {
      return res.status(400).json({ code: 400, message: '无效的表名' });
    }
    const db = getDb();
    const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%'`).get(tableName);
    if (!tableCheck) {
      return res.status(404).json({ code: 404, message: '表不存在' });
    }

    const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
    const pkColumn = columns.find(c => c.pk === 1);
    if (!pkColumn) {
      return res.status(400).json({ code: 400, message: '该表没有主键，无法删除' });
    }

    const sql = `DELETE FROM "${tableName}" WHERE "${pkColumn.name}" = ?`;
    const result = db.prepare(sql).run(id);

    res.json({ code: 0, data: { changes: result.changes } });
  } catch (e: any) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

export default router;
