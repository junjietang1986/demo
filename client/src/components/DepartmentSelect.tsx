import React, { useState, useEffect, useMemo } from 'react';
import { Select, Spin, Empty } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { userApi } from '@/api';
import type { SelectProps } from 'antd';

interface DepartmentSelectProps extends Omit<SelectProps, 'options'> {
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  style?: React.CSSProperties;
  mode?: 'single' | 'multiple';
  leafOnly?: boolean;
}

interface DeptOption {
  value: string;
  label: string;
  path: string;
  shortName: string;
  userCount: number;
  isLeaf: boolean;
}

let cachedDepts: DeptOption[] | null = null;
let cachedAt: number = 0;
const CACHE_TTL = 5 * 60 * 1000;

function flattenDeptTree(nodes: any[], parentPath = ''): DeptOption[] {
  let result: DeptOption[] = [];
  for (const node of nodes) {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    const isLeaf = !node.children || node.children.length === 0;
    const option: DeptOption = {
      value: path,
      label: path,
      path: path,
      shortName: node.name,
      userCount: node.userCount || 0,
      isLeaf
    };
    result.push(option);
    if (node.children && node.children.length > 0) {
      result = result.concat(flattenDeptTree(node.children, path));
    }
  }
  return result;
}

const DepartmentSelect: React.FC<DepartmentSelectProps> = ({
  value,
  onChange,
  placeholder = '请选择部门（可输入搜索）',
  allowClear = true,
  style,
  mode,
  leafOnly = false,
  ...rest
}) => {
  const [depts, setDepts] = useState<DeptOption[]>(cachedDepts || []);
  const [loading, setLoading] = useState(!cachedDepts);
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (cachedDepts && Date.now() - cachedAt < CACHE_TTL) {
      setDepts(cachedDepts);
      setLoading(false);
      return;
    }
    loadDepts();
  }, []);

  const loadDepts = async () => {
    try {
      setLoading(true);
      const res = await userApi.departmentTree();
      const tree = res.tree || [];
      const flat = flattenDeptTree(tree);
      cachedDepts = flat;
      cachedAt = Date.now();
      setDepts(flat);
    } catch (err) {
      console.error('加载部门列表失败', err);
      setDepts([]);
    } finally {
      setLoading(false);
    }
  };

  const displayOptions = useMemo(() => {
    let list = leafOnly ? depts.filter(d => d.isLeaf) : depts;
    if (!searchValue.trim()) return list;
    const kw = searchValue.toLowerCase();
    return list.filter(d =>
      d.path.toLowerCase().includes(kw) ||
      d.shortName.toLowerCase().includes(kw)
    );
  }, [depts, searchValue, leafOnly]);

  const handleChange = (val: any) => {
    if (onChange) {
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        onChange(mode === 'multiple' ? [] as any : null);
      } else {
        onChange(val);
      }
    }
  };

  const selectOptions: SelectProps['options'] = displayOptions.map(d => ({
    value: d.value,
    label: d.path,
    dept: d
  }));

  const renderOption = (option: any) => {
    const d = option.data.dept as DeptOption;
    if (!d) return option.label;
    const depth = (d.path.match(/\//g) || []).length;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
        <TeamOutlined style={{ color: '#1890ff', flexShrink: 0, marginLeft: depth * 12 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.shortName}</span>
        {d.userCount > 0 && (
          <span style={{ color: '#8c8c8c', fontSize: 12, flexShrink: 0 }}>({d.userCount}人)</span>
        )}
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
      notFoundContent={loading ? <Spin size="small" /> : <Empty description="未找到部门" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      optionRender={renderOption}
      optionLabelProp="label"
      {...rest}
      getPopupContainer={() => document.body}
      popupMatchSelectWidth={false}
      styles={{ popup: { root: { zIndex: 10001, minWidth: 220 } } }}
    />
  );
};

export function refreshDeptCache() {
  cachedDepts = null;
  cachedAt = 0;
}

export function clearDeptCache() {
  cachedDepts = null;
  cachedAt = 0;
}

export default DepartmentSelect;
