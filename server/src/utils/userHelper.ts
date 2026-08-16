export function extractChineseDisplayName(fullName: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return trimmed;
  const afterSpace = trimmed.substring(lastSpace + 1);
  if (/[\u4e00-\u9fa5]/.test(afterSpace)) {
    const parenIdx = afterSpace.indexOf('（');
    if (parenIdx > 0) return afterSpace.substring(0, parenIdx);
    const parenIdx2 = afterSpace.indexOf('(');
    if (parenIdx2 > 0) return afterSpace.substring(0, parenIdx2);
    return afterSpace;
  }
  return trimmed;
}

export function findUserIdByName(db: any, name: string): number | null {
  if (!name || !name.trim()) return null;
  const term = name.trim();

  let user = db.prepare('SELECT id, name FROM users WHERE name = ?').get(term) as any;
  if (user) return user.id;

  user = db.prepare('SELECT id, name FROM users WHERE username = ?').get(term) as any;
  if (user) return user.id;

  if (term.includes('@')) {
    user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(term) as any;
    if (user) return user.id;
  } else {
    user = db.prepare('SELECT id, name FROM users WHERE email LIKE ?').get(term + '@%') as any;
    if (user) return user.id;
  }

  user = db.prepare('SELECT id, name FROM users WHERE name LIKE ?').get('% ' + term) as any;
  if (user) return user.id;

  user = db.prepare('SELECT id, name FROM users WHERE name LIKE ?').get(term + ' %') as any;
  if (user) return user.id;

  const rows = db.prepare('SELECT id, name, username FROM users WHERE name LIKE ? OR username LIKE ?').all('%' + term + '%', '%' + term + '%') as any[];
  if (rows.length === 1) return rows[0].id;
  if (rows.length > 1) {
    const exactCn = rows.find(r => {
      const cn = extractChineseDisplayName(r.name);
      return cn === term;
    });
    if (exactCn) return exactCn.id;

    const exactUsername = rows.find(r => r.username && r.username.toLowerCase() === term.toLowerCase());
    if (exactUsername) return exactUsername.id;

    const startsWith = rows.find(r => {
      const cn = extractChineseDisplayName(r.name);
      return cn.startsWith(term) || (r.name && r.name.startsWith(term));
    });
    if (startsWith) return startsWith.id;
  }

  return null;
}

export function getUserDisplayNameById(db: any, userId: number | null): string {
  if (!userId) return '';
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
  if (!user?.name) return '';
  return extractChineseDisplayName(user.name);
}

export function enrichUserWithDisplayName(user: any): any {
  if (!user) return user;
  return {
    ...user,
    display_name: extractChineseDisplayName(user.name || '')
  };
}

export function enrichUsersWithDisplayName(users: any[]): any[] {
  return users.map(enrichUserWithDisplayName);
}
