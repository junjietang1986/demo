import { getDb } from '../db/database';

export interface Role {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: number;
  is_builtin: number;
  dept_id: string | null;
  dept_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionModule {
  id: number;
  code: string;
  name: string;
  parent_code: string | null;
  icon: string | null;
  path: string | null;
  sort_order: number;
  is_menu: number;
}

export interface RolePermission {
  id: number;
  role_code: string;
  module_code: string;
  can_view: number;
  can_edit: number;
  can_delete: number;
  can_approve: number;
}

export interface UserPermissions {
  role: string;
  role_name: string;
  permissions: Record<string, {
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_approve: boolean;
  }>;
  menuTree: any[];
}

export const BUILTIN_ROLES = ['super_admin', 'admin', 'user'];

export function getAllRoles(): Role[] {
  const db = getDb();
  return db.prepare('SELECT * FROM roles ORDER BY sort_order ASC, id ASC').all() as Role[];
}

export function getRoleByCode(code: string): Role | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM roles WHERE code = ?').get(code) as Role | undefined;
}

export function createRole(data: {
  code: string;
  name: string;
  description?: string;
  dept_id?: string;
  dept_name?: string;
  sort_order?: number;
}): Role {
  const db = getDb();
  const existing = getRoleByCode(data.code);
  if (existing) {
    throw new Error(`角色编码 ${data.code} 已存在`);
  }
  const stmt = db.prepare(`
    INSERT INTO roles (code, name, description, is_system, is_builtin, dept_id, dept_name, sort_order)
    VALUES (?, ?, ?, 0, 0, ?, ?, ?)
  `);
  const info = stmt.run(
    data.code,
    data.name,
    data.description || null,
    data.dept_id || null,
    data.dept_name || null,
    data.sort_order || 50
  );
  return db.prepare('SELECT * FROM roles WHERE id = ?').get(info.lastInsertRowid) as Role;
}

export function updateRole(code: string, data: Partial<{
  name: string;
  description: string;
  dept_id: string;
  dept_name: string;
  sort_order: number;
}>): Role {
  const db = getDb();
  const role = getRoleByCode(code);
  if (!role) throw new Error('角色不存在');
  if (role.is_builtin) throw new Error('内置角色不可修改');
  
  const fields: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.dept_id !== undefined) { fields.push('dept_id = ?'); values.push(data.dept_id); }
  if (data.dept_name !== undefined) { fields.push('dept_name = ?'); values.push(data.dept_name); }
  if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order); }
  fields.push('updated_at = CURRENT_TIMESTAMP');
  
  if (fields.length > 0) {
    values.push(code);
    db.prepare(`UPDATE roles SET ${fields.join(', ')} WHERE code = ?`).run(...values);
  }
  return getRoleByCode(code)!;
}

export function deleteRole(code: string): void {
  const db = getDb();
  const role = getRoleByCode(code);
  if (!role) return;
  if (role.is_builtin) throw new Error('内置角色不可删除');
  
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM role_permissions WHERE role_code = ?').run(code);
    db.prepare('DELETE FROM roles WHERE code = ?').run(code);
  });
  tx();
}

export function syncRolesFromFeishu(users: { job_title: string; department_name?: string }[]): { added: number; roles: Role[] } {
  const db = getDb();
  const existingRoles = getAllRoles();
  const existingCodes = new Set(existingRoles.map(r => r.code));
  const added: Role[] = [];
  
  const jobTitles = new Map<string, { name: string; dept?: string }>();
  users.forEach(u => {
    if (u.job_title && u.job_title.trim()) {
      const code = 'role_' + u.job_title.trim()
        .replace(/[^\w\u4e00-\u9fa5]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
      if (!existingCodes.has(code) && !jobTitles.has(code)) {
        jobTitles.set(code, { name: u.job_title.trim(), dept: u.department_name });
      }
    }
  });
  
  let order = 60;
  jobTitles.forEach((v, code) => {
    const stmt = db.prepare(`
      INSERT INTO roles (code, name, description, is_system, is_builtin, dept_name, sort_order)
      VALUES (?, ?, ?, 0, 0, ?, ?)
    `);
    stmt.run(code, v.name, `从飞书同步的${v.name}岗位角色`, v.dept || null, order++);
    const newRole = getRoleByCode(code);
    if (newRole) {
      added.push(newRole);
      existingCodes.add(code);
      const modules = getAllPermissionModules();
      const insertPerm = db.prepare(`
        INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
        VALUES (?, ?, 1, 0, 0, 0)
      `);
      modules.filter(m => !m.parent_code || ['dashboard'].includes(m.code)).forEach(m => {
        insertPerm.run(code, m.code);
      });
    }
  });
  
  return { added: added.length, roles: added };
}

export function getAllPermissionModules(): PermissionModule[] {
  const db = getDb();
  return db.prepare('SELECT * FROM permission_modules ORDER BY sort_order ASC').all() as PermissionModule[];
}

export function getRolePermissions(roleCode: string): RolePermission[] {
  const db = getDb();
  return db.prepare('SELECT * FROM role_permissions WHERE role_code = ?').all(roleCode) as RolePermission[];
}

export function getAllRolesWithPermissions(): { code: string; name: string; description: string | null; is_builtin: number; is_system: number; permissions: RolePermission[] }[] {
  const roles = getAllRoles();
  return roles.map(r => ({
    code: r.code,
    name: r.name,
    description: r.description,
    is_builtin: r.is_builtin,
    is_system: r.is_system,
    permissions: getRolePermissions(r.code)
  }));
}

export function getUserPermissions(roleCode: string): UserPermissions {
  const role = getRoleByCode(roleCode) || { code: roleCode, name: '普通用户' } as Role;
  const modules = getAllPermissionModules();
  const rolePerms = getRolePermissions(roleCode);
  
  const permMap: Record<string, {
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_approve: boolean;
  }> = {};
  
  rolePerms.forEach(p => {
    permMap[p.module_code] = {
      can_view: !!p.can_view,
      can_edit: !!p.can_edit,
      can_delete: !!p.can_delete,
      can_approve: !!p.can_approve
    };
  });

  const moduleMap: Record<string, PermissionModule> = {};
  modules.forEach(m => { moduleMap[m.code] = m; });

  function hasViewPermission(code: string): boolean {
    if (roleCode === 'admin' || roleCode === 'super_admin') return true;
    return permMap[code]?.can_view ?? false;
  }

  function buildMenuTree(parentCode: string | null = null): any[] {
    return modules
      .filter(m => m.parent_code === parentCode && m.is_menu === 1)
      .filter(m => hasViewPermission(m.code))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(m => {
        const children = buildMenuTree(m.code);
        return {
          key: m.path || m.code,
          code: m.code,
          label: m.name,
          icon: m.icon,
          path: m.path,
          children: children.length > 0 ? children : undefined
        };
      });
  }

  const menuTree = buildMenuTree(null);

  return {
    role: roleCode,
    role_name: role.name,
    permissions: permMap,
    menuTree
  };
}

export function saveRolePermissions(roleCode: string, permissions: {
  module_code: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}[]): void {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM role_permissions WHERE role_code = ?');
  const insertStmt = db.prepare(`
    INSERT INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(roleCode);
    permissions.forEach(p => {
      insertStmt.run(
        roleCode,
        p.module_code,
        p.can_view ? 1 : 0,
        p.can_edit ? 1 : 0,
        p.can_delete ? 1 : 0,
        p.can_approve ? 1 : 0
      );
    });
  });

  tx();
}

export function bulkImportRolePermissions(importData: Array<{
  role_code: string;
  role_name?: string;
  module_code: string;
  can_view?: boolean | number;
  can_edit?: boolean | number;
  can_delete?: boolean | number;
  can_approve?: boolean | number;
}>): { imported: number; roles_created: string[] } {
  const db = getDb();
  const modules = getAllPermissionModules();
  const validModuleCodes = new Set(modules.map(m => m.code));
  const createdRoles: string[] = [];
  
  const grouped = new Map<string, Array<{
    module_code: string;
    can_view: number;
    can_edit: number;
    can_delete: number;
    can_approve: number;
  }>>();
  
  importData.forEach(row => {
    if (!row.role_code || !row.module_code) return;
    if (!validModuleCodes.has(row.module_code)) return;
    
    if (!getRoleByCode(row.role_code)) {
      const name = row.role_name || row.role_code;
      try {
        createRole({ code: row.role_code, name, description: '批量导入创建的角色' });
        createdRoles.push(row.role_code);
      } catch (e) {}
    }
    
    if (!grouped.has(row.role_code)) grouped.set(row.role_code, []);
    grouped.get(row.role_code)!.push({
      module_code: row.module_code,
      can_view: row.can_view ? 1 : 0,
      can_edit: row.can_edit ? 1 : 0,
      can_delete: row.can_delete ? 1 : 0,
      can_approve: row.can_approve ? 1 : 0
    });
  });
  
  let imported = 0;
  grouped.forEach((perms, roleCode) => {
    const deleteStmt = db.prepare('DELETE FROM role_permissions WHERE role_code = ?');
    const insertStmt = db.prepare(`
      INSERT INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const tx = db.transaction(() => {
      deleteStmt.run(roleCode);
      perms.forEach(p => {
        insertStmt.run(roleCode, p.module_code, p.can_view, p.can_edit, p.can_delete, p.can_approve);
        imported++;
      });
    });
    tx();
  });
  
  return { imported, roles_created: createdRoles };
}

export function exportRolePermissions(): Array<{
  role_code: string;
  role_name: string;
  module_code: string;
  module_name: string;
  can_view: number;
  can_edit: number;
  can_delete: number;
  can_approve: number;
}> {
  const roles = getAllRoles();
  const modules = getAllPermissionModules();
  const moduleMap = new Map(modules.map(m => [m.code, m.name]));
  const result: Array<{
    role_code: string;
    role_name: string;
    module_code: string;
    module_name: string;
    can_view: number;
    can_edit: number;
    can_delete: number;
    can_approve: number;
  }> = [];
  
  roles.forEach(role => {
    const perms = getRolePermissions(role.code);
    const permMap = new Map(perms.map(p => [p.module_code, p]));
    modules.forEach(m => {
      const p = permMap.get(m.code);
      result.push({
        role_code: role.code,
        role_name: role.name,
        module_code: m.code,
        module_name: m.name,
        can_view: p?.can_view ?? 0,
        can_edit: p?.can_edit ?? 0,
        can_delete: p?.can_delete ?? 0,
        can_approve: p?.can_approve ?? 0
      });
    });
  });
  
  return result;
}

export function checkPermission(roleCode: string, moduleCode: string, action: 'view' | 'edit' | 'delete' | 'approve'): boolean {
  if (roleCode === 'admin' || roleCode === 'super_admin') return true;
  const perms = getRolePermissions(roleCode);
  const perm = perms.find(p => p.module_code === moduleCode);
  if (!perm) return false;
  switch (action) {
    case 'view': return !!perm.can_view;
    case 'edit': return !!perm.can_edit;
    case 'delete': return !!perm.can_delete;
    case 'approve': return !!perm.can_approve;
    default: return false;
  }
}
