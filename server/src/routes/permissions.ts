import express, { Request, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { authMiddleware, requireRole } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse } from '../utils/export';
import {
  getAllPermissionModules,
  getAllRolesWithPermissions,
  getAllRoles,
  getRoleByCode,
  createRole,
  updateRole,
  deleteRole,
  saveRolePermissions,
  getUserPermissions,
  exportRolePermissions,
  bulkImportRolePermissions,
  syncRolesFromFeishu,
  BUILTIN_ROLES
} from '../utils/permissions';
import { getDb } from '../db/database';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/modules', authMiddleware, (req: Request, res: Response) => {
  try {
    const modules = getAllPermissionModules();
    return res.json(createSuccessResponse(modules));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取权限模块失败'));
  }
});

router.get('/roles', authMiddleware, (req: Request, res: Response) => {
  try {
    const roles = getAllRoles();
    return res.json(createSuccessResponse(roles));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取角色列表失败'));
  }
});

router.post('/roles', authMiddleware, requireRole('admin', 'super_admin'), (req: Request, res: Response) => {
  try {
    const { code, name, description, dept_id, dept_name, sort_order } = req.body;
    if (!code || !name) {
      return res.status(400).json(createErrorResponse('角色编码和名称必填'));
    }
    const role = createRole({ code, name, description, dept_id, dept_name, sort_order });
    const modules = getAllPermissionModules();
    const insertPerm = getDb().prepare(`
      INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
      VALUES (?, ?, 1, 0, 0, 0)
    `);
    modules.filter(m => ['dashboard'].includes(m.code)).forEach(m => {
      insertPerm.run(role.code, m.code);
    });
    return res.json(createSuccessResponse(role, '角色创建成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '创建角色失败'));
  }
});

router.put('/roles/:code', authMiddleware, requireRole('admin', 'super_admin'), (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const role = updateRole(code, req.body);
    return res.json(createSuccessResponse(role, '角色更新成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '更新角色失败'));
  }
});

router.delete('/roles/:code', authMiddleware, requireRole('admin', 'super_admin'), (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    if (BUILTIN_ROLES.includes(code)) {
      return res.status(400).json(createErrorResponse('内置角色不可删除'));
    }
    deleteRole(code);
    return res.json(createSuccessResponse(null, '角色删除成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '删除角色失败'));
  }
});

router.post('/sync-feishu-roles', authMiddleware, requireRole('admin', 'super_admin'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const users = db.prepare("SELECT job_title, department as department_name FROM users WHERE status='active' AND job_title IS NOT NULL AND job_title != ''").all() as any[];
    const result = syncRolesFromFeishu(users);
    return res.json(createSuccessResponse(result, `同步完成，新增${result.added}个角色`));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '同步飞书角色失败'));
  }
});

router.get('/all', authMiddleware, requireRole('admin', 'super_admin'), (req: Request, res: Response) => {
  try {
    const modules = getAllPermissionModules();
    const rolesWithPerms = getAllRolesWithPermissions();
    return res.json(createSuccessResponse({
      modules,
      roles: rolesWithPerms
    }));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取权限配置失败'));
  }
});

router.get('/my', authMiddleware, (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    const userPerms = getUserPermissions(role);
    return res.json(createSuccessResponse(userPerms));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '获取我的权限失败'));
  }
});

router.post('/save/:roleCode', authMiddleware, requireRole('admin', 'super_admin'), (req: Request, res: Response) => {
  try {
    const { roleCode } = req.params;
    const { permissions } = req.body;

    if (!roleCode || !Array.isArray(permissions)) {
      return res.status(400).json(createErrorResponse('参数错误'));
    }

    const role = getRoleByCode(roleCode);
    if (!role) {
      return res.status(400).json(createErrorResponse('无效的角色'));
    }

    saveRolePermissions(roleCode, permissions);
    return res.json(createSuccessResponse(null, '权限保存成功'));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '保存权限失败'));
  }
});

router.get('/template', authMiddleware, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('权限配置模板');

    ws.columns = [
      { header: '角色编码(role_code)', key: 'role_code', width: 25 },
      { header: '角色名称(role_name)', key: 'role_name', width: 20 },
      { header: '模块编码(module_code)', key: 'module_code', width: 25 },
      { header: '模块名称(module_name)', key: 'module_name', width: 20 },
      { header: '查看(can_view, 1=是 0=否)', key: 'can_view', width: 18 },
      { header: '编辑(can_edit, 1=是 0=否)', key: 'can_edit', width: 18 },
      { header: '删除(can_delete, 1=是 0=否)', key: 'can_delete', width: 18 },
      { header: '审批(can_approve, 1=是 0=否)', key: 'can_approve', width: 18 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F7FF' }
    };

    const modules = getAllPermissionModules();
    const exampleData = exportRolePermissions().slice(0, modules.length);
    exampleData.forEach(row => {
      ws.addRow(row);
    });

    ws.addRow([]);
    ws.addRow(['说明：', '', '', '', '', '', '', '']);
    ws.addRow(['1. role_code为角色唯一标识，新增角色请确保编码唯一', '', '', '', '', '', '', '']);
    ws.addRow(['2. module_code为系统模块编码，请勿修改', '', '', '', '', '', '', '']);
    ws.addRow(['3. can_view/can_edit/can_delete/can_approve填1或0，1表示有权限，0表示无', '', '', '', '', '', '', '']);
    ws.addRow(['4. 未配置的模块默认无权限', '', '', '', '', '', '', '']);
    ws.addRow(['5. 超级管理员(super_admin)和系统管理员(admin)为内置管理员角色，无需配置', '', '', '', '', '', '', '']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=permission_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '下载模板失败'));
  }
});

router.get('/export', authMiddleware, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('权限配置');

    ws.columns = [
      { header: '角色编码(role_code)', key: 'role_code', width: 25 },
      { header: '角色名称(role_name)', key: 'role_name', width: 20 },
      { header: '模块编码(module_code)', key: 'module_code', width: 25 },
      { header: '模块名称(module_name)', key: 'module_name', width: 20 },
      { header: '查看(can_view)', key: 'can_view', width: 12 },
      { header: '编辑(can_edit)', key: 'can_edit', width: 12 },
      { header: '删除(can_delete)', key: 'can_delete', width: 12 },
      { header: '审批(can_approve)', key: 'can_approve', width: 12 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F7FF' }
    };

    const data = exportRolePermissions();
    data.forEach(row => {
      ws.addRow(row);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=permissions_export_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '导出权限失败'));
  }
});

router.post('/import', authMiddleware, requireRole('admin', 'super_admin'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json(createErrorResponse('请上传文件'));
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as any);
    const ws = workbook.worksheets[0];
    if (!ws) {
      return res.status(400).json(createErrorResponse('无效的Excel文件'));
    }

    const importData: Array<{
      role_code: string;
      role_name?: string;
      module_code: string;
      can_view: number;
      can_edit: number;
      can_delete: number;
      can_approve: number;
    }> = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as any[];
      const role_code = String(values[1] || '').trim();
      const role_name = String(values[2] || '').trim();
      const module_code = String(values[3] || '').trim();
      
      if (!role_code || !module_code || role_code.startsWith('说明')) return;
      
      const can_view = Number(values[5]) || 0;
      const can_edit = Number(values[6]) || 0;
      const can_delete = Number(values[7]) || 0;
      const can_approve = Number(values[8]) || 0;

      if (role_code && module_code) {
        importData.push({
          role_code,
          role_name: role_name || undefined,
          module_code,
          can_view,
          can_edit,
          can_delete,
          can_approve
        });
      }
    });

    if (importData.length === 0) {
      return res.status(400).json(createErrorResponse('未找到有效数据'));
    }

    const result = bulkImportRolePermissions(importData);
    return res.json(createSuccessResponse(result, `导入成功，共导入${result.imported}条权限记录，新建${result.roles_created.length}个角色`));
  } catch (err: any) {
    return res.status(500).json(createErrorResponse(err.message || '导入权限失败'));
  }
});

export default router;
