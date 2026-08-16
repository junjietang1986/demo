import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';

const STORAGE_PREFIX = 'table_col_widths_v1_';

function loadWidths(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveWidths(key: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(widths));
  } catch {}
}

function getColKey(col: any, idx: number): string {
  if (col.key != null) return String(col.key);
  if (col.dataIndex != null) return String(col.dataIndex);
  return `__col_${idx}`;
}

export function useResizableColumns<RecordType = any>(
  tableKey: string,
  defaultColumns: ColumnsType<RecordType>,
  options?: { minWidth?: number; excludeKeys?: string[] }
): ColumnsType<RecordType> {
  const minWidth = options?.minWidth ?? 40;
  const excludeKeys = new Set(options?.excludeKeys ?? []);

  const [, forceUpdate] = useState(0);
  const widthsRef = useRef<Record<string, number>>({});
  const initializedRef = useRef(false);

  if (!initializedRef.current) {
    const saved = loadWidths(tableKey);
    const init: Record<string, number> = {};
    (defaultColumns as any[]).forEach((col, idx) => {
      const k = getColKey(col, idx);
      if (saved[k] && typeof saved[k] === 'number') {
        init[k] = saved[k];
      } else if (typeof col.width === 'number') {
        init[k] = col.width;
      } else if (typeof col.width === 'string' && /^\d+$/.test(col.width)) {
        init[k] = parseInt(col.width, 10);
      }
    });
    widthsRef.current = init;
    initializedRef.current = true;
  }

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const persist = useCallback(() => {
    saveWidths(tableKey, widthsRef.current);
  }, [tableKey]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const info = resizingRef.current;
    if (!info) return;
    const delta = e.clientX - info.startX;
    const newWidth = Math.max(minWidth, Math.round(info.startWidth + delta));
    if (newWidth !== widthsRef.current[info.key]) {
      widthsRef.current = { ...widthsRef.current, [info.key]: newWidth };
      forceUpdate(n => n + 1);
    }
  }, [minWidth]);

  const handleMouseUp = useCallback(() => {
    if (resizingRef.current) {
      persist();
    }
    resizingRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, persist]);

  const startResize = useCallback((key: string, startWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const columns = useMemo(() => {
    const currentWidths = widthsRef.current;
    return (defaultColumns as any[]).map((col, idx): any => {
      const k = getColKey(col, idx);
      const w = currentWidths[k] ?? (typeof col.width === 'number' ? col.width : undefined);
      const isFixed = !!col.fixed;
      const isAction = k === 'action' || excludeKeys.has(k);
      const hasNumericWidth = w != null && !isFixed && !isAction;

      const newCol: any = { ...col, width: w ?? col.width };

      if (hasNumericWidth) {
        const originalTitle = col.title;
        newCol.title = (
          <div className="resizable-col-title" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {originalTitle as any}
            </span>
            <span
              className="col-resize-handle"
              onMouseDown={(e) => startResize(k, w, e)}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            />
          </div>
        );
        const origOnHeaderCell = col.onHeaderCell;
        newCol.onHeaderCell = (record: any) => {
          const base = origOnHeaderCell ? origOnHeaderCell(record) : {};
          return {
            ...base,
            style: { ...(base.style || {}), paddingRight: 8 }
          };
        };
      }
      return newCol;
    }) as ColumnsType<RecordType>;
  }, [defaultColumns, excludeKeys, startResize]);

  return columns;
}

export function resetTableColumnWidths(tableKey?: string) {
  if (tableKey) {
    localStorage.removeItem(STORAGE_PREFIX + tableKey);
  } else {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }
}
