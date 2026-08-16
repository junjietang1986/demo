import { getDb } from '../db/database';

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

const SYNC_ROOT_DEPT_ID = '164';
const SYNC_ROOT_DEPT_NAME = '工程技术中心';

interface FeishuTokenCache {
  token: string;
  expireAt: number;
}

let tokenCache: FeishuTokenCache | null = null;

export interface FeishuDepartment {
  department_id: string;
  name: string;
  parent_department_id: string;
  open_department_id: string;
  leader_user_id?: string;
  member_count?: number;
  order?: string;
}

export interface FeishuUser {
  user_id: string;
  open_id: string;
  name: string;
  en_name?: string;
  email?: string;
  mobile?: string;
  department_ids: string[];
  leader_user_id?: string;
  city?: string;
  job_title?: string;
  work_station?: string;
  is_activated: boolean;
  avatar_url?: string;
  status?: any;
  primary_dept_id?: string;
  primary_dept_name?: string;
  dept_path?: string;
  assigned_role?: string;
}

function getSyncRootDeptConfig(): { dept_id: string; dept_name: string } {
  try {
    const db = getDb();
    const configured = db.prepare("SELECT value FROM system_configs WHERE key = 'feishu_sync_root_dept_id'").get() as any;
    const configuredName = db.prepare("SELECT value FROM system_configs WHERE key = 'feishu_sync_root_dept_name'").get() as any;
    return {
      dept_id: configured?.value || SYNC_ROOT_DEPT_ID,
      dept_name: configuredName?.value || SYNC_ROOT_DEPT_NAME
    };
  } catch (_) {
    return { dept_id: SYNC_ROOT_DEPT_ID, dept_name: SYNC_ROOT_DEPT_NAME };
  }
}

function determineRoleByDeptAndTitle(deptName: string, jobTitle: string, isDeptLeader: boolean): string {
  if (isDeptLeader) return 'dept_manager';

  const title = (jobTitle || '').toLowerCase();
  const dept = (deptName || '');

  if (title.includes('项目经理') || title.includes('项目主管') || title.includes('project manager')) {
    return 'project_manager';
  }

  if (dept.includes('质量') || title.includes('质量工程师') || title.includes('qa') || title.includes('qe') || title.includes('质量')) {
    return 'qa_engineer';
  }

  if (dept.includes('综合管理') || title.includes('文控') || title.includes('文档') || title.includes('doc')) {
    return 'doc_controller';
  }

  return 'user';
}

function getFeishuConfig(): { app_id: string; app_secret: string } | null {
  const db = getDb();
  const config = db.prepare("SELECT key, value FROM system_configs WHERE key LIKE 'feishu_%'").all() as any[];
  const map: Record<string, string> = {};
  config.forEach(c => { map[c.key] = c.value; });
  const app_id = map.feishu_app_id || process.env.FEISHU_APP_ID || '';
  const app_secret = map.feishu_app_secret || process.env.FEISHU_APP_SECRET || '';
  if (!app_id || !app_secret) return null;
  return { app_id, app_secret };
}

async function getTenantAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expireAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  const config = getFeishuConfig();
  if (!config) {
    throw new Error('飞书应用未配置，请先在系统设置中配置 App ID 和 App Secret');
  }

  const resp = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: config.app_id,
      app_secret: config.app_secret
    })
  });

  const data = await resp.json() as any;
  if (data.code !== 0) {
    throw new Error(`获取飞书Token失败: ${data.msg || data.message || '未知错误'}`);
  }

  tokenCache = {
    token: data.tenant_access_token,
    expireAt: Date.now() + (data.expire || 7200) * 1000
  };

  return tokenCache.token;
}

export function isFeishuConfigured(): boolean {
  return getFeishuConfig() !== null;
}

async function feishuFetch<T = any>(path: string, method = 'GET', body?: any, params?: Record<string, any>): Promise<T> {
  const token = await getTenantAccessToken();
  let url = `${FEISHU_BASE_URL}${path}`;
  if (params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') search.append(k, String(v));
    });
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const resp = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await resp.json() as any;
  if (data.code !== 0) {
    throw new Error(`飞书API错误(${path}): ${data.msg || data.message || '未知错误'}`);
  }
  return data.data as T;
}

async function getChildDepartments(
  parentDepartmentId: string,
  departmentIdType: 'department_id' | 'open_department_id',
  parentName?: string
): Promise<{ depts: FeishuDepartment[]; pathMap: Map<string, string>; leaderMap: Map<string, string[]> }> {
  const depts: FeishuDepartment[] = [];
  const pathMap = new Map<string, string>();
  const leaderMap = new Map<string, string[]>();
  let pageToken: string | undefined;
  const pageSize = 50;

  do {
    const data: any = await feishuFetch('/contact/v3/departments', 'GET', undefined, {
      department_id_type: departmentIdType,
      parent_department_id: parentDepartmentId,
      page_size: pageSize,
      page_token: pageToken
    });
    if (data?.items) {
      for (const item of data.items) {
        const dept: FeishuDepartment = {
          department_id: String(item.department_id || item.open_department_id),
          open_department_id: item.open_department_id || String(item.department_id),
          name: item.name || '',
          parent_department_id: String(item.parent_department_id || parentDepartmentId),
          leader_user_id: item.leader_user_id,
          member_count: item.member_count,
          order: item.order
        };
        depts.push(dept);
        const childDeptId = departmentIdType === 'open_department_id' ? dept.open_department_id : dept.department_id;

        const deptPath = parentName ? `${parentName}/${dept.name}` : dept.name;
        pathMap.set(dept.department_id, deptPath);
        if (dept.open_department_id) pathMap.set(dept.open_department_id, deptPath);

        if (dept.leader_user_id) {
          leaderMap.set(dept.department_id, [dept.leader_user_id]);
        }

        if (childDeptId && childDeptId !== '0') {
          try {
            const children = await getChildDepartments(childDeptId, departmentIdType, deptPath);
            depts.push(...children.depts);
            children.pathMap.forEach((v, k) => pathMap.set(k, v));
            children.leaderMap.forEach((v, k) => {
              const existing = leaderMap.get(k) || [];
              leaderMap.set(k, [...existing, ...v]);
            });
            if (dept.leader_user_id) {
              const childLeaders = leaderMap.get(dept.department_id) || [];
              if (!childLeaders.includes(dept.leader_user_id)) {
                leaderMap.set(dept.department_id, [...childLeaders, dept.leader_user_id]);
              }
            }
          } catch (e: any) {
            console.log(`[飞书API] 获取子部门 ${dept.name}(${childDeptId}) 失败:`, e.message);
          }
        }
      }
    }
    pageToken = data?.page_token;
    if (!data?.has_more) break;
  } while (pageToken);

  return { depts, pathMap, leaderMap };
}

export async function getDepartmentList(departmentIdType: 'department_id' | 'open_department_id' = 'department_id'): Promise<FeishuDepartment[]> {
  const result = await getChildDepartments('0', departmentIdType);
  return result.depts;
}

async function getSyncScopeDepartments(): Promise<{
  depts: FeishuDepartment[];
  deptPathMap: Map<string, string>;
  deptNameMap: Map<string, string>;
  deptLeaderMap: Map<string, string[]>;
  rootDept: FeishuDepartment;
}> {
  const { dept_id: rootDeptId, dept_name: rootDeptName } = getSyncRootDeptConfig();

  console.log(`[飞书同步] 同步范围: ${rootDeptName} (dept_id=${rootDeptId})`);

  const rootDeptInfo: any = await feishuFetch(`/contact/v3/departments/${rootDeptId}`, 'GET', undefined, {
    department_id_type: 'department_id'
  });

  const rootDept: FeishuDepartment = {
    department_id: rootDeptId,
    open_department_id: rootDeptInfo?.department?.open_department_id || '',
    name: rootDeptInfo?.department?.name || rootDeptName,
    parent_department_id: '0',
    leader_user_id: rootDeptInfo?.department?.leader_user_id
  };

  const { depts: childDepts, pathMap, leaderMap } = await getChildDepartments(rootDeptId, 'department_id', rootDept.name);

  const allDepts = [rootDept, ...childDepts];
  const deptNameMap = new Map<string, string>();
  const deptPathMap = new Map<string, string>();

  allDepts.forEach(d => {
    if (d.department_id) deptNameMap.set(d.department_id, d.name);
    if (d.open_department_id) deptNameMap.set(d.open_department_id, d.name);
  });

  deptPathMap.set(rootDeptId, rootDept.name);
  if (rootDept.open_department_id) deptPathMap.set(rootDept.open_department_id, rootDept.name);
  pathMap.forEach((v, k) => deptPathMap.set(k, v));

  const deptLeaderMap = new Map<string, string[]>();
  if (rootDept.leader_user_id) {
    deptLeaderMap.set(rootDeptId, [rootDept.leader_user_id]);
  }
  leaderMap.forEach((v, k) => {
    const existing = deptLeaderMap.get(k) || [];
    v.forEach(leader => {
      if (!existing.includes(leader)) existing.push(leader);
    });
    deptLeaderMap.set(k, existing);
  });

  console.log(`[飞书同步] 工程技术中心组织架构共 ${allDepts.length} 个部门`);

  return { depts: allDepts, deptPathMap, deptNameMap, deptLeaderMap, rootDept };
}

export async function getDepartmentUsers(
  departmentId: string,
  departmentIdType: 'department_id' | 'open_department_id' = 'department_id',
  userIdType: 'user_id' | 'open_id' = 'open_id'
): Promise<FeishuUser[]> {
  const all: FeishuUser[] = [];
  let pageToken: string | undefined;
  const pageSize = 50;

  do {
    const data: any = await feishuFetch('/contact/v3/users/find_by_department', 'GET', undefined, {
      department_id_type: departmentIdType,
      department_id: departmentId,
      user_id_type: userIdType,
      page_size: pageSize,
      page_token: pageToken,
      field: 'department_ids,open_id,user_id,name,email,mobile,job_title,work_station,leader_user_id,avatar,is_activated,status,city'
    });
    if (data?.items) {
      all.push(...data.items.map((item: any) => mapFeishuUser(item, userIdType)));
    }
    pageToken = data?.page_token;
    if (!data?.has_more) break;
  } while (pageToken);

  return all;
}

function mapFeishuUser(item: any, userIdType: 'user_id' | 'open_id' = 'open_id'): FeishuUser {
  const primaryId = userIdType === 'open_id' ? (item.open_id || item.user_id) : (item.user_id || item.open_id);
  return {
    user_id: primaryId,
    open_id: item.open_id || primaryId,
    name: item.name || '',
    en_name: item.en_name,
    email: item.email,
    mobile: item.mobile,
    department_ids: item.department_ids || [],
    leader_user_id: item.leader_user_id,
    city: item.city,
    job_title: item.job_title,
    work_station: item.work_station,
    is_activated: item.status ? (item.status.is_activated !== false) : (item.is_activated !== false),
    avatar_url: item.avatar?.avatar_72 || item.avatar?.avatar_url,
    status: item.status
  };
}

export async function getAllUsers(
  userIdType: 'user_id' | 'open_id' = 'open_id'
): Promise<FeishuUser[]> {
  const userMap = new Map<string, FeishuUser>();
  const userDeptIdsMap = new Map<string, Set<string>>();

  const { depts: syncDepts, deptPathMap, deptNameMap, deptLeaderMap, rootDept } = await getSyncScopeDepartments();

  const syncDeptIds = new Set(syncDepts.map(d => d.department_id));
  const allLeaders = new Set<string>();
  deptLeaderMap.forEach(leaders => leaders.forEach(l => allLeaders.add(l)));

  function collectUsers(users: FeishuUser[], deptId: string) {
    users.forEach(u => {
      if (!userDeptIdsMap.has(u.user_id)) {
        userDeptIdsMap.set(u.user_id, new Set());
      }
      userDeptIdsMap.get(u.user_id)!.add(deptId);
      if (u.open_id) userDeptIdsMap.get(u.user_id)!.add(u.open_id);
      if (!userMap.has(u.user_id)) {
        userMap.set(u.user_id, u);
      }
    });
  }

  console.log(`[飞书同步] 开始获取${rootDept.name}根部门用户...`);
  try {
    const rootUsers = await getDepartmentUsers(rootDept.department_id, 'department_id', userIdType);
    console.log(`[飞书同步] ${rootDept.name}根部门获取到 ${rootUsers.length} 个用户`);
    collectUsers(rootUsers, rootDept.department_id);
  } catch (e: any) {
    console.error(`[飞书同步] 获取${rootDept.name}根部门用户失败:`, e.message);
  }

  const childDeptIds = syncDepts.filter(d => d.department_id !== rootDept.department_id).map(d => d.department_id);
  console.log(`[飞书同步] 开始批量获取 ${childDeptIds.length} 个子部门的用户（并发数: 10）...`);

  const batchSize = 10;
  let processedCount = 0;
  let deptsWithUsers = 0;

  for (let i = 0; i < childDeptIds.length; i += batchSize) {
    const batch = childDeptIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(deptId => getDepartmentUsers(deptId, 'department_id', userIdType))
    );

    results.forEach((result, idx) => {
      const deptId = batch[idx];
      const deptName = deptNameMap.get(deptId) || deptId;
      if (result.status === 'fulfilled') {
        const users = result.value;
        if (users.length > 0) {
          deptsWithUsers++;
          console.log(`[飞书同步] 部门[${deptName}]获取到 ${users.length} 个用户`);
          collectUsers(users, deptId);
        }
      } else {
        console.error(`[飞书同步] 获取部门[${deptName}]用户失败:`, result.reason?.message || result.reason);
      }
    });

    processedCount += batch.length;
    if (processedCount % 10 === 0 || processedCount === childDeptIds.length) {
      console.log(`[飞书同步] 进度: ${processedCount}/${childDeptIds.length} 个子部门已处理，当前共 ${userMap.size} 个用户`);
    }
  }

  const users = Array.from(userMap.values());
  console.log(`[飞书同步] 共获取到 ${users.length} 个不重复用户（来自 ${deptsWithUsers} 个有用户的部门）`);

  const enrichedUsers = users.map(u => {
    const collectedDeptIds = userDeptIdsMap.get(u.user_id) || new Set<string>();
    let allDeptIds: string[] = [];
    try {
      const apiDeptIds = (u.department_ids || []).map(String);
      const combined = new Set<string>([...collectedDeptIds, ...apiDeptIds]);
      allDeptIds = Array.from(combined).filter(id => syncDeptIds.has(id) || deptNameMap.has(id) || id.startsWith('od-'));
    } catch (_) {
      allDeptIds = Array.from(collectedDeptIds);
    }

    let primaryDeptId = '';
    let primaryDeptName = '';
    let primaryDeptPath = '';

    for (const did of allDeptIds) {
      let checkId = did;
      if (did.startsWith('od-')) {
        for (const [k, v] of deptPathMap.entries()) {
          if (k === did) { checkId = k; break; }
        }
      }
      if (syncDeptIds.has(checkId) || deptNameMap.has(checkId)) {
        primaryDeptId = checkId;
        primaryDeptName = deptNameMap.get(checkId) || '';
        primaryDeptPath = deptPathMap.get(checkId) || primaryDeptName;
        if (primaryDeptId !== rootDept.department_id) break;
      }
    }

    if (!primaryDeptName) {
      for (const did of allDeptIds) {
        const resolvedPath = deptPathMap.get(did) || (deptPathMap as any)[did];
        if (resolvedPath) {
          primaryDeptId = did;
          primaryDeptPath = resolvedPath;
          primaryDeptName = resolvedPath.split('/').pop() || '';
          break;
        }
      }
    }

    if (!primaryDeptName) {
      primaryDeptId = rootDept.department_id;
      primaryDeptName = rootDept.name;
      primaryDeptPath = rootDept.name;
    }

    const isDeptLeader = allLeaders.has(u.open_id || '') || allLeaders.has(u.user_id);
    const assignedRole = determineRoleByDeptAndTitle(primaryDeptName, u.job_title || '', isDeptLeader);

    return {
      ...u,
      department_ids: allDeptIds,
      primary_dept_id: primaryDeptId,
      primary_dept_name: primaryDeptName,
      dept_path: primaryDeptPath,
      assigned_role: assignedRole
    };
  });

  const usersWithName = enrichedUsers.filter(u => u.name && u.name.trim());
  if (enrichedUsers.length > 0 && usersWithName.length === 0) {
    throw new Error(
      `飞书API返回了${enrichedUsers.length}个用户，但未返回用户姓名等详细信息。\n` +
      `这说明应用身份（tenant_access_token）下的通讯录权限未正确配置。\n\n` +
      `请确认已开通以下应用身份权限并发布了新版本：\n` +
      `   - contact:user.base:readonly（获取用户基本信息）\n` +
      `   - contact:department.base:readonly（获取部门基本信息）\n` +
      `   - contact:contact.base:readonly（获取通讯录基本信息）\n` +
      `   - contact:user.email:readonly（获取用户邮箱）\n` +
      `   - contact:user.phone:readonly（获取用户手机号）\n`
    );
  }

  console.log(`[飞书同步] 用户部门分配样例（前5个）:`);
  usersWithName.slice(0, 5).forEach(u => {
    console.log(`  - ${u.name}: 主部门="${u.dept_path}", 所属部门数=${u.department_ids.length}, 角色=${u.assigned_role}`);
  });

  return usersWithName.length > 0 ? usersWithName : enrichedUsers;
}

export async function getSyncScopeDepartmentTree(): Promise<{ depts: FeishuDepartment[]; rootName: string }> {
  try {
    const { depts, rootDept } = await getSyncScopeDepartments();
    return { depts, rootName: rootDept.name };
  } catch (e: any) {
    console.error('[飞书同步] 获取同步范围部门树失败:', e.message);
    return { depts: [], rootName: SYNC_ROOT_DEPT_NAME };
  }
}

export async function getDepartmentTree(): Promise<any[]> {
  let depts: FeishuDepartment[] = [];
  let rootName = SYNC_ROOT_DEPT_NAME;
  try {
    const result = await getSyncScopeDepartments();
    depts = result.depts;
    rootName = result.rootDept.name;
  } catch (e: any) {
    try {
      depts = await getDepartmentList('department_id');
    } catch (_) {}
  }

  const deptMap = new Map<string, any>();

  depts.forEach(d => {
    const id = d.department_id || d.open_department_id;
    const parentId = d.parent_department_id === '0' || d.department_id === getSyncRootDeptConfig().dept_id ? 'root' : d.parent_department_id;
    deptMap.set(id, {
      ...d,
      key: id,
      title: d.name,
      value: id,
      parentId,
      children: []
    });
  });

  const roots: any[] = [];
  deptMap.forEach(node => {
    if (node.parentId === 'root' || !deptMap.has(node.parentId)) {
      roots.push(node);
    } else {
      const parent = deptMap.get(node.parentId);
      if (parent) parent.children.push(node);
    }
  });

  if (roots.length === 0) {
    return [{
      key: getSyncRootDeptConfig().dept_id,
      title: rootName,
      value: getSyncRootDeptConfig().dept_id,
      children: []
    }];
  }

  return roots;
}

export async function getSyncScopeFullTree(): Promise<{
  tree: any[];
  deptPathMap: Record<string, string>;
  deptIdByPath: Record<string, string>;
  rootDeptId: string;
  rootName: string;
}> {
  const { depts, deptPathMap: mapDp, deptNameMap, rootDept } = await getSyncScopeDepartments();
  const deptPathMap: Record<string, string> = {};
  const deptIdByPath: Record<string, string> = {};
  mapDp.forEach((path, id) => {
    deptPathMap[id] = path;
    if (!deptIdByPath[path]) {
      deptIdByPath[path] = id;
    }
  });

  const childrenMap = new Map<string, any[]>();
  depts.forEach(d => {
    const parentId = d.parent_department_id === '0' ? '__root__' : d.parent_department_id;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(d);
  });

  function buildTree(parentId: string): any[] {
    const children = childrenMap.get(parentId) || [];
    return children.map(d => {
      const path = deptPathMap[d.department_id] || d.name;
      return {
        key: d.department_id,
        dept_id: d.department_id,
        open_department_id: d.open_department_id,
        title: d.name,
        name: d.name,
        path: path,
        leader_user_id: d.leader_user_id,
        children: buildTree(d.department_id)
      };
    });
  }

  const rootChildren = buildTree(rootDept.department_id);
  const tree = [{
    key: rootDept.department_id,
    dept_id: rootDept.department_id,
    open_department_id: rootDept.open_department_id,
    title: rootDept.name,
    name: rootDept.name,
    path: rootDept.name,
    leader_user_id: rootDept.leader_user_id,
    children: rootChildren
  }];

  return { tree, deptPathMap, deptIdByPath, rootDeptId: rootDept.department_id, rootName: rootDept.name };
}

export interface CachedDeptTree {
  tree: any[];
  deptPathMap: Record<string, string>;
  deptIdByPath: Record<string, string>;
  rootDeptId: string;
  rootName: string;
  cachedAt: string;
}

export function saveDeptTreeCache(data: Omit<CachedDeptTree, 'cachedAt'>) {
  const db = getDb();
  const cache: CachedDeptTree = { ...data, cachedAt: new Date().toISOString() };
  const upsertConfig = db.prepare(`
    INSERT INTO system_configs (key, value, description, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);
  upsertConfig.run('feishu_dept_tree_cache', JSON.stringify(cache), '飞书部门树缓存');
}

export function getDeptTreeCache(): CachedDeptTree | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM system_configs WHERE key='feishu_dept_tree_cache'").get() as any;
    if (!row || !row.value) return null;
    return JSON.parse(row.value) as CachedDeptTree;
  } catch (_) {
    return null;
  }
}

export async function searchUsers(keyword: string): Promise<FeishuUser[]> {
  try {
    const token = await getTenantAccessToken();
    const resp = await fetch(
      `${FEISHU_BASE_URL}/search/v1/user?query=${encodeURIComponent(keyword)}&page_size=20&user_id_type=open_id`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await resp.json() as any;
    if (data.code !== 0) {
      return [];
    }
    return (data.users || []).map((u: any) => mapFeishuUser(u, 'open_id'));
  } catch (_) {
    return [];
  }
}

export function clearTokenCache() {
  tokenCache = null;
}
