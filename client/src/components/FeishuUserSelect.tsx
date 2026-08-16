import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Select, Spin, Avatar, Empty } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { userApi } from '@/api';
import { getUserDisplayName } from '@/utils/userHelper';
import type { SelectProps } from 'antd';

interface FeishuUserSelectProps extends Omit<SelectProps, 'options'> {
  value?: number | string | null;
  onChange?: (value: number | string | null, user?: UserOption) => void;
  placeholder?: string;
  allowClear?: boolean;
  style?: React.CSSProperties;
  mode?: 'single' | 'multiple';
  departmentFilter?: string;
}

export interface UserOption {
  id: number;
  name: string;
  display_name: string;
  email?: string;
  phone?: string;
  department?: string;
  department_name?: string;
  role?: string;
  role_label?: string;
  job_title?: string;
  avatar?: string;
}

let cachedUsers: UserOption[] | null = null;
let cachedAt: number = 0;
const CACHE_TTL = 5 * 60 * 1000;

const avatarColors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#f5222d', '#1890ff', '#52c41a', '#eb2f96'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getDeptShortName(dept?: string): string {
  if (!dept) return '';
  const parts = dept.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : dept;
}

function deptMatches(dept: string | undefined, filter: string): boolean {
  if (!dept || !filter) return false;
  const d = dept.toLowerCase();
  const f = filter.toLowerCase();
  if (d === f) return true;
  if (d.startsWith(f + '/')) return true;
  if (d.endsWith('/' + f)) return true;
  if (d.includes('/' + f + '/')) return true;
  return false;
}

const FeishuUserSelect: React.FC<FeishuUserSelectProps> = ({
  value,
  onChange,
  placeholder = '请选择人员（可输入姓名/部门/岗位搜索）',
  allowClear = true,
  style,
  mode,
  departmentFilter,
  ...rest
}) => {
  const [users, setUsers] = useState<UserOption[]>(cachedUsers || []);
  const [loading, setLoading] = useState(!cachedUsers);
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (cachedUsers && Date.now() - cachedAt < CACHE_TTL) {
      setUsers(cachedUsers);
      setLoading(false);
      return;
    }
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const list = await userApi.all();
      const mapped: UserOption[] = (list || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        display_name: u.display_name || getUserDisplayName(u),
        email: u.email,
        phone: u.phone,
        department: u.department,
        department_name: getDeptShortName(u.department),
        role: u.role,
        role_label: u.role_label,
        job_title: u.job_title,
        avatar: u.avatar
      }));
      cachedUsers = mapped;
      cachedAt = Date.now();
      setUsers(mapped);
    } catch (err) {
      console.error('加载用户列表失败', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOptions = useMemo(() => {
    let result = users;
    if (departmentFilter) {
      result = result.filter(u => deptMatches(u.department, departmentFilter));
    }
    if (!searchValue.trim()) return result;
    const kw = searchValue.toLowerCase();
    return result.filter(u =>
      (u.display_name || u.name || '').toLowerCase().includes(kw) ||
      (u.name || '').toLowerCase().includes(kw) ||
      (u.department || '').toLowerCase().includes(kw) ||
      (u.department_name || '').toLowerCase().includes(kw) ||
      (u.job_title || '').toLowerCase().includes(kw) ||
      (u.email || '').toLowerCase().includes(kw) ||
      (u.role_label || '').toLowerCase().includes(kw)
    );
  }, [users, searchValue, departmentFilter]);

  const handleChange = (val: any) => {
    if (onChange) {
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        onChange(mode === 'multiple' ? [] as any : null);
      } else if (Array.isArray(val)) {
        const selectedUsers = users.filter(u => val.includes(u.id));
        onChange(val, selectedUsers as any);
      } else {
        const selected = users.find(u => u.id === val);
        onChange(val, selected);
      }
    }
  };

  const selectOptions: SelectProps['options'] = filteredOptions.map(u => ({
    label: u.display_name || u.name,
    value: u.id,
    user: u
  }));

  const renderOption = (option: any) => {
    const u = option.data.user as UserOption;
    if (!u) return option.label;
    const displayName = u.display_name || u.name;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
        <Avatar size={28} src={u.avatar || undefined} style={{ backgroundColor: getAvatarColor(displayName || ''), flexShrink: 0 }}>
          {displayName ? displayName.charAt(0) : <UserOutlined />}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500 }}>{displayName}</span>
            {u.name && u.name !== displayName && <span style={{ color: '#bfbfbf', fontSize: 12 }}>{u.name}</span>}
            {u.job_title && <span style={{ color: '#8c8c8c', fontSize: 12 }}>{u.job_title}</span>}
            {u.role_label && <span style={{ fontSize: 11, padding: '0 4px', background: '#e6f4ff', color: '#1890ff', borderRadius: 2 }}>{u.role_label}</span>}
          </div>
          {(u.department_name || u.email) && (
            <div style={{ color: '#bfbfbf', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.department_name && <span><TeamOutlined /> {u.department_name}</span>}
              {u.department_name && u.email && <span style={{ margin: '0 4px' }}>·</span>}
              {u.email && <span>{u.email}</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Select
      showSearch
      allowClear={allowClear}
      mode={mode === 'multiple' ? 'multiple' : undefined}
      placeholder={placeholder}
      filterOption={false}
      onSearch={setSearchValue}
      onClear={() => setSearchValue('')}
      loading={loading}
      options={selectOptions}
      value={value ?? undefined}
      onChange={handleChange}
      style={{ width: '100%', ...style }}
      notFoundContent={loading ? <Spin size="small" /> : <Empty description={departmentFilter ? `该部门暂无人员` : '未找到用户'} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      optionRender={renderOption}
      optionLabelProp="label"
      {...rest}
      getPopupContainer={() => document.body}
      popupMatchSelectWidth={false}
      styles={{ popup: { root: { zIndex: 10001, minWidth: 200 } } }}
    />
  );
};

export function refreshUserCache() {
  cachedUsers = null;
  cachedAt = 0;
}

export function clearUserCache() {
  cachedUsers = null;
  cachedAt = 0;
}

export default FeishuUserSelect;
