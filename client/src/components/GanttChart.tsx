import React, { useMemo, useRef } from 'react';
import dayjs from 'dayjs';
import { PlanTask } from '@/types';
import { Tooltip } from 'antd';

interface GanttChartProps {
  tasks: PlanTask[];
  onTaskClick?: (task: PlanTask) => void;
  hideLabels?: boolean;
  flatTasks?: PlanTask[];
}

const DAY_WIDTH = 28;
const ROW_HEIGHT = 26;
const LABEL_COL_WIDTH = 220;
const HEADER_HEIGHT = 44;

const STATUS_COLORS: Record<string, string> = {
  pending: '#d9d9d9',
  planning: '#d9d9d9',
  in_progress: '#1677ff',
  completed: '#52c41a',
  cancelled: '#bfbfbf'
};

const flattenTasks = (tasks: PlanTask[]): PlanTask[] => {
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
};

const GanttChart: React.FC<GanttChartProps> = ({ tasks, onTaskClick, hideLabels = false, flatTasks: externalFlatTasks }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const flatTasks = useMemo(() => externalFlatTasks || flattenTasks(tasks), [tasks, externalFlatTasks]);

  const { minDate, maxDate, totalDays, months } = useMemo(() => {
    if (flatTasks.length === 0) {
      const today = dayjs();
      return {
        minDate: today.subtract(3, 'day'),
        maxDate: today.add(20, 'day'),
        totalDays: 24,
        months: [{ label: today.format('YYYY年M月'), days: 24, offset: 0 }]
      };
    }

    let min = dayjs();
    let max = dayjs();
    let hasValidDate = false;

    for (const task of flatTasks) {
      if (task.start_date) {
        const sd = dayjs(task.start_date);
        if (!hasValidDate || sd.isBefore(min)) min = sd;
        hasValidDate = true;
      }
      if (task.end_date) {
        const ed = dayjs(task.end_date);
        if (!hasValidDate || ed.isAfter(max)) max = ed;
        hasValidDate = true;
      }
    }

    if (!hasValidDate) {
      const today = dayjs();
      return {
        minDate: today.subtract(3, 'day'),
        maxDate: today.add(20, 'day'),
        totalDays: 24,
        months: [{ label: today.format('YYYY年M月'), days: 24, offset: 0 }]
      };
    }

    min = min.subtract(3, 'day').startOf('day');
    max = max.add(7, 'day').endOf('day');
    const totalDays = max.diff(min, 'day') + 1;

    const monthGroups: { label: string; days: number; offset: number }[] = [];
    let cursor = min.clone();
    while (cursor.isBefore(max) || cursor.isSame(max, 'day')) {
      const monthStart = cursor.startOf('month');
      const monthEnd = cursor.endOf('month');
      const actualStart = cursor.isAfter(monthStart) ? cursor : monthStart;
      const actualEnd = max.isBefore(monthEnd) ? max : monthEnd;
      const daysInRange = actualEnd.diff(actualStart, 'day') + 1;
      monthGroups.push({
        label: cursor.format('YYYY年M月'),
        days: daysInRange,
        offset: actualStart.diff(min, 'day')
      });
      cursor = monthEnd.add(1, 'day');
    }

    return { minDate: min, maxDate: max, totalDays, months: monthGroups };
  }, [flatTasks]);

  const days = useMemo(() => {
    const arr: dayjs.Dayjs[] = [];
    let cursor = minDate.clone();
    for (let i = 0; i < totalDays; i++) {
      arr.push(cursor);
      cursor = cursor.add(1, 'day');
    }
    return arr;
  }, [minDate, totalDays]);

  const today = dayjs().startOf('day');
  const todayOffset = useMemo(() => {
    if (today.isBefore(minDate) || today.isAfter(maxDate)) return -1;
    return today.diff(minDate, 'day');
  }, [today, minDate, maxDate]);

  const isWeekend = (d: dayjs.Dayjs) => {
    const day = d.day();
    return day === 0 || day === 6;
  };

  const getBarStyle = (task: PlanTask): React.CSSProperties => {
    if (!task.start_date || !task.end_date) {
      return { display: 'none' };
    }
    const start = dayjs(task.start_date).startOf('day');
    const end = dayjs(task.end_date).endOf('day');
    const taskStart = start.isBefore(minDate) ? minDate : start;
    const taskEnd = end.isAfter(maxDate) ? maxDate : end;
    const leftDays = taskStart.diff(minDate, 'day');
    const durationDays = taskEnd.diff(taskStart.startOf('day'), 'day') + 1;

    const isMilestone = task.task_type === 'milestone' || !!task.milestone_summary;

    if (isMilestone) {
      return {
        position: 'absolute',
        left: leftDays * DAY_WIDTH + DAY_WIDTH / 2 - 7,
        top: '50%',
        transform: 'translateY(-50%) rotate(45deg)',
        width: 14,
        height: 14,
        backgroundColor: STATUS_COLORS[task.status] || STATUS_COLORS.pending,
        zIndex: 2,
        cursor: onTaskClick ? 'pointer' : 'default',
        borderRadius: 2
      };
    }

    return {
      position: 'absolute',
      left: leftDays * DAY_WIDTH + 1,
      top: 4,
      width: Math.max(durationDays * DAY_WIDTH - 2, 8),
      height: ROW_HEIGHT - 8,
      backgroundColor: STATUS_COLORS[task.status] || STATUS_COLORS.pending,
      borderRadius: 3,
      zIndex: 2,
      cursor: onTaskClick ? 'pointer' : 'default',
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px',
      color: '#fff',
      fontSize: 10,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      boxShadow: '0 1px 2px rgba(0,0,0,0.12)'
    };
  };

  const handleScroll = () => {
    if (containerRef.current && timelineRef.current) {
      const labelsCol = containerRef.current.querySelector('.gantt-labels') as HTMLElement;
      const headerMonths = containerRef.current.querySelector('.gantt-header-months') as HTMLElement;
      const headerDays = containerRef.current.querySelector('.gantt-header-days') as HTMLElement;
      if (labelsCol && !hideLabels) labelsCol.scrollTop = containerRef.current.scrollTop;
      if (headerMonths) headerMonths.scrollLeft = containerRef.current.scrollLeft;
      if (headerDays) headerDays.scrollLeft = containerRef.current.scrollLeft;
      if (timelineRef.current) {
        timelineRef.current.scrollLeft = containerRef.current.scrollLeft;
        timelineRef.current.scrollTop = containerRef.current.scrollTop;
      }
    }
  };

  const timelineWidth = totalDays * DAY_WIDTH;
  const actualLabelWidth = hideLabels ? 0 : LABEL_COL_WIDTH;

  return (
    <div
      ref={containerRef}
      className="gantt-container"
      style={{
        overflow: 'auto',
        height: '100%',
        position: 'relative',
        background: '#fff'
      }}
      onScroll={handleScroll}
    >
      <div style={{ display: 'flex', minWidth: actualLabelWidth + timelineWidth }}>
        {!hideLabels && (
          <div
            className="gantt-labels"
            style={{
              width: LABEL_COL_WIDTH,
              minWidth: LABEL_COL_WIDTH,
              position: 'sticky',
              left: 0,
              zIndex: 10,
              background: '#fff',
              borderRight: '2px solid #d9d9d9'
            }}
          >
            <div
              style={{
                height: HEADER_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontWeight: 600,
                fontSize: 11,
                borderBottom: '2px solid #d9d9d9',
                background: '#fafafa',
                position: 'sticky',
                top: 0,
                zIndex: 11,
                color: '#595959'
              }}
            >
              任务名称
            </div>
            {flatTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10 + (task.level || 0) * 14,
                  paddingRight: 8,
                  borderBottom: '1px solid #f5f5f5',
                  fontSize: 12,
                  cursor: onTaskClick ? 'pointer' : 'default',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis'
                }}
                onClick={() => onTaskClick?.(task)}
              >
                <Tooltip title={task.task_name} mouseEnterDelay={0.5}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.task_name}
                  </span>
                </Tooltip>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, position: 'relative' }}>
          <div
            className="gantt-header-months"
            style={{
              height: HEADER_HEIGHT / 2,
              display: 'flex',
              position: 'sticky',
              top: 0,
              zIndex: 9,
              background: '#fafafa',
              borderBottom: '1px solid #f0f0f0',
              overflow: 'hidden'
            }}
          >
            {months.map((m, idx) => (
              <div
                key={idx}
                style={{
                  width: m.days * DAY_WIDTH,
                  minWidth: m.days * DAY_WIDTH,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 11,
                  color: '#595959',
                  borderRight: '1px solid #f0f0f0'
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div
            className="gantt-header-days"
            style={{
              height: HEADER_HEIGHT / 2,
              display: 'flex',
              position: 'sticky',
              top: HEADER_HEIGHT / 2,
              zIndex: 9,
              background: '#fafafa',
              borderBottom: '2px solid #d9d9d9',
              overflow: 'hidden'
            }}
          >
            {days.map((d, idx) => {
              const weekend = isWeekend(d);
              return (
                <div
                  key={idx}
                  style={{
                    width: DAY_WIDTH,
                    minWidth: DAY_WIDTH,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    borderRight: '1px solid #f5f5f5',
                    background: weekend ? '#fafafa' : '#fff',
                    color: weekend ? '#999' : '#333',
                    lineHeight: 1.1
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{d.date()}</div>
                  <div style={{ fontSize: 9, color: '#999' }}>
                    {['日', '一', '二', '三', '四', '五', '六'][d.day()]}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            ref={timelineRef}
            style={{
              position: 'relative',
              width: timelineWidth,
              minWidth: timelineWidth
            }}
          >
            {flatTasks.map((task, rowIdx) => (
              <div
                key={task.id}
                style={{
                  position: 'relative',
                  height: ROW_HEIGHT,
                  borderBottom: '1px solid #f5f5f5',
                  background: rowIdx % 2 === 0 ? '#fff' : '#fcfcfc'
                }}
              >
                {days.map((d, dayIdx) => {
                  const weekend = isWeekend(d);
                  return (
                    <div
                      key={dayIdx}
                      style={{
                        position: 'absolute',
                        left: dayIdx * DAY_WIDTH,
                        top: 0,
                        width: DAY_WIDTH,
                        height: '100%',
                        borderRight: '1px solid #f5f5f5',
                        background: weekend ? 'rgba(0,0,0,0.015)' : 'transparent'
                      }}
                    />
                  );
                })}

                {todayOffset >= 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                      top: 0,
                      width: 2,
                      height: '100%',
                      backgroundColor: '#ff4d4f',
                      zIndex: 3,
                      pointerEvents: 'none'
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: -14,
                        left: -14,
                        width: 30,
                        fontSize: 9,
                        color: '#ff4d4f',
                        textAlign: 'center',
                        fontWeight: 600
                      }}
                    >
                      今天
                    </div>
                  </div>
                )}

                {task.start_date && task.end_date && (() => {
                    const sd = dayjs(task.start_date);
                    const ed = dayjs(task.end_date);
                    const durDays = ed.diff(sd, 'day') + 1;
                    const isMile = task.task_type === 'milestone' || !!task.milestone_summary;
                    return (
                      <Tooltip
                        title={
                          <div style={{ fontSize: 12 }}>
                            <div><strong>{task.task_name}</strong></div>
                            <div>负责人：{task.assignee_name || '-'}</div>
                            <div>开始：{sd.format('YYYY-MM-DD')}</div>
                            <div>结束：{ed.format('YYYY-MM-DD')}</div>
                            <div>进度：{task.progress || 0}%</div>
                          </div>
                        }
                        mouseEnterDelay={0.3}
                      >
                        <div
                          style={getBarStyle(task)}
                          onClick={() => onTaskClick?.(task)}
                        >
                          {!isMile && durDays > 3 && (
                            <span style={{ position: 'relative', zIndex: 1 }}>
                              {task.progress || 0}%
                            </span>
                          )}
                          {!isMile && (task.progress || 0) > 0 && (
                            <div
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                height: '100%',
                                width: `${task.progress || 0}%`,
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: 3,
                                zIndex: 0
                              }}
                            />
                          )}
                        </div>
                      </Tooltip>
                    );
                  })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
