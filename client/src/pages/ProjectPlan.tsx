import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Button, Table, Tag, Space, message, Modal, Radio, Input, InputNumber,
  DatePicker, Popconfirm, Select, Typography, Dropdown, Tooltip, Drawer, List
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, SaveOutlined, ExportOutlined,
  SendOutlined, CopyOutlined, CaretDownOutlined, CaretRightOutlined,
  CheckOutlined, CloseOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ArrowLeftOutlined as IndentLeft, ArrowRightOutlined as IndentRight,
  DeleteOutlined, UndoOutlined, RedoOutlined, HistoryOutlined, EyeOutlined
} from '@ant-design/icons';
import { planApi, planTemplateApi, impexpApi } from '@/api';
import type { PlanTask, ProjectPlan } from '@/types';
import GanttChart from '@/components/GanttChart';
import DepartmentSelect from '@/components/DepartmentSelect';
import FeishuUserSelect from '@/components/FeishuUserSelect';
import { ResizableTable } from '@/components/ResizableTable';

const { Text } = Typography;

type EditField = 'name' | 'type' | 'predecessor' | 'duration' | 'start' | 'end' | 'department' | 'assignee' | 'progress' | 'status';

interface EditorState {
  visible: boolean;
  taskId: number | null;
  field: EditField | null;
  value: any;
  position: { top: number; left: number; width: number; height: number } | null;
  originalValue: any;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '未开始', color: 'default' },
  planning: { label: '计划中', color: 'default' },
  in_progress: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'warning' }
};

const STATUS_OPTIONS = [
  { value: 'pending', label: '未开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }
];

const TASK_TYPE_MAP: Record<string, { label: string; color: string; icon?: string }> = {
  task: { label: '任务', color: 'default' },
  milestone: { label: '里程碑', color: 'warning' },
  phase: { label: '阶段', color: 'processing' }
};

const TASK_TYPE_OPTIONS = [
  { value: 'task', label: '普通任务' },
  { value: 'phase', label: '阶段任务' },
  { value: 'milestone', label: '里程碑' }
];

const TOTAL_COLS_WIDTH = 914;

function buildTree(tasks: PlanTask[]): PlanTask[] {
  const map = new Map<number, PlanTask>();
  const roots: PlanTask[] = [];
  tasks.forEach(t => {
    map.set(t.id, { ...t, children: [], level: 1 });
  });
  map.forEach(task => {
    if (task.parent_id && map.has(task.parent_id)) {
      const parent = map.get(task.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(task);
    } else {
      roots.push(task);
    }
  });
  const setLevels = (list: PlanTask[], parentLevel: number) => {
    list.forEach(t => {
      t.level = parentLevel + 1;
      if (t.children && t.children.length > 0) {
        setLevels(t.children, t.level);
      }
    });
  };
  roots.forEach(r => { r.level = 1; });
  roots.forEach(r => { if (r.children) setLevels(r.children, 1); });
  const sortRecursive = (list: PlanTask[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order);
    list.forEach(t => { if (t.children) sortRecursive(t.children); });
  };
  sortRecursive(roots);
  return roots;
}

function flattenTasks(tasks: PlanTask[]): PlanTask[] {
  const result: PlanTask[] = [];
  const walk = (list: PlanTask[]) => {
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order);
    for (const task of sorted) {
      result.push(task);
      if (task.children && task.children.length > 0) {
        walk(task.children);
      }
    }
  };
  walk(tasks);
  return result;
}

function isDescendant(potentialAncestor: PlanTask, target: PlanTask): boolean {
  if (potentialAncestor.id === target.id) return true;
  if (!potentialAncestor.children || potentialAncestor.children.length === 0) return false;
  return potentialAncestor.children.some(child => isDescendant(child, target));
}

function getVisibleTasks(tasks: PlanTask[], expandedKeys: number[]): PlanTask[] {
  const result: PlanTask[] = [];
  const expandedSet = new Set(expandedKeys);
  const walk = (list: PlanTask[]) => {
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order);
    for (const task of sorted) {
      result.push(task);
      if (task.children && task.children.length > 0 && expandedSet.has(task.id)) {
        walk(task.children);
      }
    }
  };
  walk(tasks);
  return result;
}

function getDeptShortName(dept?: string): string {
  if (!dept) return '';
  const parts = dept.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : dept;
}

const ProjectPlan: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const planId = parseInt(id || '0');
  const navigate = useNavigate();
  const [msgApi, msgContextHolder] = message.useMessage();

  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'split' | 'gantt'>('split');
  const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const isEditable = useMemo(() => {
    if (!plan || !currentUser) return false;
    if (plan.status === 'submitted' || plan.status === 'approved') return false;
    if (currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'system_admin') return true;
    return plan.created_by === currentUser.id;
  }, [plan, currentUser]);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      setCurrentUser(u);
    } catch (_e) {}
  }, []);

  const [editor, setEditor] = useState<EditorState>({ visible: false, taskId: null, field: null, value: null, position: null, originalValue: null });
  const editorRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef(false);
  const isSavingRef = useRef(false);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const ganttWrapRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const [tableScrollY, setTableScrollY] = useState<number>(300);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [templateReplace, setTemplateReplace] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<any>(null);
  const flatTasksRef = useRef<PlanTask[]>([]);
  const baselineFlatRef = useRef<PlanTask[]>([]);
  const undoStackRef = useRef<PlanTask[][]>([]);
  const redoStackRef = useRef<PlanTask[][]>([]);
  const nextTempIdRef = useRef(-1);
  const [historyTick, setHistoryTick] = useState(0);
  const canUndo = useMemo(() => undoStackRef.current.length > 0, [historyTick]);
  const canRedo = useMemo(() => redoStackRef.current.length > 0, [historyTick]);

  const cloneTask = (t: PlanTask): PlanTask => ({
    ...t,
    children: undefined,
    ...(t.assignee_name !== undefined ? { assignee_name: t.assignee_name } : {})
  });
  const cloneFlat = (list: PlanTask[]): PlanTask[] => list.map(t => cloneTask(t));

  const getDescendantIds = (flat: PlanTask[], parentId: number): number[] => {
    const ids: number[] = [];
    const walk = (pid: number) => {
      flat.filter(t => t.parent_id === pid).forEach(c => { ids.push(c.id); walk(c.id); });
    };
    walk(parentId);
    return ids;
  };

  const pushSnapshot = useCallback(() => {
    undoStackRef.current.push(cloneFlat(flatTasksRef.current));
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const applyMutator = useCallback((mutator: (flat: PlanTask[]) => PlanTask[]) => {
    pushSnapshot();
    const newFlat = mutator(cloneFlat(flatTasksRef.current));
    flatTasksRef.current = newFlat;
    setTasks(buildTree(newFlat));
    setDirty(true);
    setHistoryTick(v => v + 1);
  }, [pushSnapshot]);

  const setFlatTasks = useCallback((flat: PlanTask[], resetHistory: boolean = false, markDirty: boolean = false) => {
    flatTasksRef.current = cloneFlat(flat);
    baselineFlatRef.current = cloneFlat(flat);
    if (resetHistory) {
      undoStackRef.current = [];
      redoStackRef.current = [];
    }
    setTasks(buildTree(flat));
    if (markDirty) setDirty(true);
    else setDirty(false);
    setHistoryTick(v => v + 1);
  }, []);

  const parseDate = (d: any): dayjs.Dayjs | null => {
    if (!d) return null;
    const parsed = dayjs(d);
    return parsed.isValid() ? parsed : null;
  };
  const fmtDate = (d: dayjs.Dayjs | null): string | null => d ? d.format('YYYY-MM-DD') : null;

  const handleUndo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) { msgApi.info('没有可撤销的操作'); return; }
    redoStackRef.current.push(cloneFlat(flatTasksRef.current));
    flatTasksRef.current = prev;
    setTasks(buildTree(prev));
    setDirty(undoStackRef.current.length > 0);
    setHistoryTick(v => v + 1);
  }, [msgApi]);

  const handleRedo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) { msgApi.info('没有可恢复的操作'); return; }
    undoStackRef.current.push(cloneFlat(flatTasksRef.current));
    flatTasksRef.current = next;
    setTasks(buildTree(next));
    setDirty(true);
    setHistoryTick(v => v + 1);
  }, [msgApi]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '有未保存的更改，确定要离开吗？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const fetchPlan = useCallback(async () => {
    if (!planId) return;
    try {
      setLoading(true);
      const data = await planApi.get(planId);
      const planData = (data as any).plan || data;
      setPlan(planData);
      const rawTasks: PlanTask[] = ((data as any).tasks || []).map((t: any) => ({ ...t, children: undefined }));
      nextTempIdRef.current = -1;
      setFlatTasks(rawTasks, true, false);
      const allIds = rawTasks.filter((t: PlanTask) => rawTasks.some((c: PlanTask) => c.parent_id === t.id)).map((t: PlanTask) => t.id);
      setExpandedRowKeys(allIds);
    } catch (err: any) {
      msgApi.error(err?.message || '加载计划失败');
    } finally {
      setLoading(false);
    }
  }, [planId, msgApi, setFlatTasks]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    const calcHeight = () => {
      if (tableWrapRef.current) {
        const h = tableWrapRef.current.clientHeight;
        const headerH = 32;
        const summaryH = isEditable ? 30 : 0;
        const borderH = 2;
        setTableScrollY(Math.max(80, h - headerH - summaryH - borderH));
      }
    };
    calcHeight();
    const ro = new ResizeObserver(calcHeight);
    if (tableWrapRef.current) ro.observe(tableWrapRef.current);
    const t1 = setTimeout(calcHeight, 50);
    const t2 = setTimeout(calcHeight, 200);
    const t3 = setTimeout(calcHeight, 500);
    const t4 = setTimeout(calcHeight, 1000);
    window.addEventListener('resize', calcHeight);
    return () => {
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      window.removeEventListener('resize', calcHeight);
    };
  }, [isEditable, viewMode, selectedRowKeys.length, tableWrapRef]);

  const closeEditor = useCallback(() => {
    isSubmittingRef.current = false;
    isSavingRef.current = false;
    setEditor({ visible: false, taskId: null, field: null, value: null, position: null, originalValue: null });
  }, []);

  const commitFieldEdit = useCallback((taskId: number, field: EditField, value: any) => {
    applyMutator((flat) => {
      const idx = flat.findIndex(t => t.id === taskId);
      if (idx === -1) return flat;
      const task = { ...flat[idx] };
      switch (field) {
        case 'name': {
          const v = String(value || '').trim();
          if (!v) { msgApi.warning('任务名称不能为空'); return flat; }
          task.task_name = v;
          break;
        }
        case 'type': task.task_type = value || 'task'; break;
        case 'predecessor': task.predecessor_id = value || 0; break;
        case 'start': {
          const newStart = value ? dayjs(value) : null;
          task.start_date = newStart ? newStart.format('YYYY-MM-DD') : undefined;
          if (task.scheduling_mode === 'auto' && newStart) {
            const dur = task.duration_days || 1;
            task.end_date = newStart.add(dur - 1, 'day').format('YYYY-MM-DD');
          }
          break;
        }
        case 'end': {
          const newEnd = value ? dayjs(value) : null;
          task.end_date = newEnd ? newEnd.format('YYYY-MM-DD') : undefined;
          if (task.scheduling_mode === 'auto' && newEnd && task.start_date) {
            const diff = newEnd.diff(dayjs(task.start_date), 'day') + 1;
            task.duration_days = Math.max(1, diff);
          }
          break;
        }
        case 'duration': {
          const dur = Math.max(1, parseInt(value) || 1);
          const base = task.start_date ? dayjs(task.start_date) : dayjs();
          task.start_date = base.format('YYYY-MM-DD');
          task.end_date = base.add(dur - 1, 'day').format('YYYY-MM-DD');
          task.duration_days = dur;
          break;
        }
        case 'department': task.department = value || null; break;
        case 'assignee': task.assignee_id = value || null; break;
        case 'progress': task.progress = Math.max(0, Math.min(100, parseInt(value) || 0)); break;
        case 'status': task.status = value; break;
      }
      if (field === 'predecessor' && task.scheduling_mode === 'auto' && task.predecessor_id) {
        const pred = flat.find(t => t.id === task.predecessor_id);
        if (pred?.end_date) {
          const newStart = dayjs(pred.end_date).add(1, 'day');
          const dur = task.duration_days || 1;
          task.start_date = newStart.format('YYYY-MM-DD');
          task.end_date = newStart.add(dur - 1, 'day').format('YYYY-MM-DD');
        }
      }
      flat[idx] = task;
      return flat;
    });
    setEditor({ visible: false, taskId: null, field: null, value: null, position: null, originalValue: null });
  }, [applyMutator, msgApi]);

  const saveFieldValue = useCallback((taskId: number, field: EditField, value: any) => {
    if (isSubmittingRef.current || isSavingRef.current) return;
    isSavingRef.current = true;
    isSubmittingRef.current = true;
    commitFieldEdit(taskId, field, value);
    isSavingRef.current = false;
    isSubmittingRef.current = false;
  }, [commitFieldEdit]);

  const handleQuickUpdate = useCallback((taskId: number, patch: Partial<PlanTask>) => {
    applyMutator((flat) => {
      const idx = flat.findIndex(t => t.id === taskId);
      if (idx === -1) return flat;
      flat[idx] = { ...flat[idx], ...patch } as PlanTask;
      return flat;
    });
  }, [applyMutator]);

  const cancelEdit = useCallback(() => {
    isSubmittingRef.current = false;
    isSavingRef.current = false;
    setEditor({ visible: false, taskId: null, field: null, value: null, position: null, originalValue: null });
  }, []);

  useEffect(() => {
    const isInPopup = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      let el: HTMLElement | null = target;
      while (el && el !== document.body) {
        const cls = (el.className || '') as string;
        if (typeof cls === 'string' && (
          cls.includes('ant-select-dropdown') ||
          cls.includes('ant-picker-dropdown') ||
          cls.includes('ant-picker-panel') ||
          cls.includes('ant-picker-cell') ||
          cls.includes('rc-virtual-list-holder') ||
          cls.includes('ant-cascader-dropdown') ||
          cls.includes('ant-tooltip') ||
          cls.includes('ant-popover') ||
          cls.includes('ant-dropdown-menu') ||
          cls.includes('ant-select-item') ||
          cls.includes('ant-picker-header') ||
          cls.includes('ant-picker-footer') ||
          cls.includes('ant-picker-content')
        )) return true;
        el = el.parentElement;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!editor.visible) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        const targetEl = e.target as HTMLElement;
        const inPickerDropdown = !!targetEl?.closest('.ant-picker-dropdown, .ant-picker-panel');
        const inSelectDropdown = !!targetEl?.closest('.ant-select-dropdown');
        
        if (tag === 'TEXTAREA') return;
        
        if (inPickerDropdown || inSelectDropdown) {
          return;
        }
        
        const inPickerInput = !!targetEl?.closest('.ant-picker-input > input');
        const inSelectSearchInput = !!targetEl?.closest('.ant-select-selection-search-input');
        
        if (inPickerInput) {
          e.preventDefault();
          e.stopPropagation();
          const inputEl = targetEl as HTMLInputElement;
          const inputVal = inputEl.value;
          if (inputVal) {
            const parsed = dayjs(inputVal, 'YYYY-MM-DD', true);
            if (parsed.isValid()) {
              setEditor(prev => ({ ...prev, value: parsed }));
              setTimeout(() => {
                if (editor.taskId && editor.field && !isSavingRef.current) {
                  saveFieldValue(editor.taskId, editor.field, parsed);
                }
              }, 0);
            } else {
              msgApi.warning('请输入有效的日期格式（YYYY-MM-DD）');
            }
          } else {
            setTimeout(() => {
              if (editor.taskId && editor.field && !isSavingRef.current) {
                saveFieldValue(editor.taskId, editor.field, editor.value);
              }
            }, 0);
          }
          return;
        }
        
        if (inSelectSearchInput) {
          setTimeout(() => {
            if (editor.visible && editor.taskId && editor.field && !isSavingRef.current) {
              saveFieldValue(editor.taskId, editor.field, editor.value);
            }
          }, 150);
          return;
        }
        
        e.preventDefault();
        if (editor.taskId && editor.field) {
          saveFieldValue(editor.taskId, editor.field, editor.value);
        }
      }
    };

    const onScroll = (e: Event) => {
      if (!editor.visible) return;
      const target = e.target as EventTarget | null;
      if (!target || target === document || target === window) return;
      const el = target as HTMLElement;
      if (isInPopup(el)) return;
      let node: HTMLElement | null = el;
      let isTableScroll = false;
      while (node && node !== document.body) {
        const cls = (node.className || '') as string;
        if (cls.includes('ant-table-body') || cls.includes('msp-table-wrap')) { isTableScroll = true; break; }
        node = node.parentElement;
      }
      if (isTableScroll) {
        cancelEdit();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!editor.visible || !editorRef.current || isSavingRef.current) return;
      const target = e.target as HTMLElement;
      if (editorRef.current.contains(target)) return;
      if (isInPopup(target)) return;
      const field = editor.field;
      if (field === 'name' || field === 'duration' || field === 'progress') {
        if (editor.taskId && editor.field) {
          saveFieldValue(editor.taskId, editor.field, editor.value);
        }
      } else if (field === 'start' || field === 'end') {
        const pickerInput = editorRef.current.querySelector('.ant-picker-input > input') as HTMLInputElement;
        if (pickerInput && pickerInput.value) {
          const parsed = dayjs(pickerInput.value, 'YYYY-MM-DD', true);
          if (parsed.isValid()) {
            saveFieldValue(editor.taskId!, field, parsed);
            return;
          }
        }
        cancelEdit();
      } else {
        if (editor.value !== editor.originalValue && editor.value !== null && editor.value !== undefined) {
          if (editor.taskId && editor.field) {
            saveFieldValue(editor.taskId, editor.field, editor.value);
            return;
          }
        }
        cancelEdit();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [editor.visible, editor.taskId, editor.field, editor.value, cancelEdit, saveFieldValue]);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (editor.visible) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', onGlobalKey);
    return () => document.removeEventListener('keydown', onGlobalKey);
  }, [editor.visible, handleUndo, handleRedo]);

  const openEditor = useCallback((task: PlanTask, field: EditField, cellEl: HTMLElement) => {
    if (!isEditable) return;
    if (editor.visible) return;
    const rect = cellEl.getBoundingClientRect();
    let initialValue: any = null;
    switch (field) {
      case 'name': initialValue = task.task_name || ''; break;
      case 'type': initialValue = task.task_type || 'task'; break;
      case 'predecessor': initialValue = task.predecessor_id || null; break;
      case 'duration': {
        if (task.start_date && task.end_date) {
          initialValue = dayjs(task.end_date).diff(dayjs(task.start_date), 'day') + 1;
        } else { initialValue = 1; }
        break;
      }
      case 'start': initialValue = task.start_date ? dayjs(task.start_date) : null; break;
      case 'end': initialValue = task.end_date ? dayjs(task.end_date) : null; break;
      case 'department': initialValue = task.department || null; break;
      case 'assignee': initialValue = task.assignee_id || null; break;
      case 'progress': initialValue = task.progress ?? 0; break;
      case 'status': initialValue = task.status || 'pending'; break;
    }
    isSubmittingRef.current = false;
    isSavingRef.current = false;
    setEditor({
      visible: true,
      taskId: task.id,
      field,
      value: initialValue,
      originalValue: initialValue,
      position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    });
  }, [isEditable, editor.visible]);

  const handleAddTask = useCallback(() => {
    applyMutator((flat) => {
      const maxOrder = flat.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
      const newId = nextTempIdRef.current--;
      const newTask: PlanTask = {
        id: newId, plan_id: planId, parent_id: 0, predecessor_id: 0, scheduling_mode: 'auto',
        task_name: '新任务', task_type: 'task', progress: 0, status: 'pending',
        duration_days: 1, sort_order: maxOrder + 1, level: 1, children: []
      } as PlanTask;
      return [...flat, newTask];
    });
  }, [applyMutator, planId]);

  const handleAddSubTask = useCallback((parent: PlanTask) => {
    applyMutator((flat) => {
      const siblings = flat.filter(t => t.parent_id === parent.id);
      const maxOrder = siblings.reduce((m, t) => Math.max(m, t.sort_order || 0), parent.sort_order || 0);
      const newId = nextTempIdRef.current--;
      const newTask: PlanTask = {
        id: newId, plan_id: planId, parent_id: parent.id, predecessor_id: 0, scheduling_mode: 'auto',
        task_name: '新子任务', task_type: 'task', progress: 0, status: 'pending',
        duration_days: 1, sort_order: maxOrder + 1, level: (parent.level || 1) + 1, children: []
      } as PlanTask;
      setExpandedRowKeys(keys => keys.includes(parent.id) ? keys : [...keys, parent.id]);
      return [...flat, newTask];
    });
  }, [applyMutator, planId]);

  const handleDeleteTask = useCallback((taskId: number) => {
    applyMutator((flat) => {
      const toDelete = new Set<number>([taskId, ...getDescendantIds(flat, taskId)]);
      setSelectedRowKeys([]);
      return flat.filter(t => !toDelete.has(t.id));
    });
  }, [applyMutator]);

  const handleMoveTask = useCallback((task: PlanTask, dir: 'up' | 'down') => {
    applyMutator((flat) => {
      const siblings = flat.filter(t => t.parent_id === task.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const idx = siblings.findIndex(t => t.id === task.id);
      if (idx === -1) return flat;
      if (dir === 'up' && idx === 0) return flat;
      if (dir === 'down' && idx === siblings.length - 1) return flat;
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      const swapTask = siblings[swapIdx];
      const newFlat = flat.map(t => {
        if (t.id === task.id) return { ...t, sort_order: swapTask.sort_order };
        if (t.id === swapTask.id) return { ...t, sort_order: task.sort_order };
        return t;
      });
      return newFlat;
    });
  }, [applyMutator]);

  const handleIndentTask = useCallback((task: PlanTask, indent: boolean) => {
    applyMutator((flat) => {
      if (indent) {
        const siblings = flat.filter(t => t.parent_id === task.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const idx = siblings.findIndex(t => t.id === task.id);
        if (idx <= 0) { msgApi.warning('第一个任务无法降级'); return flat; }
        const newParent = siblings[idx - 1];
        setExpandedRowKeys(keys => keys.includes(newParent.id) ? keys : [...keys, newParent.id]);
        return flat.map(t => t.id === task.id ? { ...t, parent_id: newParent.id, level: (newParent.level || 1) + 1 } : t);
      } else {
        if (!task.parent_id) { msgApi.info('该任务已经是顶级任务'); return flat; }
        return flat.map(t => t.id === task.id ? { ...t, parent_id: 0, level: 1 } : t);
      }
    });
  }, [applyMutator, msgApi]);

  const formatVersion = (v: number) => 'V' + String(v || 1).padStart(2, '0');

  const TASK_SAVE_FIELDS = ['task_name','task_type','department','assignee_id','start_date','end_date',
    'actual_start_date','actual_end_date','progress','status','milestone_summary',
    'sort_order','parent_id','predecessor_id','scheduling_mode','duration_days','level'] as const;

  const handleSave = useCallback(async () => {
    if (saving) return;
    try {
      setSaving(true);
      const currentFlat = cloneFlat(flatTasksRef.current);
      const payload = currentFlat.map(t => {
        const obj: any = { id: t.id };
        TASK_SAVE_FIELDS.forEach(f => {
          const v = (t as any)[f];
          if (v !== undefined && v !== null && v !== '') obj[f] = v;
          else if (f === 'parent_id' || f === 'predecessor_id') obj[f] = 0;
          else if (f === 'progress') obj[f] = 0;
          else if (f === 'status') obj[f] = 'pending';
          else if (f === 'scheduling_mode') obj[f] = 'auto';
          else if (f === 'sort_order') obj[f] = t.sort_order || 0;
          else if (f === 'level') obj[f] = t.level || 1;
          else if (f === 'duration_days') obj[f] = t.duration_days || 1;
        });
        return obj;
      });
      const data: any = await planApi.saveBatch(planId, payload);
      if (data?.isFirstSave) {
        msgApi.success('保存成功');
      } else {
        msgApi.success(`保存成功，当前版本 ${formatVersion(data?.newVersion || plan?.version || 1)}`);
      }
      await fetchPlan();
    } catch (err: any) {
      msgApi.error(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [saving, planId, plan, msgApi, fetchPlan]);

  const handleSubmit = useCallback(async () => {
    if (dirty) { msgApi.warning('请先保存更改后再发起审批'); return; }
    if (!plan) return;
    try {
      await planApi.submit(plan.id);
      msgApi.success('已发起审批');
      await fetchPlan();
    } catch (err: any) {
      msgApi.error(err?.message || '发起审批失败');
    }
  }, [dirty, plan, msgApi, fetchPlan]);

  const handleApplyTemplate = useCallback(async () => {
    if (!selectedTemplate) { msgApi.warning('请选择模板'); return; }
    if (dirty && !window.confirm('当前有未保存的更改，应用模板将丢失这些更改并从服务器重新加载。继续吗？')) return;
    try {
      setApplyingTemplate(true);
      await planTemplateApi.apply(selectedTemplate, planId, { replace: templateReplace });
      msgApi.success(templateReplace ? '模板已应用（替换现有任务）' : '模板已应用（追加任务）');
      setTemplateModalOpen(false);
      setSelectedTemplate(null);
      await fetchPlan();
    } catch (err: any) {
      msgApi.error(err?.message || '应用模板失败');
    } finally {
      setApplyingTemplate(false);
    }
  }, [selectedTemplate, planId, templateReplace, dirty, msgApi, fetchPlan]);

  const loadTemplates = useCallback(async () => {
    try {
      const res: any = await planTemplateApi.list();
      setTemplates((res as any) || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (templateModalOpen) loadTemplates();
  }, [templateModalOpen, loadTemplates]);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) { msgApi.warning('请输入模板名称'); return; }
    try {
      setSavingTemplate(true);
      await planTemplateApi.saveFromPlan(planId, { template_name: templateName.trim(), description: templateDesc.trim() });
      msgApi.success('模板已保存');
      setSaveTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDesc('');
    } catch (err: any) {
      msgApi.error(err?.message || '保存模板失败');
    } finally {
      setSavingTemplate(false);
    }
  }, [templateName, templateDesc, planId, msgApi]);

  const loadVersionHistory = useCallback(async () => {
    try {
      setLoadingVersions(true);
      const res: any = await impexpApi.getVersions('project_plan', planId);
      setVersions((res?.data || res || []) as any[]);
    } catch (err: any) {
      msgApi.error(err?.message || '加载版本历史失败');
    } finally {
      setLoadingVersions(false);
    }
  }, [planId, msgApi]);

  const openVersionHistory = useCallback(() => {
    setVersionHistoryOpen(true);
    setViewingVersion(null);
    loadVersionHistory();
  }, [loadVersionHistory]);

  const handleViewVersion = useCallback((v: any) => {
    try {
      const snap = typeof v.snapshot_data === 'string' ? JSON.parse(v.snapshot_data) : v.snapshot_data;
      setViewingVersion({ ...v, snapshot: snap });
    } catch (_e) {
      msgApi.error('版本数据解析失败');
    }
  }, [msgApi]);

  const closeVersionView = useCallback(() => setViewingVersion(null), []);

  const handleExportExcel = useCallback(async (viewType: 'list' | 'split' | 'gantt') => {
    try {
      const res = await planApi.export(planId, 'excel', viewType);
      const blob = new Blob([res as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const viewName = viewType === 'list' ? '任务表' : viewType === 'split' ? '组合视图' : '甘特图';
      link.download = `${plan?.plan_name || '项目计划'}_${viewName}_${dayjs().format('YYYYMMDD')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      msgApi.success('Excel导出成功');
    } catch (err: any) {
      msgApi.error(err?.message || '导出失败');
    }
  }, [planId, msgApi, plan]);

  const handleExportMSProject = useCallback(async () => {
    try {
      const res = await planApi.export(planId, 'mpp_xml', 'split');
      const blob = new Blob([res as any], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${plan?.plan_name || '项目计划'}_MSProject_${dayjs().format('YYYYMMDD')}.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      msgApi.success('导出成功！请用MS Project打开.xml文件，打开后可另存为.mpp格式');
    } catch (err: any) {
      msgApi.error(err?.message || '导出失败');
    }
  }, [planId, msgApi, plan]);

  const captureElement = async (el: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> => {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight
    });
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height
    };
  };

  const handleExportPDF = useCallback(async (viewType: 'list' | 'gantt' | 'all') => {
    try {
      const hideMask = msgApi.loading('正在生成PDF，请稍候...', 0);
      const { jsPDF } = await import('jspdf');

      const originalView = viewMode;
      const originalScrollY = tableScrollY;
      const originalExpanded = [...expandedRowKeys];
      let needRestore = false;

      setExpandedRowKeys(flattenTasks(tasks).map(t => t.id));
      setTableScrollY(50000);
      await new Promise(r => setTimeout(r, 800));

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 8;
      const titleAreaH = 14;

      const addImageToPdf = (img: { dataUrl: string; width: number; height: number }, label: string, isFirst: boolean) => {
        if (!isFirst) doc.addPage();
        doc.setFontSize(14);
        doc.setTextColor(24, 144, 255);
        doc.text(label, margin, margin + 6);
        doc.setDrawColor(24, 144, 255);
        doc.setLineWidth(0.5);
        doc.line(margin, margin + 8, pageW - margin, margin + 8);

        const ratio = img.height / img.width;
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2 - titleAreaH;
        let w = availW;
        let h = w * ratio;
        if (h > availH) {
          h = availH;
          w = h / ratio;
        }
        const x = margin + (availW - w) / 2;
        const y = margin + titleAreaH;
        doc.addImage(img.dataUrl, 'PNG', x, y, w, h);
      };

      const prepareForCapture = (targetEl: HTMLElement) => {
        const saved: { el: HTMLElement; origOverflow: string; origOverflowY: string; origHeight: string; origMaxHeight: string; origMaxHeightPrio: string; origHeightPrio: string }[] = [];
        const applyExpand = (el: HTMLElement) => {
          const cs = window.getComputedStyle(el);
          saved.push({
            el,
            origOverflow: el.style.overflow,
            origOverflowY: el.style.overflowY,
            origHeight: el.style.height,
            origMaxHeight: el.style.maxHeight,
            origMaxHeightPrio: el.style.getPropertyPriority('max-height'),
            origHeightPrio: el.style.getPropertyPriority('height')
          });
          if (cs.overflow !== 'visible') el.style.overflow = 'visible';
          if (cs.overflowY !== 'visible') el.style.overflowY = 'visible';
          if (el.classList.contains('ant-table-body')) {
            el.style.setProperty('max-height', 'none', 'important');
            el.style.setProperty('height', 'auto', 'important');
            el.style.overflowY = 'visible';
          }
        };
        applyExpand(targetEl);
        let p: HTMLElement | null = targetEl.parentElement;
        while (p && p !== document.body) {
          applyExpand(p);
          p = p.parentElement;
        }
        return saved;
      };
      const restoreEls = (saved: { el: HTMLElement; origOverflow: string; origOverflowY: string; origHeight: string; origMaxHeight: string; origMaxHeightPrio: string; origHeightPrio: string }[]) => {
        saved.forEach(({ el, origOverflow, origOverflowY, origHeight, origMaxHeight, origMaxHeightPrio, origHeightPrio }) => {
          el.style.overflow = origOverflow;
          el.style.overflowY = origOverflowY;
          el.style.setProperty('height', origHeight, origHeightPrio as any);
          el.style.setProperty('max-height', origMaxHeight, origMaxHeightPrio as any);
        });
      };

      let firstPage = true;

      const waitRAF = () => new Promise(r => requestAnimationFrame(() => r(null)));
      const waitFrames = async (n: number) => { for (let i = 0; i < n; i++) await waitRAF(); };

      if (viewType === 'list' || viewType === 'all') {
        if (viewMode !== 'list') { setViewMode('list'); needRestore = true; await new Promise(r => setTimeout(r, 800)); }
        await waitFrames(5);
        const target = tableWrapperRef.current;
        if (target) {
          const saved = prepareForCapture(target);
          await waitFrames(10);
          try {
            const img = await captureElement(target);
            if (img.width > 0 && img.height > 0) {
              addImageToPdf(img, `${plan?.plan_name || '项目计划'} - 任务表`, firstPage);
              firstPage = false;
            }
          } finally {
            restoreEls(saved);
          }
        }
      }

      if (viewType === 'gantt' || viewType === 'all') {
        if (viewMode !== 'gantt') { setViewMode('gantt'); needRestore = true; await new Promise(r => setTimeout(r, 800)); }
        await waitFrames(5);
        const target = ganttWrapRef.current;
        if (target) {
          const saved = prepareForCapture(target);
          await waitFrames(10);
          try {
            const img = await captureElement(target);
            if (img.width > 0 && img.height > 0) {
              addImageToPdf(img, `${plan?.plan_name || '项目计划'} - 甘特图`, firstPage);
              firstPage = false;
            }
          } catch (e) {
            console.warn('Gantt capture failed:', e);
          } finally {
            restoreEls(saved);
          }
        }
      }

      setExpandedRowKeys(originalExpanded);
      setTableScrollY(originalScrollY);
      if (needRestore) setViewMode(originalView);

      if (firstPage) {
        hideMask();
        msgApi.error('截图失败，请重试');
        return;
      }

      const viewName = viewType === 'list' ? '任务表' : viewType === 'gantt' ? '甘特图' : '完整计划';
      doc.save(`${plan?.plan_name || '项目计划'}_${viewName}_${dayjs().format('YYYYMMDD')}.pdf`);
      hideMask();
      msgApi.success('PDF导出成功');
    } catch (err: any) {
      console.error('PDF export error:', err);
      msgApi.error(err?.message || 'PDF导出失败');
    }
  }, [planId, msgApi, plan, viewMode, tableScrollY, expandedRowKeys, tasks]);

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'mpp',
      label: '📋 导出为 MS Project (.xml)',
      onClick: () => handleExportMSProject()
    },
    { type: 'divider' as const },
    {
      key: 'excel-list',
      label: '📊 导出任务表 Excel',
      onClick: () => handleExportExcel('list')
    },
    {
      key: 'excel-gantt',
      label: '📊 导出甘特图数据 Excel',
      onClick: () => handleExportExcel('gantt')
    },
    {
      key: 'excel-all',
      label: '📊 导出全部 Excel',
      onClick: () => handleExportExcel('split')
    },
    { type: 'divider' as const },
    {
      key: 'pdf-list',
      label: '📄 导出任务表 PDF（界面样式）',
      onClick: () => handleExportPDF('list')
    },
    {
      key: 'pdf-gantt',
      label: '📄 导出甘特图 PDF（界面样式）',
      onClick: () => handleExportPDF('gantt')
    },
    {
      key: 'pdf-all',
      label: '📄 导出完整PDF（任务表+甘特图）',
      onClick: () => handleExportPDF('all')
    }
  ];

  const flatAllTasks = useMemo(() => flattenTasks(tasks), [tasks]);
  const visibleTasks = useMemo(() => getVisibleTasks(tasks, expandedRowKeys), [tasks, expandedRowKeys]);

  const taskColumns = useMemo(() => [
    {
      title: '#',
      key: 'index',
      width: 24,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <span style={{ color: '#8c8c8c', fontSize: 10, userSelect: 'none' }}>{idx + 1}</span>
      )
    },
    {
      title: '',
      key: 'mode',
      width: 28,
      align: 'center' as const,
      render: (_: any, record: PlanTask) => {
        const isAuto = record.scheduling_mode !== 'manual';
        return (
          <Tooltip title={isAuto ? '自动排程：前置任务变化时自动调整日期' : '手动排程：日期不会因其他任务变化而改变（点击切换）'}>
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (!isEditable) return;
                handleQuickUpdate(record.id, { scheduling_mode: isAuto ? 'manual' : 'auto' });
              }}
              style={{
                cursor: isEditable ? 'pointer' : 'default',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                borderRadius: 3,
                fontSize: 11,
                fontWeight: 'bold',
                color: isAuto ? '#52c41a' : '#1677ff',
                background: isAuto ? '#f6ffed' : '#e6f4ff',
                border: `1px solid ${isAuto ? '#b7eb8f' : '#91caff'}`,
                userSelect: 'none'
              }}
            >
              {isAuto ? 'A' : 'M'}
            </span>
          </Tooltip>
        );
      }
    },
    {
      title: '任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      ellipsis: true,
      width: 150,
      render: (text: string, record: PlanTask) => {
        const hasChildren = flatAllTasks.some(t => t.parent_id === record.id);
        const taskTypeInfo = TASK_TYPE_MAP[record.task_type] || TASK_TYPE_MAP.task;
        const isMilestone = record.task_type === 'milestone';
        const isPhase = record.task_type === 'phase';
        return (
          <div
            onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'name', e.currentTarget); }}
            style={{
              cursor: isEditable ? 'cell' : 'default',
              paddingLeft: Math.max(2, ((record.level || 1) - 1) * 14),
              display: 'flex', alignItems: 'center', gap: 2,
              height: '100%', minHeight: 26, paddingRight: 4,
            }}
          >
            {hasChildren ? (
              <span
                style={{ cursor: 'pointer', fontSize: 10, flexShrink: 0, width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#595959' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedRowKeys(keys => keys.includes(record.id) ? keys.filter(k => k !== record.id) : [...keys, record.id]);
                }}
              >
                {expandedRowKeys.includes(record.id) ? <CaretDownOutlined /> : <CaretRightOutlined />}
              </span>
            ) : (
              <span style={{ width: 14, display: 'inline-block', flexShrink: 0 }} />
            )}
            {isMilestone && (
              <span style={{ width: 7, height: 7, background: '#faad14', borderRadius: '50%', flexShrink: 0, marginRight: 1 }} />
            )}
            {isPhase && (
              <span style={{ width: 3, height: 12, background: '#1677ff', borderRadius: 1, flexShrink: 0, marginRight: 2 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: hasChildren || isPhase ? 600 : 400, fontSize: isMilestone ? 12 : 12 }}>
              {text}
            </span>
          </div>
        );
      }
    },
    {
      title: '类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 60,
      align: 'center' as const,
      render: (type: string, record: PlanTask) => {
        const info = TASK_TYPE_MAP[type] || TASK_TYPE_MAP.task;
        const tagColor = type === 'milestone' ? 'orange' : type === 'phase' ? 'blue' : 'default';
        return (
          <div
            onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'type', e.currentTarget); }}
            style={{ cursor: isEditable ? 'cell' : 'default', height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Tag color={tagColor} style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>{info.label}</Tag>
          </div>
        );
      }
    },
    {
      title: '前置任务',
      key: 'predecessor',
      width: 70,
      ellipsis: true,
      render: (_: any, record: PlanTask) => {
        const allFlat = flattenTasks(tasks);
        const pred = record.predecessor_id ? allFlat.find(t => t.id === record.predecessor_id) : null;
        const predLabel = pred ? `${pred.id}. ${pred.task_name.length > 6 ? pred.task_name.substring(0, 6) + '…' : pred.task_name}` : '';
        return (
          <div
            onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'predecessor', e.currentTarget); }}
            style={{
              cursor: isEditable ? 'cell' : 'default',
              height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', fontSize: 10, paddingLeft: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {predLabel || (isEditable ? <span style={{ color: '#bfbfbf' }}>无</span> : '-')}
          </div>
        );
      }
    },
    {
      title: '工期',
      key: 'duration',
      width: 36,
      align: 'center' as const,
      render: (_: any, record: PlanTask) => {
        let days = 1;
        if (record.start_date && record.end_date) {
          days = dayjs(record.end_date).diff(dayjs(record.start_date), 'day') + 1;
        }
        return (
          <div
            onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'duration', e.currentTarget); }}
            style={{ cursor: isEditable ? 'cell' : 'default', height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
          >
            {days}d
          </div>
        );
      }
    },
    {
      title: '开始',
      dataIndex: 'start_date',
      key: 'start_date',
      width: 88,
      render: (d: string, record: PlanTask) => (
        <div
          onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'start', e.currentTarget); }}
          style={{
            cursor: isEditable ? 'cell' : 'default',
            height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', fontSize: 11, paddingLeft: 4
          }}
        >
          {d ? dayjs(d).format('YYYY-MM-DD') : (isEditable ? <span style={{ color: '#bfbfbf' }}>选择/输入</span> : '-')}
        </div>
      )
    },
    {
      title: '完成',
      dataIndex: 'end_date',
      key: 'end_date',
      width: 88,
      render: (d: string, record: PlanTask) => (
        <div
          onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'end', e.currentTarget); }}
          style={{
            cursor: isEditable ? 'cell' : 'default',
            height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', fontSize: 11, paddingLeft: 4
          }}
        >
          {d ? dayjs(d).format('YYYY-MM-DD') : (isEditable ? <span style={{ color: '#bfbfbf' }}>选择/输入</span> : '-')}
        </div>
      )
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      width: 70,
      ellipsis: true,
      render: (dept: string, record: PlanTask) => (
        <div
          onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'department', e.currentTarget); }}
          style={{
            cursor: isEditable ? 'cell' : 'default',
            height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', fontSize: 11, paddingLeft: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {getDeptShortName(dept) || (isEditable ? <span style={{ color: '#bfbfbf' }}>指定</span> : '-')}
        </div>
      )
    },
    {
      title: '负责人',
      dataIndex: 'assignee_name',
      key: 'assignee_name',
      width: 55,
      ellipsis: true,
      render: (_: any, record: PlanTask) => (
        <div
          onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'assignee', e.currentTarget); }}
          style={{
            cursor: isEditable ? 'cell' : 'default',
            height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', fontSize: 11, paddingLeft: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {record.assignee_name || (isEditable ? <span style={{ color: '#bfbfbf' }}>指定</span> : '-')}
        </div>
      )
    },
    {
      title: '%完成',
      dataIndex: 'progress',
      key: 'progress',
      width: 50,
      render: (progress: number, record: PlanTask) => (
        <div
          onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'progress', e.currentTarget); }}
          style={{
            cursor: isEditable ? 'cell' : 'default',
            height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, paddingLeft: 2
          }}
        >
          <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden', minWidth: 20 }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, progress || 0))}%`,
              height: '100%',
              background: (progress || 0) >= 100 ? '#52c41a' : '#1677ff',
              borderRadius: 2,
              transition: 'width 0.2s'
            }} />
          </div>
          <span style={{ minWidth: 22, textAlign: 'right', color: '#595959' }}>{progress || 0}%</span>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 56,
      align: 'center' as const,
      render: (status: string, record: PlanTask) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return (
          <div
            onClick={(e) => { if (isEditable && !editor.visible) openEditor(record, 'status', e.currentTarget); }}
            style={{ cursor: isEditable ? 'cell' : 'default', height: '100%', minHeight: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Tag color={info.color} style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>{info.label}</Tag>
          </div>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 132,
      fixed: 'right' as const,
      render: (_: any, record: PlanTask) => isEditable ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <Button type="text" size="small" icon={<PlusOutlined />}
            onClick={() => handleAddSubTask(record)}
            title="添加子任务"
            style={{ padding: 0, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Button type="text" size="small" icon={<ArrowUpOutlined />}
            onClick={() => handleMoveTask(record, 'up')}
            title="上移"
            style={{ padding: 0, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Button type="text" size="small" icon={<ArrowDownOutlined />}
            onClick={() => handleMoveTask(record, 'down')}
            title="下移"
            style={{ padding: 0, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Button type="text" size="small" icon={<IndentLeft />}
            onClick={() => handleIndentTask(record, false)}
            title="升级"
            disabled={!record.parent_id}
            style={{ padding: 0, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Button type="text" size="small" icon={<IndentRight />}
            onClick={() => handleIndentTask(record, true)}
            title="降级"
            style={{ padding: 0, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Popconfirm title="删除该任务及子任务？" onConfirm={() => handleDeleteTask(record.id)} okText="确定" cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />}
              title="删除"
              style={{ padding: 0, width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            />
          </Popconfirm>
        </div>
      ) : null
    }
  ], [isEditable, openEditor, expandedRowKeys, handleAddSubTask, handleMoveTask, handleIndentTask, handleDeleteTask]);

  useEffect(() => {
    if (!editor.visible || !editorRef.current) return;
    const field = editor.field;
    
    const timer = setTimeout(() => {
      if (!editorRef.current) return;
      try {
        if (field === 'start' || field === 'end') {
          const input = editorRef.current.querySelector('.ant-picker-input > input') as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        } else if (field === 'type' || field === 'status' || field === 'department' || field === 'assignee' || field === 'predecessor') {
          const input = editorRef.current.querySelector('.ant-select-selection-search-input') as HTMLInputElement;
          if (input) {
            setTimeout(() => input.focus(), 50);
          }
        }
      } catch (e) {
        console.warn('Auto focus failed:', e);
      }
    }, 80);
    
    return () => clearTimeout(timer);
  }, [editor.visible, editor.field, editor.taskId]);

  const renderEditor = () => {
    if (!editor.visible || !editor.position) return null;
    const { top, left, width, height } = editor.position;
    const editorStyle: React.CSSProperties = {
      position: 'fixed',
      top: top - 1,
      left: left - 1,
      width: Math.max(width + 2, 120),
      height: height + 2,
      zIndex: 10000,
      background: '#fff',
      border: '2px solid #1677ff',
      borderRadius: 2,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      padding: 0,
      display: 'flex',
      alignItems: 'center',
      overflow: 'visible'
    };
    
    const commitOnChange = (v: any) => {
      if (!editor.taskId || !editor.field || isSavingRef.current) return;
      const taskId = editor.taskId;
      const field = editor.field;
      saveFieldValue(taskId, field, v);
    };

    const commitOnBlur = () => {
      if (!editor.taskId || !editor.field || isSavingRef.current) return;
      setTimeout(() => {
        if (isSavingRef.current) return;
        saveFieldValue(editor.taskId!, editor.field!, editor.value);
      }, 200);
    };

    const inputStyle: React.CSSProperties = { width: '100%', fontSize: 11 };
    let content: React.ReactNode = null;
    
    switch (editor.field) {
      case 'name':
        content = (
          <Input
            autoFocus
            variant="borderless"
            value={editor.value}
            onChange={e => setEditor(prev => ({ ...prev, value: e.target.value }))}
            onBlur={commitOnBlur}
            style={inputStyle}
            size="small"
          />
        );
        break;
      case 'type':
        content = (
          <Select
            key={`type-${editor.taskId}`}
            autoFocus
            variant="borderless"
            size="small"
            value={editor.value}
            onChange={(v) => {
              setEditor(prev => ({ ...prev, value: v }));
              commitOnChange(v);
            }}
            options={TASK_TYPE_OPTIONS}
            style={inputStyle}
            getPopupContainer={() => document.body}
            styles={{ popup: { root: { zIndex: 10001 } } }}
            popupMatchSelectWidth={false}
            showSearch
            optionFilterProp="label"
            defaultActiveFirstOption
          />
        );
        break;
      case 'predecessor': {
        const currentTask = tasks.find(t => t.id === editor.taskId);
        const candidatePreds = flattenTasks(tasks).filter(t =>
          t.id !== editor.taskId &&
          !(t.id === currentTask?.parent_id) &&
          !(currentTask && isDescendant(t, currentTask))
        );
        const predOptions = [
          { value: 0, label: '（无）' },
          ...candidatePreds.map(t => ({
            value: t.id,
            label: `${t.id}. ${t.task_name}`
          }))
        ];
        content = (
          <Select
            key={`pred-${editor.taskId}`}
            autoFocus
            variant="borderless"
            size="small"
            value={editor.value || 0}
            onChange={(v) => {
              setEditor(prev => ({ ...prev, value: v === 0 ? null : v }));
              commitOnChange(v === 0 ? null : v);
            }}
            options={predOptions}
            style={inputStyle}
            getPopupContainer={() => document.body}
            styles={{ popup: { root: { zIndex: 10001 } } }}
            popupMatchSelectWidth={false}
            showSearch
            optionFilterProp="label"
            defaultActiveFirstOption
            placeholder="选择前置任务"
          />
        );
        break;
      }
      case 'duration':
        content = (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
            <InputNumber
              autoFocus
              variant="borderless"
              min={1}
              max={500}
              value={editor.value}
              onChange={v => setEditor(prev => ({ ...prev, value: v }))}
              onBlur={commitOnBlur}
              style={{ flex: 1, fontSize: 11 }}
              size="small"
              controls={false}
            />
            <span style={{ padding: '0 6px', fontSize: 10, color: '#8c8c8c', borderLeft: '1px solid #f0f0f0', height: '100%', display: 'flex', alignItems: 'center', flexShrink: 0 }}>天</span>
          </div>
        );
        break;
      case 'start':
      case 'end':
        content = (
          <DatePicker
            key={`picker-${editor.taskId}-${editor.field}`}
            autoFocus
            variant="borderless"
            size="small"
            value={editor.value}
            onChange={(d) => {
              setEditor(prev => ({ ...prev, value: d }));
              commitOnChange(d);
            }}
            format="YYYY-MM-DD"
            allowClear
            style={inputStyle}
            getPopupContainer={() => document.body}
            styles={{ popup: { root: { zIndex: 10001 } } }}
            placeholder="YYYY-MM-DD"
            inputReadOnly={false}
          />
        );
        break;
      case 'department':
        content = (
          <DepartmentSelect
            key={`dept-${editor.taskId}`}
            autoFocus
            size="small"
            value={editor.value}
            onChange={(v) => {
              setEditor(prev => ({ ...prev, value: v }));
              commitOnChange(v);
            }}
            style={inputStyle}
            placeholder="选择部门"
          />
        );
        break;
      case 'assignee':
        content = (
          <FeishuUserSelect
            key={`user-${editor.taskId}`}
            autoFocus
            size="small"
            value={editor.value}
            onChange={(v) => {
              setEditor(prev => ({ ...prev, value: v }));
              commitOnChange(v);
            }}
            style={inputStyle}
            placeholder="选择负责人"
          />
        );
        break;
      case 'progress':
        content = (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
            <InputNumber
              autoFocus
              variant="borderless"
              min={0}
              max={100}
              value={editor.value}
              onChange={v => setEditor(prev => ({ ...prev, value: v }))}
              onBlur={commitOnBlur}
              style={{ flex: 1, fontSize: 11 }}
              size="small"
              controls={false}
            />
            <span style={{ padding: '0 6px', fontSize: 10, color: '#8c8c8c', borderLeft: '1px solid #f0f0f0', height: '100%', display: 'flex', alignItems: 'center', flexShrink: 0 }}>%</span>
          </div>
        );
        break;
      case 'status':
        content = (
          <Select
            key={`status-${editor.taskId}`}
            autoFocus
            variant="borderless"
            size="small"
            value={editor.value}
            onChange={(v) => {
              setEditor(prev => ({ ...prev, value: v }));
              commitOnChange(v);
            }}
            options={STATUS_OPTIONS}
            style={inputStyle}
            getPopupContainer={() => document.body}
            styles={{ popup: { root: { zIndex: 10001 } } }}
            popupMatchSelectWidth={false}
            showSearch
            optionFilterProp="label"
            defaultActiveFirstOption
          />
        );
        break;
    }
    
    return createPortal(
      <div 
        ref={editorRef} 
        style={editorStyle}
      >
        {content}
      </div>,
      document.body
    );
  };

  return (
    <div style={{ height: 'calc(100vh - 160px)', minHeight: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRadius: 6 }}>
      {msgContextHolder}

      <div style={{
        background: 'linear-gradient(to bottom, #fafafa, #f5f5f5)',
        padding: '6px 12px',
        borderBottom: '1px solid #d9d9d9',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => {
              if (dirty && !window.confirm('有未保存的更改，确定要离开吗？')) return;
              navigate(-1);
            }} size="small" type="text" />
            <Typography.Title level={4} style={{ margin: 0, fontSize: 15 }}>{plan?.plan_name || '计划'}</Typography.Title>
            {plan && <Tag color="blue" style={{ margin: 0, fontSize: 10, cursor: 'pointer' }} onClick={openVersionHistory}>{formatVersion(plan.version)} <HistoryOutlined style={{ fontSize: 9 }} /></Tag>}
            {plan && <Tag color={plan.status === 'draft' ? 'default' : plan.status === 'submitted' ? 'processing' : plan.status === 'approved' ? 'success' : 'warning'} style={{ margin: 0, fontSize: 10 }}>{plan.status === 'draft' ? '草稿' : plan.status === 'submitted' ? '审批中' : plan.status === 'approved' ? '已审批' : '已拒绝'}</Tag>}
          </div>
          <Space size={4}>
            <Tooltip title="撤销 (Ctrl+Z)">
              <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} disabled={!canUndo || !isEditable} />
            </Tooltip>
            <Tooltip title="恢复 (Ctrl+Y)">
              <Button size="small" icon={<RedoOutlined />} onClick={handleRedo} disabled={!canRedo || !isEditable} />
            </Tooltip>
            <Tooltip title={dirty ? '有未保存更改' : '所有更改已保存'}>
              <Button
                size="small"
                type={dirty ? 'primary' : 'default'}
                icon={saving ? null : (dirty ? <SaveOutlined /> : <CheckOutlined />)}
                loading={saving}
                onClick={handleSave}
                disabled={!isEditable || !dirty || saving}
              >
                {saving ? '保存中...' : dirty ? '保存' : '已保存'}
              </Button>
            </Tooltip>
            <Button size="small" icon={<CopyOutlined />} onClick={() => setTemplateModalOpen(true)} disabled={!isEditable}>应用模板</Button>
            <Button size="small" icon={<SaveOutlined />} onClick={() => setSaveTemplateModalOpen(true)}>保存模板</Button>
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSubmit}
              disabled={dirty || saving || plan?.status === 'submitted' || plan?.status === 'approved' || !isEditable}
            >
              发起审批
            </Button>
            <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button size="small" icon={<ExportOutlined />}>导出</Button>
            </Dropdown>
          </Space>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Radio.Group
            value={viewMode}
            onChange={e => setViewMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
            options={[
              { label: '任务表', value: 'list' },
              { label: '组合视图', value: 'split' },
              { label: '甘特图', value: 'gantt' }
            ]}
          />
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>
            双击单元格编辑 · Enter保存 · Esc取消 · 共 {flatAllTasks.length} 个任务
          </div>
        </div>
      </div>

      <div ref={contentAreaRef} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: viewMode === 'split' ? 'row' : 'column', background: '#fff', minHeight: 0 }}>
        {viewMode !== 'gantt' && (
          <div
            ref={tableWrapperRef}
            style={{
              flex: viewMode === 'split' ? '0 0 60%' : 1,
              overflow: 'hidden',
              borderRight: viewMode === 'split' ? '3px solid #bfbfbf' : 'none',
              background: '#fff',
              position: 'relative',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}>
            {selectedRowKeys.length > 0 && isEditable && (
              <div style={{
                padding: '3px 8px',
                background: '#e6f4ff',
                borderBottom: '1px solid #91caff',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0
              }}>
                <span>已选择 {selectedRowKeys.length} 项</span>
                <span style={{ flex: 1 }} />
                <Button size="small" type="primary" danger icon={<DeleteOutlined />} onClick={async () => {
                  try {
                    for (const key of selectedRowKeys) { await planApi.deleteTask(key as number); }
                    msgApi.success('已删除');
                    setSelectedRowKeys([]);
                    fetchPlan();
                  } catch (err: any) { msgApi.error(err?.message || '删除失败'); }
                }}>删除</Button>
              </div>
            )}
            <div ref={tableWrapRef} className="msp-table-wrap" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ResizableTable
              tableKey="project_plan_tasks"
              columns={taskColumns}
              dataSource={visibleTasks}
              rowKey="id"
              pagination={false}
              loading={loading}
              scroll={{ x: TOTAL_COLS_WIDTH, y: tableScrollY }}
              size="small"
              childrenColumnName="_antd_ignore_children_"
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                type: 'checkbox',
                columnWidth: 28,
                columnTitle: ''
              }}
              excludeKeys={['select']}
              rowClassName={() => 'msp-row'}
              summary={isEditable ? () => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={taskColumns.length}>
                      <Button
                        type="text"
                        block
                        icon={<PlusOutlined />}
                        onClick={handleAddTask}
                        style={{ color: '#1677ff', fontSize: 11, height: 28, borderRadius: 0 }}
                      >
                        + 点击添加新任务
                      </Button>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              ) : undefined}
              onRow={() => ({ style: { cursor: 'default' } })}
              style={{ width: '100%' }}
            />
            </div>
          </div>
        )}
        {viewMode !== 'list' && (
          <div ref={ganttWrapRef} style={{ flex: 1, minHeight: 0, background: '#fff', position: 'relative', overflow: 'hidden' }}>
            <GanttChart tasks={tasks} flatTasks={visibleTasks} hideLabels={viewMode === 'split'} />
          </div>
        )}
      </div>

      {renderEditor()}

      <Modal title="应用计划模板" open={templateModalOpen} onCancel={() => { setTemplateModalOpen(false); setSelectedTemplate(null); }} onOk={handleApplyTemplate} confirmLoading={applyingTemplate} okText="应用" className="modal-sm">
        <div style={{ marginBottom: 12 }}>
          <Radio.Group value={templateReplace} onChange={e => setTemplateReplace(e.target.value)}>
            <Radio value={true}>替换现有任务</Radio>
            <Radio value={false}>追加到现有任务</Radio>
          </Radio.Group>
        </div>
        <Select
          placeholder="选择模板"
          style={{ width: '100%' }}
          value={selectedTemplate}
          onChange={setSelectedTemplate}
          options={templates.map((t: any) => ({ value: t.id, label: (t.template_name || t.name) + (t.description ? ` (${t.description})` : '') }))}
          getPopupContainer={() => document.body}
        />
      </Modal>

      <Modal
        title="保存为模板"
        open={saveTemplateModalOpen}
        onCancel={() => { setSaveTemplateModalOpen(false); setTemplateName(''); setTemplateDesc(''); }}
        onOk={handleSaveTemplate}
        confirmLoading={savingTemplate}
        okText="保存"
        className="modal-sm"
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>模板名称：</Text>
          <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="输入模板名称" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>描述（可选）：</Text>
          <Input.TextArea value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} placeholder="输入模板描述" rows={3} style={{ marginTop: 4 }} />
        </div>
      </Modal>

      <Drawer
        title="版本历史"
        placement="right"
        width={520}
        open={versionHistoryOpen}
        onClose={() => { setVersionHistoryOpen(false); setViewingVersion(null); }}
      >
        {viewingVersion ? (
          <div>
            <Button size="small" onClick={closeVersionView} style={{ marginBottom: 12 }}>← 返回版本列表</Button>
            <div style={{ background: '#fafafa', padding: 12, borderRadius: 4, marginBottom: 12 }}>
              <div><Tag color="blue">{viewingVersion.version_label || formatVersion(viewingVersion.version_no)}</Tag> <Tag color={viewingVersion.status === 'approved' ? 'success' : viewingVersion.status === 'submitted' ? 'processing' : 'default'}>{viewingVersion.status === 'draft' ? '草稿' : viewingVersion.status === 'submitted' ? '审批中' : viewingVersion.status === 'approved' ? '已审批' : '已拒绝'}</Tag></div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                {viewingVersion.creator_name || '系统'} · {viewingVersion.created_at}
              </div>
            </div>
            <ResizableTable
              tableKey="project_plan_version_preview"
              size="small"
              pagination={false}
              scroll={{ y: 'calc(100vh - 220px)' }}
              dataSource={viewingVersion.snapshot?.tasks || []}
              rowKey="id"
              columns={[
                { title: '#', dataIndex: 'id', width: 36, render: (_: any, __: any, i: number) => i + 1 },
                { title: '任务名称', dataIndex: 'task_name', ellipsis: true, render: (n: string, r: any) => <span style={{ paddingLeft: ((r.level || 1) - 1) * 12 }}>{n}</span> },
                { title: '类型', dataIndex: 'task_type', width: 50, render: (t: string) => <Tag style={{ fontSize: 9, margin: 0 }}>{t === 'milestone' ? '里程碑' : t === 'phase' ? '阶段' : '任务'}</Tag> },
                { title: '开始', dataIndex: 'start_date', width: 80, render: (d: string) => d ? dayjs(d).format('MM-DD') : '' },
                { title: '结束', dataIndex: 'end_date', width: 80, render: (d: string) => d ? dayjs(d).format('MM-DD') : '' },
                { title: '进度', dataIndex: 'progress', width: 50, render: (p: number) => `${p || 0}%` },
                { title: '状态', dataIndex: 'status', width: 56, render: (s: string) => <Tag color={s === 'completed' ? 'success' : s === 'in_progress' ? 'processing' : 'default'} style={{ fontSize: 9, margin: 0 }}>{s === 'completed' ? '已完成' : s === 'in_progress' ? '进行中' : '待开始'}</Tag> }
              ]}
            />
          </div>
        ) : (
          <List
            loading={loadingVersions}
            dataSource={versions}
            locale={{ emptyText: '暂无历史版本（保存后自动创建版本）' }}
            renderItem={(v: any) => (
              <List.Item
                actions={[<Button key="view" type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewVersion(v)}>查看</Button>]}
                style={{ cursor: 'pointer' }}
                onClick={() => handleViewVersion(v)}
              >
                <List.Item.Meta
                  avatar={<Tag color="blue" style={{ margin: 0 }}>{v.version_label || formatVersion(v.version_no)}</Tag>}
                  title={
                    <Space size={4}>
                      <Tag color={v.status === 'approved' ? 'success' : v.status === 'submitted' ? 'processing' : 'default'} style={{ margin: 0, fontSize: 10 }}>
                        {v.status === 'draft' ? '草稿' : v.status === 'submitted' ? '审批中' : v.status === 'approved' ? '已审批' : '已拒绝'}
                      </Tag>
                      <span style={{ fontSize: 12 }}>{v.change_summary || ''}</span>
                    </Space>
                  }
                  description={<span style={{ fontSize: 11, color: '#888' }}>{v.creator_name || '系统'} · {v.created_at}</span>}
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>

      <style>{`

        .msp-row td {
          padding: 0 !important;
          border-bottom: 1px solid #f0f0f0 !important;
          height: 26px !important;
        }
        .msp-row:hover td {
          background: #e6f4ff !important;
        }
        .msp-table-wrap { height: 100%; flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .msp-table-wrap .ant-spin-nested-loading { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .msp-table-wrap .ant-spin-container { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .msp-table-wrap .ant-table-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .msp-table-wrap .ant-table { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .msp-table-wrap .ant-table-container { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .msp-table-wrap .ant-table-body { min-height: 0 !important; }
        .ant-table-small .ant-table-thead > tr > th {
          padding: 4px 4px !important;
          height: 26px !important;
          font-size: 11px !important;
          background: #fafafa !important;
          font-weight: 600 !important;
          border-bottom: 1px solid #d9d9d9 !important;
        }
        .ant-table-small .ant-table-thead > tr > th::before {
          display: none !important;
        }
        .ant-table-summary .ant-table-cell {
          padding: 0 !important;
          background: #fff !important;
          border-bottom: none !important;
        }
        .ant-table-body::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .ant-table-body::-webkit-scrollbar-thumb {
          background: #d9d9d9;
          border-radius: 3px;
        }
        .ant-checkbox-wrapper + .ant-checkbox-wrapper {
          margin-left: 0;
        }
        .ant-table-cell-with-append {
          padding: 0 !important;
        }
        .ant-table-selection-column {
          padding: 0 2px !important;
        }
      `}</style>
    </div>
  );
};

export default ProjectPlan;
