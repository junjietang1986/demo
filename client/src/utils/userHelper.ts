export function extractChineseDisplayName(fullName: string): string {
  if (!fullName) return '';
  const trimmed = (fullName || '').trim();
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

export function getUserDisplayName(user: any): string {
  if (!user) return '';
  if (user.display_name) return user.display_name;
  return extractChineseDisplayName(user.name || user.real_name || user.username || '');
}
