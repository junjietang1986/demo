import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import {
  isFeishuConfigured,
  getDepartmentTree,
  getDepartmentUsers,
  getAllUsers,
  getDepartmentList,
  searchUsers as feishuSearchUsers,
  clearTokenCache,
  getSyncScopeFullTree,
  saveDeptTreeCache,
  FeishuUser,
  FeishuDepartment
} from '../utils/feishu';
import bcrypt from 'bcryptjs';

const router = Router();

let autoSyncTimer: NodeJS.Timeout | null = null;
let isSyncing = false;
let lastSyncInfo: { time: string; total: number; created: number; updated: number; error?: string } | null = null;

async function performSync(operatorId?: number): Promise<{ total: number; created: number; updated: number }> {
  if (!isFeishuConfigured()) {
    throw new Error('请先配置飞书应用凭证');
  }
  if (isSyncing) {
    throw new Error('同步正在进行中，请稍候');
  }

  isSyncing = true;
  try {
    console.log('[飞书同步] 开始同步飞书用户...');
    const deptTreeData = await getSyncScopeFullTree();
    console.log(`[飞书同步] 已获取部门树，根节点: ${deptTreeData.rootName}，共 ${deptTreeData.tree[0]?.children?.length || 0} 个一级子部门`);
    const feishuUsers = await getAllUsers();
    console.log(`[飞书同步] 获取到 ${feishuUsers.length} 个飞书用户（工程技术中心范围）`);

    feishuUsers.forEach((u, idx) => {
      console.log(`[飞书同步] 用户${idx + 1}: name="${u.name}", email=${u.email}, mobile=${u.mobile}, dept="${u.primary_dept_name || u.dept_path}", job_title="${u.job_title || ''}", role=${u.assigned_role}`);
    });

    const db = getDb();

    db.exec('BEGIN');

    try {
      const selectByFeishuId = db.prepare('SELECT id, username, password, feishu_user_id, role, status FROM users WHERE feishu_user_id = ?');
      const selectByUsername = db.prepare('SELECT id, username, password, feishu_user_id, role, status FROM users WHERE username = ?');
      const insertUser = db.prepare(`
        INSERT INTO users (username, password, name, email, phone, department, role, job_title, feishu_user_id, feishu_open_id, feishu_department_ids, avatar, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now','localtime'), datetime('now','localtime'))
      `);
      const updateUser = db.prepare(`
        UPDATE users SET name=?, email=?, phone=?, department=?, role=?, job_title=?, feishu_open_id=?, feishu_department_ids=?, avatar=?, updated_at=datetime('now','localtime')
        WHERE id=?
      `);
      const deactivateUser = db.prepare(`UPDATE users SET status='inactive', updated_at=datetime('now','localtime') WHERE id=?`);
      const reactivateUser = db.prepare(`UPDATE users SET status='active', updated_at=datetime('now','localtime') WHERE id=?`);

      const defaultPasswordHash = bcrypt.hashSync('feishu_user123', 10);

      const activeFeishuUserIds = new Set<string>();
      let created = 0, updated = 0;

      const activatedUsers = feishuUsers.filter(u => {
        if (u.is_activated === false) return false;
        if (u.status && u.status.is_activated === false) return false;
        return true;
      });

      console.log(`[飞书同步] 激活用户数: ${activatedUsers.length}`);

      const roleNameMap: Record<string, string> = {
        'admin': '系统管理员',
        'super_admin': '超级管理员',
        'dept_manager': '部门经理',
        'project_manager': '项目经理',
        'qa_engineer': '质量工程师',
        'doc_controller': '文控管理员',
        'user': '普通用户'
      };

      for (const u of activatedUsers) {
        activeFeishuUserIds.add(u.user_id);
        const deptName = u.dept_path || u.primary_dept_name || '';
        const username = u.email || `fs_${u.user_id.substring(0, 12)}`;
        const displayName = (u.name && u.name.trim()) ? u.name : (u.en_name || username || '未知用户');
        const assignedRole = u.assigned_role || 'user';

        let existing = selectByFeishuId.get(u.user_id) as any;
        if (!existing) {
          existing = selectByUsername.get(username) as any;
        }

        if (existing) {
          if (existing.status === 'inactive') {
            reactivateUser.run(existing.id);
          }
          if (!existing.feishu_user_id) {
            db.prepare('UPDATE users SET feishu_user_id=?, feishu_open_id=? WHERE id=?').run(u.user_id, u.open_id, existing.id);
          }
          const finalRole = existing.role;
          updateUser.run(
            displayName,
            u.email || null,
            u.mobile || null,
            deptName || null,
            finalRole,
            u.job_title || null,
            u.open_id,
            JSON.stringify(u.department_ids || []),
            u.avatar_url || null,
            existing.id
          );
          updated++;
        } else {
          insertUser.run(
            username,
            defaultPasswordHash,
            displayName,
            u.email || null,
            u.mobile || null,
            deptName || null,
            assignedRole,
            u.job_title || null,
            u.user_id,
            u.open_id,
            JSON.stringify(u.department_ids || []),
            u.avatar_url || null
          );
          created++;
        }
      }

      const syncFeishuIds = new Set(feishuUsers.map(u => u.user_id));
      const localFeishuUsers = db.prepare("SELECT id, feishu_user_id FROM users WHERE feishu_user_id IS NOT NULL AND feishu_user_id != '' AND status='active'").all() as any[];
      let deactivated = 0;
      for (const lu of localFeishuUsers) {
        if (!syncFeishuIds.has(lu.feishu_user_id)) {
          const isAdmin = db.prepare('SELECT role FROM users WHERE id=?').get(lu.id) as any;
          if (isAdmin && (isAdmin.role === 'admin' || isAdmin.role === 'super_admin')) {
            continue;
          }
          deactivateUser.run(lu.id);
          deactivated++;
        }
      }

      db.exec('COMMIT');
      console.log(`[飞书同步] 事务提交成功: 新增${created}人, 更新${updated}人, 停用${deactivated}人`);

      const now = new Date().toLocaleString('zh-CN');
      lastSyncInfo = { time: now, total: activatedUsers.length, created, updated };

      const upsertConfig = db.prepare(`
        INSERT INTO system_configs (key, value, description, updated_by, updated_at)
        VALUES (?, ?, ?, ?, datetime('now','localtime'))
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
      `);
      upsertConfig.run('feishu_last_sync_time', now, '飞书最后同步时间', operatorId || null);
      upsertConfig.run('feishu_last_sync_result', JSON.stringify({ total: activatedUsers.length, created, updated, deactivated }), '飞书最后同步结果', operatorId || null);
      saveDeptTreeCache({
        tree: deptTreeData.tree,
        deptPathMap: deptTreeData.deptPathMap,
        deptIdByPath: deptTreeData.deptIdByPath,
        rootDeptId: deptTreeData.rootDeptId,
        rootName: deptTreeData.rootName
      });
      console.log('[飞书同步] 部门树已缓存');

      console.log(`[飞书同步] 同步完成：共${activatedUsers.length}人，新增${created}人，更新${updated}人，停用${deactivated}人`);
      return { total: activatedUsers.length, created, updated };
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('[飞书同步] 同步失败，事务已回滚:', err);
      throw err;
    }
  } finally {
    isSyncing = false;
  }
}

function startAutoSync() {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }

  const db = getDb();
  const config = db.prepare("SELECT value FROM system_configs WHERE key='feishu_auto_sync'").get() as any;
  const intervalMinutes = parseInt(config?.value || '30', 10);

  if (intervalMinutes <= 0 || !isFeishuConfigured()) {
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  autoSyncTimer = setInterval(async () => {
    if (isSyncing || !isFeishuConfigured()) return;
    try {
      await performSync();
      console.log(`[飞书自动同步] ${new Date().toLocaleString('zh-CN')} 同步完成`);
    } catch (err: any) {
      console.error('[飞书自动同步] 失败:', err.message);
    }
  }, intervalMs);

  console.log(`[飞书自动同步] 已启动，每${intervalMinutes}分钟同步一次`);
}

router.use(authMiddleware);

router.get('/status', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const configs = db.prepare("SELECT key, value FROM system_configs WHERE key LIKE 'feishu_%'").all() as any[];
    const map: Record<string, string> = {};
    configs.forEach(c => { map[c.key] = c.value; });

    const configured = isFeishuConfigured();
    const autoSyncInterval = parseInt(map.feishu_auto_sync || '30', 10);

    let lastSync = null;
    if (map.feishu_last_sync_time) {
      try {
        lastSync = {
          time: map.feishu_last_sync_time,
          result: map.feishu_last_sync_result ? JSON.parse(map.feishu_last_sync_result) : null
        };
      } catch (_) {
        lastSync = { time: map.feishu_last_sync_time, result: null };
      }
    }

    res.json(createSuccessResponse({
      configured,
      app_id_configured: !!(map.feishu_app_id || process.env.FEISHU_APP_ID),
      app_secret_configured: !!(map.feishu_app_secret || process.env.FEISHU_APP_SECRET),
      app_id_masked: map.feishu_app_id ? maskValue(map.feishu_app_id) : (process.env.FEISHU_APP_ID ? maskValue(process.env.FEISHU_APP_ID) : ''),
      auto_sync_enabled: autoSyncInterval > 0,
      auto_sync_interval: autoSyncInterval,
      is_syncing: isSyncing,
      last_sync: lastSync || (lastSyncInfo ? { time: lastSyncInfo.time, result: { total: lastSyncInfo.total, created: lastSyncInfo.created, updated: lastSyncInfo.updated } } : null)
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/config', (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('仅管理员可修改飞书配置'));
    }
    const { app_id, app_secret, auto_sync_interval } = req.body;
    const db = getDb();
    const userId = req.user?.id;

    const upsert = db.prepare(`
      INSERT INTO system_configs (key, value, description, updated_by, updated_at)
      VALUES (?, ?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at
    `);

    if (app_id !== undefined) {
      upsert.run('feishu_app_id', app_id || '', '飞书应用 App ID', userId);
    }
    if (app_secret !== undefined) {
      upsert.run('feishu_app_secret', app_secret || '', '飞书应用 App Secret', userId);
    }
    if (auto_sync_interval !== undefined) {
      const interval = Math.max(0, Math.min(1440, parseInt(auto_sync_interval, 10) || 0));
      upsert.run('feishu_auto_sync', String(interval), '飞书自动同步间隔(分钟,0表示关闭)', userId);
    }

    clearTokenCache();

    if (isFeishuConfigured()) {
      startAutoSync();
    }

    res.json(createSuccessResponse(null, '飞书配置已保存'));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/departments', async (req: Request, res: Response) => {
  try {
    if (!isFeishuConfigured()) {
      return res.json(createSuccessResponse({ tree: [], configured: false }));
    }
    const tree = await getDepartmentTree();
    res.json(createSuccessResponse({ tree, configured: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/departments/:deptId/users', async (req: Request, res: Response) => {
  try {
    if (!isFeishuConfigured()) {
      return res.json(createSuccessResponse({ users: [], configured: false }));
    }
    const users = await getDepartmentUsers(req.params.deptId, 'department_id');
    res.json(createSuccessResponse({ users, configured: true }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/users', async (req: Request, res: Response) => {
  try {
    if (!isFeishuConfigured()) {
      const db = getDb();
      const localUsers = db.prepare(`
        SELECT id, name, username, email, department, role, avatar
        FROM users WHERE status = 'active' ORDER BY department, name
      `).all();
      return res.json(createSuccessResponse({ users: localUsers, configured: false, source: 'local' }));
    }

    const keyword = req.query.keyword as string;
    let feishuUsers: FeishuUser[];
    if (keyword && keyword.trim()) {
      feishuUsers = await feishuSearchUsers(keyword.trim());
    } else {
      feishuUsers = await getAllUsers();
    }

    const db = getDb();
    const deptMap = new Map<string, string>();
    try {
      const depts = await getDepartmentList('department_id');
      depts.forEach((d: FeishuDepartment) => {
        deptMap.set(d.department_id, d.name);
        if (d.open_department_id) deptMap.set(d.open_department_id, d.name);
      });
    } catch (_) { /* ignore */ }

    const users = feishuUsers
      .filter(u => u.is_activated !== false && (!u.status || u.status.is_activated !== false))
      .map(u => ({
        user_id: u.user_id,
        open_id: u.open_id,
        name: (u.name && u.name.trim()) ? u.name : (u.en_name || u.email || '未知用户'),
        email: u.email,
        mobile: u.mobile,
        department: u.department_ids.map(id => deptMap.get(id) || id).filter(Boolean).join('/'),
        department_ids: u.department_ids,
        job_title: u.job_title,
        avatar_url: u.avatar_url
      }));

    res.json(createSuccessResponse({ users, configured: true, source: 'feishu' }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const keyword = (req.query.keyword as string) || '';
    if (!keyword.trim()) {
      return res.json(createSuccessResponse({ users: [] }));
    }
    if (!isFeishuConfigured()) {
      const db = getDb();
      const local = db.prepare(`
        SELECT id, name, username, email, department FROM users
        WHERE status='active' AND (name LIKE ? OR username LIKE ? OR email LIKE ?)
        ORDER BY name LIMIT 20
      `).all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      return res.json(createSuccessResponse({ users: local, source: 'local' }));
    }
    const users = await feishuSearchUsers(keyword);
    res.json(createSuccessResponse({ users: users.filter(u => u.is_activated !== false), source: 'feishu' }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/sync-users', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('仅管理员可同步飞书用户'));
    }
    const result = await performSync(req.user?.id);
    res.json(createSuccessResponse(result, `同步完成：新增${result.created}人，更新${result.updated}人`));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message));
  }
});

function maskValue(v: string): string {
  if (!v || v.length <= 6) return '***';
  return v.substring(0, 4) + '****' + v.substring(v.length - 4);
}

export function initFeishuAutoSync() {
  try {
    startAutoSync();
  } catch (err) {
    console.error('[飞书自动同步] 初始化失败:', err);
  }
}

export default router;
