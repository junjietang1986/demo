import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Table } from 'antd';
import type { TableProps, ColumnsType, ColumnType } from 'antd/es/table';

const STORAGE_PREFIX = 'table_col_widths_';
const MIN_WIDTH = 60;

function loadWidths(tableKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableKey);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveWidths(tableKey: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + tableKey, JSON.stringify(widths));
  } catch {}
}

type ResizableTableProps<RecordType = any> = Omit<TableProps<RecordType>, 'columns'> & {
  tableKey: string;
  columns: ColumnsType<RecordType>;
  minWidth?: number;
  excludeKeys?: string[];
};

function ResizableTableInner<RecordType extends object = any>({
  tableKey,
  columns: defaultColumns,
  minWidth = MIN_WIDTH,
  excludeKeys = [],
  ...restProps
}: ResizableTableProps<RecordType>) {
  const [columns, setColumns] = useState<ColumnsType<RecordType>>(() => {
    const saved = loadWidths(tableKey);
    return (defaultColumns || []).map(col => {
      const key = String((col as ColumnType<RecordType>).key ?? (col as ColumnType<RecordType>).dataIndex);
      const c = { ...col } as ColumnType<RecordType>;
      if (key && !excludeKeys.includes(key)) {
        const savedWidth = saved[key];
        if (savedWidth && typeof savedWidth === 'number') {
          c.width = savedWidth;
        }
      }
      return c;
    });
  });

  useEffect(() => {
    const saved = loadWidths(tableKey);
    setColumns((defaultColumns || []).map(col => {
      const key = String((col as ColumnType<RecordType>).key ?? (col as ColumnType<RecordType>).dataIndex);
      const c = { ...col } as ColumnType<RecordType>;
      if (key && !excludeKeys.includes(key)) {
        const savedWidth = saved[key];
        if (savedWidth && typeof savedWidth === 'number') {
          c.width = savedWidth;
        }
      }
      return c;
    }));
  }, [defaultColumns, tableKey]);

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const r = resizingRef.current;
    if (!r) return;
    const diff = e.clientX - r.startX;
    const newWidth = Math.max(minWidth, r.startWidth + diff);
    setColumns(prev => prev.map(c => {
      const key = String((c as ColumnType<RecordType>).key ?? (c as ColumnType<RecordType>).dataIndex);
      if (key === r.key) {
        return { ...c, width: newWidth };
      }
      return c;
    }));
  }, [minWidth]);

  const handleMouseUp = useCallback(() => {
    const r = resizingRef.current;
    if (r) {
      setColumns(prev => {
        const widths: Record<string, number> = {};
        prev.forEach(c => {
          const key = String((c as ColumnType<RecordType>).key ?? (c as ColumnType<RecordType>).dataIndex);
          if (key && c.width && typeof c.width === 'number') {
            widths[key] = c.width;
          }
        });
        saveWidths(tableKey, widths);
        return prev;
      });
    }
    resizingRef.current = null;
    setResizingKey(null);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove, tableKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent, key: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startWidth: currentWidth };
    setResizingKey(key);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handleMouseMove, handleMouseUp]);

  const processedColumns = useMemo(() => {
    return columns.map((col, index) => {
      const key = String((col as ColumnType<RecordType>).key ?? (col as ColumnType<RecordType>).dataIndex);
      const c = { ...col } as ColumnType<RecordType>;

      if (key && !excludeKeys.includes(key)) {
        const width = typeof c.width === 'number' ? c.width : (c.width ? parseInt(String(c.width)) || 120 : 120);
        const prevTitle = c.title;
        c.title = (
          <div style={{ position: 'relative', display: 'inline-block', width: '100%', paddingRight: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prevTitle as React.ReactNode}
            </div>
            <div
              className="col-resize-handle"
              onMouseDown={(e) => handleMouseDown(e, key, width)}
              style={{
                position: 'absolute',
                top: 0,
                right: -4,
                width: 8,
                height: '100%',
                cursor: 'col-resize',
                zIndex: 3,
                background: resizingKey === key ? '#1a73e8' : 'transparent',
              }}
            />
          </div>
        );
        c.width = width;
      }
      return c;
    });
  }, [columns, excludeKeys, handleMouseDown, resizingKey]);

  const scrollX = useMemo(() => {
    const total = processedColumns.reduce((sum, c) => {
      const w = typeof c.width === 'number' ? c.width : 120;
      return sum + w;
    }, 0);
    return total + (restProps.scroll?.x ? 0 : 40);
  }, [processedColumns, restProps.scroll?.x]);

  return (
    <Table<RecordType>
      {...restProps}
      columns={processedColumns}
      scroll={{
        ...restProps.scroll,
        x: restProps.scroll?.x ?? scrollX,
      }}
      tableLayout={restProps.tableLayout ?? 'fixed'}
    />
  );
}

export const ResizableTable = ResizableTableInner as <RecordType extends object = any>(
  props: ResizableTableProps<RecordType>
) => React.ReactElement;
