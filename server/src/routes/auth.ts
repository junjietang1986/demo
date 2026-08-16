import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { getDb } from '../db/database';
import { authMiddleware, generateToken } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import { getUserPermissions } from '../utils/permissions';

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

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json(createErrorResponse('用户名和密码不能为空'));
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND status = ?').get(username, 'active') as any;

    if (!user) {
      return res.status(401).json(createErrorResponse('用户名或密码错误'));
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json(createErrorResponse('用户名或密码错误'));
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      department: user.department
    });

    const { password: _, ...userInfo } = user;
    const permissions = getUserPermissions(user.role);
    return res.json(createSuccessResponse({ token, user: userInfo, permissions }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '登录失败'));
  }
});

router.post('/register', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json(createErrorResponse('权限不足，仅管理员可创建用户'));
    }

    const { username, password, name, email, phone, department, role } = req.body;
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
      'INSERT INTO users (username, password, name, email, phone, department, role) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(username, hashedPassword, name, email || null, phone || null, department || null, role || 'user');

    const newUser = db.prepare('SELECT id, username, name, email, phone, department, role, status, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    return res.json(createSuccessResponse(newUser, '用户创建成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '注册失败'));
  }
});

router.get('/me', authMiddleware, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, name, email, phone, department, role, job_title, feishu_user_id, feishu_open_id, avatar, status, created_at, updated_at FROM users WHERE id = ?'
    ).get(req.user!.id) as any;

    if (!user) {
      return res.status(404).json(createErrorResponse('用户不存在'));
    }

    const permissions = getUserPermissions(user.role);
    return res.json(createSuccessResponse({ user, permissions }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取用户信息失败'));
  }
});

router.post('/feishu', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json(createErrorResponse('缺少code参数'));
    }

    return res.json(createSuccessResponse({
      message: '飞书OAuth登录（待实现）',
      code,
      mock: true
    }, '飞书登录回调已接收（stub模式）'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '飞书登录失败'));
  }
});

export default router;
