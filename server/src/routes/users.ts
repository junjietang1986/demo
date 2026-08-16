import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import { getDeptTreeCache, getSyncScopeFullTree, isFeishuConfigured } from '../utils/feishu';
import { getAllRoles, getRoleByCode } from '../utils/permissions';
import { extractChineseDisplayName } from '../utils/userHelper';

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${timestamp}_${originalName}`);
  }
});
const upload = multer({ storage });

const getRoleLabels = (): Record<string, string> => {
  const labels: Record<string, string> = {
    admin: '系统管理员',
    super_admin: '超级管理员',
    user: '普通用户'
  };
  try {
    const roles = getAllRoles();
    roles.forEach(r => { labels[r.code] = r.name; });
  } catch (e) {}
  return labels;
};

router.get('/', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const department = req.query.department as string;
    const role = req.query.role as string;
    const search = req.query.search as string;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (department) {
      whereClauses.push('department LIKE ?');
      params.push(`%${department}%`);
    }
    if (role) {
      whereClauses.push('role = ?');
      params.push(role);
    }
    if (search) {
      whereClauses.push('(username LIKE ? OR name LIKE ? OR email LIKE ? OR phone LIKE ? OR job_title LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      whereClauses.push("status = 'active'");
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const totalResult = db.prepare(`SELECT COUNT(*) as total FROM users ${whereSql}`).get(...params) as any;
    const total = totalResult.total;

    const offset = (page - 1) * pageSize;
    const users = db.prepare(
      `SELECT id, username, name, email, phone, department, role, job_title, feishu_user_id, feishu_open_id, avatar, status, created_at, updated_at
       FROM users ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset) as any[];

    const roleLabels = getRoleLabels();
    const usersWithLabels = users.map(u => ({
      ...u,
      display_name: extractChineseDisplayName(u.name || ''),
      role_label: roleLabels[u.role] || u.role
    }));

    return res.json(createSuccessResponse({
      list: usersWithLabels,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取用户列表失败'));
  }
});

router.get('/simple', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const users = db.prepare(
      `SELECT id, name, username, department, role FROM users WHERE status = 'active' ORDER BY name`
    ).all() as any[];
    const enriched = users.map(u => ({ ...u, display_name: extractChineseDisplayName(u.name || '') }));
    return res.json(createSuccessResponse(enriched));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, name, email, phone, department, role, avatar FROM users WHERE id = ?'
    ).get(req.user!.id) as any;
    if (!user) {
      return res.status(404).json(createErrorResponse('用户不存在'));
    }
    user.display_name = extractChineseDisplayName(user.name || '');
    return res.json(createSuccessResponse(user));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json(createErrorResponse('权限不足，仅管理员可创建用户'));
    }

    const { username, password, name, email, phone, department, role, job_title } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json(createErrorResponse('用户名、密码和姓名为必填项'));
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json(createErrorResponse('用户名已存在'));
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, name, email, phone, department, role, job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hashedPassword, name, email || null, phone || null, department || null, role || 'user', job_title || null);

    const newUser = db.prepare(
      'SELECT id, username, name, email, phone, department, role, job_title, status, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    return res.json(createSuccessResponse(newUser, '用户创建成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '创建用户失败'));
  }
});

router.put('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id);
    const currentUser = req.user!;

    if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin' && currentUser.id !== userId) {
      return res.status(403).json(createErrorResponse('权限不足，只能修改自己的信息或由管理员操作'));
    }

    const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';
    const { name, email, phone, department, role, job_title, password, status } = req.body;
    const db = getDb();

    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!existingUser) {
      return res.status(404).json(createErrorResponse('用户不存在'));
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (department !== undefined && isAdmin) { updates.push('department = ?'); params.push(department); }
    if (role !== undefined && isAdmin) { updates.push('role = ?'); params.push(role); }
    if (job_title !== undefined && isAdmin) { updates.push('job_title = ?'); params.push(job_title); }
    if (status !== undefined && isAdmin) { updates.push('status = ?'); params.push(status); }
    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      const user = db.prepare(
        'SELECT id, username, name, email, phone, department, role, job_title, status, created_at, updated_at FROM users WHERE id = ?'
      ).get(userId);
      return res.json(createSuccessResponse(user));
    }

    updates.push('updated_at = datetime(\'now\', \'localtime\')');
    params.push(userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedUser = db.prepare(
      'SELECT id, username, name, email, phone, department, role, job_title, feishu_user_id, feishu_open_id, avatar, status, created_at, updated_at FROM users WHERE id = ?'
    ).get(userId);

    return res.json(createSuccessResponse(updatedUser, '用户信息更新成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新用户失败'));
  }
});

router.delete('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json(createErrorResponse('权限不足，仅管理员可删除用户'));
    }

    const userId = parseInt(req.params.id);
    if (userId === req.user!.id) {
      return res.status(400).json(createErrorResponse('不能删除当前登录用户'));
    }

    const db = getDb();
    const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existingUser) {
      return res.status(404).json(createErrorResponse('用户不存在'));
    }

    const feishuUser = db.prepare('SELECT feishu_user_id FROM users WHERE id = ?').get(userId) as any;
    if (feishuUser?.feishu_user_id) {
      db.prepare("UPDATE users SET status='inactive', updated_at=datetime('now','localtime') WHERE id=?").run(userId);
      return res.json(createSuccessResponse(null, '飞书同步用户已停用'));
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return res.json(createSuccessResponse(null, '用户删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除用户失败'));
  }
});

router.post('/:id/reset-password', authMiddleware, (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json(createErrorResponse('权限不足'));
    }
    const userId = parseInt(req.params.id);
    const db = getDb();
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password=?, updated_at=datetime('now','localtime') WHERE id=?").run(hashedPassword, userId);
    return res.json(createSuccessResponse({ newPassword }, '密码重置成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/change-password', authMiddleware, (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json(createErrorResponse('旧密码和新密码不能为空'));
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json(createErrorResponse('旧密码错误'));
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password=?, updated_at=datetime('now','localtime') WHERE id=?").run(hashedPassword, req.user!.id);
    return res.json(createSuccessResponse(null, '密码修改成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/department-tree', authMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT id, name, email, phone, department, role, job_title, avatar, feishu_department_ids, status
      FROM users
      WHERE status = 'active'
      ORDER BY department, name
    `).all() as any[];

    const roleLabels = getRoleLabels();

    let cachedTree = getDeptTreeCache();

    if (!cachedTree && isFeishuConfigured()) {
      try {
        const fresh = await getSyncScopeFullTree();
        cachedTree = { ...fresh, cachedAt: new Date().toISOString() };
      } catch (e: any) {
        console.error('[department-tree] 缓存不存在且获取飞书部门树失败:', e.message);
      }
    }

    const deptUsersMap: Record<string, any[]> = {};
    let treeData: any[] = [];

    if (cachedTree) {
      const { tree, deptPathMap } = cachedTree;

      const deptIdUserMap = new Map<string, any[]>();
      const deptIdLeaderMap = new Map<string, string>();

      for (const u of users) {
        const userInfo = {
          id: u.id,
          name: u.name,
          display_name: extractChineseDisplayName(u.name || ''),
          email: u.email,
          phone: u.phone,
          department: u.department,
          role: u.role,
          role_label: roleLabels[u.role] || u.role,
          job_title: u.job_title,
          avatar: u.avatar,
          is_leader: u.role === 'dept_manager' || u.role === 'admin' || u.role === 'super_admin'
        };

        let userDeptIds: string[] = [];
        if (u.feishu_department_ids) {
          try {
            userDeptIds = JSON.parse(u.feishu_department_ids) as string[];
          } catch (_) {}
        }

        if (userDeptIds.length === 0 && u.department) {
          const deptId = Object.entries(deptPathMap).find(([_, p]) => p === u.department)?.[0];
          if (deptId) userDeptIds = [deptId];
        }

        for (const did of userDeptIds) {
          if (!deptPathMap[did]) continue;
          if (!deptIdUserMap.has(did)) deptIdUserMap.set(did, []);
          const arr = deptIdUserMap.get(did)!;
          if (!arr.find(x => x.id === u.id)) {
            arr.push(userInfo);
            if (userInfo.is_leader && !deptIdLeaderMap.has(did)) {
              deptIdLeaderMap.set(did, u.name);
            }
          }
        }
      }

      function attachUsers(node: any): any {
        const feishuId = node.dept_id;
        const path = node.path;
        const members = deptIdUserMap.get(feishuId) || [];

        if (members.length > 0) {
          deptUsersMap[path] = members;
        }

        const children = (node.children || []).map(attachUsers);
        let totalCount = members.length;
        children.forEach((c: any) => { totalCount += c.userCount; });

        return {
          key: feishuId,
          title: node.name + (totalCount > 0 ? ` (${totalCount})` : ''),
          name: node.name,
          path: path,
          dept_id: feishuId,
          userCount: totalCount,
          directUserCount: members.length,
          leaderName: deptIdLeaderMap.get(feishuId) || null,
          children: children.length > 0 ? children : undefined
        };
      }

      treeData = tree.map(attachUsers);
    }

    if (treeData.length === 0) {
      interface LocalDeptNode {
        key: string;
        title: string;
        path: string;
        userCount: number;
        leaderName: string | null;
        children: LocalDeptNode[];
      }
      const localUserDeptMap = new Map<string, any[]>();
      const rootMap = new Map<string, LocalDeptNode>();
      const allNodes = new Map<string, LocalDeptNode>();

      for (const u of users) {
        const userInfo = {
          id: u.id,
          name: u.name,
          display_name: extractChineseDisplayName(u.name || ''),
          email: u.email,
          phone: u.phone,
          department: u.department,
          role: u.role,
          role_label: roleLabels[u.role] || u.role,
          job_title: u.job_title,
          avatar: u.avatar,
          is_leader: u.role === 'dept_manager' || u.role === 'admin' || u.role === 'super_admin'
        };
        if (u.department) {
          if (!localUserDeptMap.has(u.department)) localUserDeptMap.set(u.department, []);
          localUserDeptMap.get(u.department)!.push(userInfo);
        }

        const parts = (u.department || '').split('/').filter(Boolean);
        if (parts.length === 0) continue;
        let currentPath = '';
        let parentPath: string | null = null;
        for (let i = 0; i < parts.length; i++) {
          const seg = parts[i];
          currentPath = currentPath ? currentPath + '/' + seg : seg;
          if (!allNodes.has(currentPath)) {
            const node: LocalDeptNode = { key: currentPath, title: seg, path: currentPath, userCount: 0, leaderName: null, children: [] };
            allNodes.set(currentPath, node);
            if (parentPath === null) rootMap.set(currentPath, node);
            else { const p = allNodes.get(parentPath); if (p) p.children.push(node); }
          }
          const node = allNodes.get(currentPath)!;
          if (i === parts.length - 1) {
            node.userCount++;
            if (userInfo.is_leader && !node.leaderName) node.leaderName = u.name;
          }
          parentPath = currentPath;
        }
      }

      const buildFromLocal = (nodes: LocalDeptNode[]): any[] =>
        nodes.map(n => ({
          key: n.path,
          title: n.title + (n.userCount > 0 ? ` (${n.userCount})` : ''),
          name: n.title,
          path: n.path,
          userCount: n.userCount,
          leaderName: n.leaderName,
          children: n.children.length > 0 ? buildFromLocal(n.children.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))) : undefined
        })).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));

      treeData = buildFromLocal(Array.from(rootMap.values()));

      localUserDeptMap.forEach((list, path) => { deptUsersMap[path] = list; });
    }

    return res.json(createSuccessResponse({ tree: treeData, deptUsers: deptUsersMap }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/all', authMiddleware, (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const roleLabels = getRoleLabels();
    const users = db.prepare(`
      SELECT id, username, name, email, phone, department, role, job_title, avatar, feishu_user_id, feishu_open_id
      FROM users WHERE status = 'active'
      ORDER BY department, name
    `).all() as any[];
    const list = users.map(u => ({
      ...u,
      display_name: extractChineseDisplayName(u.name || ''),
      role_label: roleLabels[u.role] || u.role
    }));
    return res.json(createSuccessResponse(list));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.get('/roles/list', authMiddleware, (_req: Request, res: Response) => {
  try {
    const roles = getAllRoles();
    return res.json(createSuccessResponse(roles));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.put('/:id/role', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json(createErrorResponse('请选择角色'));
    }

    const roleExists = getRoleByCode(role);
    if (!roleExists) {
      return res.status(400).json(createErrorResponse('角色不存在'));
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json(createErrorResponse('用户不存在'));
    }

    db.prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\', \'+8 hours\') WHERE id = ?').run(role, id);
    return res.json(createSuccessResponse({ message: '角色更新成功' }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

router.post('/batch-role', authMiddleware, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { userIds, role } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json(createErrorResponse('请选择要操作的用户'));
    }
    if (!role) {
      return res.status(400).json(createErrorResponse('请选择角色'));
    }

    const roleExists = getRoleByCode(role);
    if (!roleExists) {
      return res.status(400).json(createErrorResponse('角色不存在'));
    }

    const placeholders = userIds.map(() => '?').join(',');
    const result = db.prepare(
      `UPDATE users SET role = ?, updated_at = datetime('now', '+8 hours') WHERE id IN (${placeholders})`
    ).run(role, ...userIds);

    return res.json(createSuccessResponse({ message: `成功更新${result.changes}个用户的角色` }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message));
  }
});

export default router;
