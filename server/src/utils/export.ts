import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

export function createSuccessResponse<T>(data: T, message = 'success') {
  return { code: 0, message, data };
}

export function createErrorResponse(message: string, code = -1) {
  return { code, message };
}

export function generateCode(prefix: string): string {
  const date = dayjs().format('YYYYMMDD');
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}${date}${random}`;
}

export async function exportToExcel(
  res: Response,
  filename: string,
  sheets: { name: string; headers: string[]; rows: any[][] }[]
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TRAC QMS System';
  workbook.created = new Date();

  sheets.forEach(sheetInfo => {
    const worksheet = workbook.addWorksheet(sheetInfo.name);
    worksheet.addRow(sheetInfo.headers);
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    sheetInfo.rows.forEach(row => worksheet.addRow(row));

    worksheet.columns.forEach((col, i) => {
      let maxLength = sheetInfo.headers[i].length;
      sheetInfo.rows.forEach(row => {
        const cellLength = String(row[i] || '').length;
        if (cellLength > maxLength) maxLength = cellLength;
      });
      col.width = Math.min(maxLength + 4, 40);
    });
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );

  await workbook.xlsx.write(res);
  res.end();
}

export function generatePDFWatermark(doc: InstanceType<typeof PDFDocument>, text: string, approverName?: string) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  doc.save();
  doc.rotate(45, { origin: [pageWidth / 2, pageHeight / 2] });
  doc.fontSize(60);
  doc.fillColor('#cccccc', 0.15);
  doc.text(text, 0, pageHeight / 2 - 50, {
    width: pageHeight,
    align: 'center'
  } as any);
  doc.restore();

  if (approverName) {
    doc.fontSize(8);
    doc.fillColor('#999999');
    doc.text(`审核人: ${approverName}  |  ${dayjs().format('YYYY-MM-DD HH:mm')}`, 50, pageHeight - 30);
  }
}

export function exportToPDF(
  res: Response,
  filename: string,
  title: string,
  content: { headers: string[]; rows: any[][] },
  options?: { watermark?: string; approverName?: string; isControlled?: boolean }
) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );

  doc.pipe(res);

  if (options?.watermark) {
    doc.on('pageAdded', () => generatePDFWatermark(doc, options.watermark!, options.approverName));
    generatePDFWatermark(doc, options.watermark, options.approverName);
  }

  doc.fontSize(18);
  doc.text(title, { align: 'center' });
  doc.moveDown(2);

  if (options?.isControlled) {
    doc.fontSize(10);
    doc.fillColor('red');
    doc.text('【受控文件】', { align: 'right' });
    doc.fillColor('black');
    doc.moveDown(1);
  }

  doc.fontSize(10);
  doc.text(`生成时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`, { align: 'right' });
  doc.moveDown(2);

  const tableTop = doc.y;
  const colCount = content.headers.length;
  const pageWidth = doc.page.width - 100;
  const colWidth = pageWidth / colCount;

  doc.fillColor('#4472C4');
  doc.rect(50, tableTop, pageWidth, 20).fill();
  doc.fillColor('#FFFFFF');
  doc.fontSize(9);
  content.headers.forEach((header, i) => {
    doc.text(header, 50 + i * colWidth + 2, tableTop + 5, { width: colWidth - 4, align: 'center' });
  });

  let yPos = tableTop + 20;
  doc.fillColor('#000000');

  content.rows.forEach((row, rowIdx) => {
    if (yPos > doc.page.height - 80) {
      doc.addPage();
      if (options?.watermark) {
        generatePDFWatermark(doc, options.watermark!, options.approverName);
      }
      yPos = 50;
    }

    if (rowIdx % 2 === 0) {
      doc.fillColor('#F2F2F2');
      doc.rect(50, yPos, pageWidth, 18).fill();
      doc.fillColor('#000000');
    }

    row.forEach((cell, i) => {
      doc.text(String(cell || ''), 50 + i * colWidth + 2, yPos + 3, {
        width: colWidth - 4,
        align: 'left'
      });
    });
    yPos += 18;
  });

  doc.end();
}

function escapeXml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toProjectDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = dayjs(d);
  if (!dt.isValid()) return '';
  return dt.format('YYYY-MM-DDTHH:mm:ss');
}

function calcDurationDays(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  const s = dayjs(start);
  const e = dayjs(end);
  if (!s.isValid() || !e.isValid()) return 1;
  return Math.max(1, e.diff(s, 'day') + 1);
}

const TASK_TYPE_LABEL: Record<string, string> = {
  milestone: '里程碑',
  phase: '阶段任务',
  task: '普通任务'
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  delayed: '已延期',
  paused: '已暂停'
};

export function exportToMSProjectXml(
  res: Response,
  filename: string,
  plan: any,
  tasks: any[]
) {
  const resources = new Map<number, { id: number; name: string; department?: string }>();
  let nextResId = 1;
  const getResourceId = (userId: number | null, userName: string | null, dept?: string): number | null => {
    if (!userId || !userName) return null;
    if (resources.has(userId)) return resources.get(userId)!.id;
    const id = nextResId++;
    resources.set(userId, { id, name: userName, department: dept });
    return id;
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    if (a.parent_id !== b.parent_id) return a.parent_id - b.parent_id;
    return a.sort_order - b.sort_order;
  });

  const msTasks = sortedTasks.map((t, idx) => {
    const isMilestone = t.task_type === 'milestone';
    const isSummary = t.children && t.children.length > 0;
    const outlineLevel = t.level || 1;
    const durationDays = isMilestone ? 0 : calcDurationDays(t.start_date, t.end_date);
    const percentComplete = Math.min(100, Math.max(0, Math.round((t.progress || 0) / 100 * 100)));
    const resId = getResourceId(t.assignee_id || null, t.assignee_name || null, t.department || undefined);
    const mppId = idx + 1;

    let priority = 500;
    if (isMilestone) priority = 700;
    else if (isSummary) priority = 600;

    const taskTypeLabel = TASK_TYPE_LABEL[t.task_type] || '普通任务';
    const statusLabel = TASK_STATUS_LABEL[t.status] || t.status || '未开始';

    return {
      mppId,
      uid: t.id,
      id: mppId,
      name: t.task_name,
      type: isMilestone ? 0 : 1,
      isNull: 0,
      createDate: t.created_at ? toProjectDate(t.created_at) : toProjectDate(dayjs().format('YYYY-MM-DD')),
      outlineLevel,
      priority,
      start: toProjectDate(t.start_date),
      finish: toProjectDate(t.end_date),
      duration: `PT${durationDays * 8}H0M0S`,
      durationFormat: 7,
      work: `PT${durationDays * 8}H0M0S`,
      milestone: isMilestone ? 1 : 0,
      summary: isSummary ? 1 : 0,
      percentComplete,
      percentWorkComplete: percentComplete,
      notes: t.milestone_summary || '',
      constraintType: 4,
      constraintDate: toProjectDate(t.start_date),
      actualStart: t.actual_start_date ? toProjectDate(t.actual_start_date) : '',
      actualFinish: t.actual_end_date ? toProjectDate(t.actual_end_date) : '',
      remainingDuration: `PT${Math.max(0, Math.round(durationDays * (1 - (t.progress || 0) / 100))) * 8}H0M0S`,
      resId,
      parent_id: t.parent_id || 0,
      predecessor_id: t.predecessor_id || 0,
      scheduling_mode: t.scheduling_mode || 'auto',
      sort_order: t.sort_order || 0,
      department: t.department || '',
      assigneeName: t.assignee_name || '',
      taskTypeLabel,
      statusLabel,
      progress: t.progress || 0,
      durationDays
    };
  });

  const siblingGroups = new Map<number, typeof msTasks>();
  msTasks.forEach(mt => {
    const key = mt.parent_id || 0;
    if (!siblingGroups.has(key)) siblingGroups.set(key, []);
    siblingGroups.get(key)!.push(mt);
  });
  const autoPredecessorMap = new Map<number, number>();
  siblingGroups.forEach(siblings => {
    siblings.sort((a, b) => a.sort_order - b.sort_order);
    let lastNonSummary: typeof msTasks[0] | null = null;
    for (let i = 0; i < siblings.length; i++) {
      const curr = siblings[i];
      if (!curr.summary && lastNonSummary && !curr.predecessor_id) {
        autoPredecessorMap.set(curr.uid, lastNonSummary.uid);
      }
      if (!curr.summary) {
        lastNonSummary = curr;
      }
    }
  });

  const assignments: { uid: number; taskUid: number; resId: number; units: number; work: string; start: string; finish: string }[] = [];
  let nextAssignId = 1;
  msTasks.forEach(mt => {
    if (mt.resId) {
      assignments.push({
        uid: nextAssignId++,
        taskUid: mt.uid,
        resId: mt.resId,
        units: 1,
        work: mt.work,
        start: mt.start,
        finish: mt.finish
      });
    }
  });

  const projectStart = msTasks.length > 0
    ? (msTasks.reduce((min, t) => t.start && (!min || t.start < min) ? t.start : min, '' as string) || toProjectDate(dayjs().format('YYYY-MM-DD')))
    : toProjectDate(dayjs().format('YYYY-MM-DD'));
  const projectFinish = msTasks.length > 0
    ? (msTasks.reduce((max, t) => t.finish && (!max || t.finish > max) ? t.finish : max, '' as string) || projectStart)
    : projectStart;

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  xml += '<Project xmlns="http://schemas.microsoft.com/project">\n';
  xml += `  <SaveVersion>14</SaveVersion>\n`;
  xml += `  <Name>${escapeXml(plan.plan_name)}</Name>\n`;
  xml += `  <Title>${escapeXml(plan.plan_name)}</Title>\n`;
  xml += `  <Subject>${escapeXml(plan.project_name || '')}</Subject>\n`;
  xml += `  <Author>${escapeXml(plan.creator_name || 'TRAC QMS')}</Author>\n`;
  xml += `  <Company>${escapeXml(plan.department || '')}</Company>\n`;
  xml += `  <Manager>${escapeXml(plan.creator_name || '')}</Manager>\n`;
  xml += `  <CreationDate>${toProjectDate(dayjs().format('YYYY-MM-DD HH:mm:ss'))}</CreationDate>\n`;
  xml += `  <LastSaved>${toProjectDate(dayjs().format('YYYY-MM-DD HH:mm:ss'))}</LastSaved>\n`;
  xml += `  <ScheduleFromStart>1</ScheduleFromStart>\n`;
  xml += `  <StartDate>${projectStart}</StartDate>\n`;
  xml += `  <FinishDate>${projectFinish}</FinishDate>\n`;
  xml += `  <FYStartDate>1</FYStartDate>\n`;
  xml += `  <CriticalSlackLimit>0</CriticalSlackLimit>\n`;
  xml += `  <CurrencyDigits>2</CurrencyDigits>\n`;
  xml += `  <CurrencySymbol>¥</CurrencySymbol>\n`;
  xml += `  <CurrencyCode>CNY</CurrencyCode>\n`;
  xml += `  <CalendarUID>1</CalendarUID>\n`;
  xml += `  <DefaultStartTime>08:00:00</DefaultStartTime>\n`;
  xml += `  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n`;
  xml += `  <MinutesPerDay>480</MinutesPerDay>\n`;
  xml += `  <MinutesPerWeek>2400</MinutesPerWeek>\n`;
  xml += `  <DaysPerMonth>20</DaysPerMonth>\n`;
  xml += `  <DefaultTaskType>1</DefaultTaskType>\n`;
  xml += `  <DefaultFixedCostAccrual>3</DefaultFixedCostAccrual>\n`;
  xml += `  <DefaultStandardRate>0</DefaultStandardRate>\n`;
  xml += `  <DefaultOvertimeRate>0</DefaultOvertimeRate>\n`;
  xml += `  <DurationFormat>7</DurationFormat>\n`;
  xml += `  <WorkFormat>2</WorkFormat>\n`;
  xml += `  <EditableActualCosts>0</EditableActualCosts>\n`;
  xml += `  <HonorConstraints>1</HonorConstraints>\n`;
  xml += `  <InsertedProjectsLikeSummary>1</InsertedProjectsLikeSummary>\n`;
  xml += `  <MultipleCriticalPaths>0</MultipleCriticalPaths>\n`;
  xml += `  <NewTasksEffortDriven>0</NewTasksEffortDriven>\n`;
  xml += `  <NewTasksEstimated>0</NewTasksEstimated>\n`;
  xml += `  <SplitsInProgressTasks>1</SplitsInProgressTasks>\n`;
  xml += `  <SpreadActualCost>1</SpreadActualCost>\n`;
  xml += `  <SpreadPercentComplete>0</SpreadPercentComplete>\n`;
  xml += `  <TaskUpdatesResource>1</TaskUpdatesResource>\n`;
  xml += `  <FiscalYearStart>0</FiscalYearStart>\n`;
  xml += `  <WeekStartDay>1</WeekStartDay>\n`;
  xml += `  <NewTaskStartDate>0</NewTaskStartDate>\n`;
  xml += `  <AutoAddNewResourcesAndTasks>1</AutoAddNewResourcesAndTasks>\n`;
  xml += `  <DefaultTaskEVMethod>0</DefaultTaskEVMethod>\n`;
  xml += `  <ProjectExternallyEdited>0</ProjectExternallyEdited>\n`;
  xml += `  <ExtendedCreationDate>${toProjectDate(dayjs().format('YYYY-MM-DD HH:mm:ss'))}</ExtendedCreationDate>\n`;
  xml += `  <ActualsInSync>0</ActualsInSync>\n`;
  xml += `  <RemoveFileProperties>0</RemoveFileProperties>\n`;
  xml += `  <AdminProject>0</AdminProject>\n`;

  xml += `  <ExtendedAttributes>\n`;
  xml += `    <ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName><Alias>任务类型</Alias></ExtendedAttribute>\n`;
  xml += `    <ExtendedAttribute><FieldID>188743734</FieldID><FieldName>Text4</FieldName><Alias>部门</Alias></ExtendedAttribute>\n`;
  xml += `    <ExtendedAttribute><FieldID>188743732</FieldID><FieldName>Text2</FieldName><Alias>状态</Alias></ExtendedAttribute>\n`;
  xml += `    <ExtendedAttribute><FieldID>188743733</FieldID><FieldName>Text3</FieldName><Alias>负责人</Alias></ExtendedAttribute>\n`;
  xml += `    <ExtendedAttribute><FieldID>188743787</FieldID><FieldName>Number1</FieldName><Alias>完成度(%)</Alias></ExtendedAttribute>\n`;
  xml += `    <ExtendedAttribute><FieldID>188743769</FieldID><FieldName>Duration1</FieldName><Alias>工期(天)</Alias></ExtendedAttribute>\n`;
  xml += `  </ExtendedAttributes>\n`;

  xml += `  <Calendars>\n`;
  xml += `    <Calendar>\n`;
  xml += `      <UID>1</UID>\n`;
  xml += `      <Name>标准</Name>\n`;
  xml += `      <IsBaseCalendar>1</IsBaseCalendar>\n`;
  xml += `      <BaseCalendarUID>-1</BaseCalendarUID>\n`;
  xml += `      <WeekDays>\n`;
  for (let d = 1; d <= 7; d++) {
    const isWorkDay = d >= 1 && d <= 5;
    xml += `        <WeekDay>\n`;
    xml += `          <DayType>${d}</DayType>\n`;
    xml += `          <DayWorking>${isWorkDay ? 1 : 0}</DayWorking>\n`;
    if (isWorkDay) {
      xml += `          <WorkingTimes>\n`;
      xml += `            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>\n`;
      xml += `            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>\n`;
      xml += `          </WorkingTimes>\n`;
    }
    xml += `        </WeekDay>\n`;
  }
  xml += `      </WeekDays>\n`;
  xml += `    </Calendar>\n`;
  xml += `  </Calendars>\n`;

  xml += `  <Tasks>\n`;
  xml += `    <Task>\n`;
  xml += `      <UID>0</UID>\n`;
  xml += `      <ID>0</ID>\n`;
  xml += `      <Name>${escapeXml(plan.plan_name)}</Name>\n`;
  xml += `      <Type>1</Type>\n`;
  xml += `      <IsNull>0</IsNull>\n`;
  xml += `      <CreateDate>${toProjectDate(dayjs().format('YYYY-MM-DD HH:mm:ss'))}</CreateDate>\n`;
  xml += `      <OutlineLevel>0</OutlineLevel>\n`;
  xml += `      <Priority>500</Priority>\n`;
  xml += `      <Start>${projectStart}</Start>\n`;
  xml += `      <Finish>${projectFinish}</Finish>\n`;
  xml += `      <DurationFormat>7</DurationFormat>\n`;
  xml += `      <Work>PT0H0M0S</Work>\n`;
  xml += `      <Summary>1</Summary>\n`;
  xml += `      <Milestone>0</Milestone>\n`;
  xml += `      <PercentComplete>0</PercentComplete>\n`;
  xml += `      <PercentWorkComplete>0</PercentWorkComplete>\n`;
  xml += `      <ConstraintType>4</ConstraintType>\n`;
  xml += `      <CalendarUID>1</CalendarUID>\n`;
  xml += `    </Task>\n`;

  msTasks.forEach(mt => {
    xml += `    <Task>\n`;
    xml += `      <UID>${mt.uid}</UID>\n`;
    xml += `      <ID>${mt.id}</ID>\n`;
    xml += `      <Name>${escapeXml(mt.name)}</Name>\n`;
    xml += `      <Type>${mt.type}</Type>\n`;
    xml += `      <IsNull>${mt.isNull}</IsNull>\n`;
    xml += `      <CreateDate>${mt.createDate}</CreateDate>\n`;
    xml += `      <OutlineLevel>${mt.outlineLevel}</OutlineLevel>\n`;
    xml += `      <Priority>${mt.priority}</Priority>\n`;
    if (mt.start) xml += `      <Start>${mt.start}</Start>\n`;
    if (mt.finish) xml += `      <Finish>${mt.finish}</Finish>\n`;
    xml += `      <Duration>${mt.duration}</Duration>\n`;
    xml += `      <DurationFormat>${mt.durationFormat}</DurationFormat>\n`;
    xml += `      <Work>${mt.work}</Work>\n`;
    xml += `      <Milestone>${mt.milestone}</Milestone>\n`;
    xml += `      <Summary>${mt.summary}</Summary>\n`;
    xml += `      <PercentComplete>${mt.percentComplete}</PercentComplete>\n`;
    xml += `      <PercentWorkComplete>${mt.percentWorkComplete}</PercentWorkComplete>\n`;
    if (mt.notes) xml += `      <Notes>${escapeXml(mt.notes)}</Notes>\n`;
    xml += `      <ConstraintType>${mt.constraintType}</ConstraintType>\n`;
    if (mt.constraintDate) xml += `      <ConstraintDate>${mt.constraintDate}</ConstraintDate>\n`;
    if (mt.scheduling_mode === 'manual') {
      xml += `      <Manual>1</Manual>\n`;
    } else {
      xml += `      <Manual>0</Manual>\n`;
    }
    if (mt.actualStart) xml += `      <ActualStart>${mt.actualStart}</ActualStart>\n`;
    if (mt.actualFinish) xml += `      <ActualFinish>${mt.actualFinish}</ActualFinish>\n`;
    if (mt.remainingDuration) xml += `      <RemainingDuration>${mt.remainingDuration}</RemainingDuration>\n`;
    if (mt.summary) {
      xml += `      <Rollup>1</Rollup>\n`;
    }

    xml += `      <ExtendedAttribute><FieldID>188743731</FieldID><Value>${escapeXml(mt.taskTypeLabel)}</Value></ExtendedAttribute>\n`;
    if (mt.department) xml += `      <ExtendedAttribute><FieldID>188743734</FieldID><Value>${escapeXml(mt.department)}</Value></ExtendedAttribute>\n`;
    xml += `      <ExtendedAttribute><FieldID>188743732</FieldID><Value>${escapeXml(mt.statusLabel)}</Value></ExtendedAttribute>\n`;
    if (mt.assigneeName) xml += `      <ExtendedAttribute><FieldID>188743733</FieldID><Value>${escapeXml(mt.assigneeName)}</Value></ExtendedAttribute>\n`;
    xml += `      <ExtendedAttribute><FieldID>188743787</FieldID><Value>${mt.progress}</Value></ExtendedAttribute>\n`;
    xml += `      <ExtendedAttribute><FieldID>188743769</FieldID><Value>P${mt.durationDays * 8}H0M0S</Value></ExtendedAttribute>\n`;

    const predUid = mt.predecessor_id || autoPredecessorMap.get(mt.uid);
    if (predUid) {
      xml += `      <PredecessorLink>\n`;
      xml += `        <PredecessorUID>${predUid}</PredecessorUID>\n`;
      xml += `        <Type>1</Type>\n`;
      xml += `        <CrossProject>0</CrossProject>\n`;
      xml += `        <LinkLag>0</LinkLag>\n`;
      xml += `        <LagFormat>7</LagFormat>\n`;
      xml += `      </PredecessorLink>\n`;
    }

    xml += `    </Task>\n`;
  });

  xml += `  </Tasks>\n`;

  xml += `  <Resources>\n`;
  resources.forEach(r => {
    xml += `    <Resource>\n`;
    xml += `      <UID>${r.id}</UID>\n`;
    xml += `      <ID>${r.id}</ID>\n`;
    xml += `      <Name>${escapeXml(r.name)}</Name>\n`;
    xml += `      <Type>1</Type>\n`;
    xml += `      <IsNull>0</IsNull>\n`;
    xml += `      <Initials>${escapeXml((r.name || '').substring(0, 2))}</Initials>\n`;
    if (r.department) xml += `      <Group>${escapeXml(r.department)}</Group>\n`;
    xml += `      <MaxUnits>1</MaxUnits>\n`;
    xml += `      <PeakUnits>1</PeakUnits>\n`;
    xml += `      <CalendarUID>1</CalendarUID>\n`;
    xml += `    </Resource>\n`;
  });
  xml += `  </Resources>\n`;

  xml += `  <Assignments>\n`;
  assignments.forEach(a => {
    xml += `    <Assignment>\n`;
    xml += `      <UID>${a.uid}</UID>\n`;
    xml += `      <TaskUID>${a.taskUid}</TaskUID>\n`;
    xml += `      <ResourceUID>${a.resId}</ResourceUID>\n`;
    xml += `      <PercentWorkComplete>0</PercentWorkComplete>\n`;
    xml += `      <Units>${a.units}</Units>\n`;
    xml += `      <Work>${a.work}</Work>\n`;
    if (a.start) xml += `      <Start>${a.start}</Start>\n`;
    if (a.finish) xml += `      <Finish>${a.finish}</Finish>\n`;
    xml += `    </Assignment>\n`;
  });
  xml += `  </Assignments>\n`;

  xml += `  <Tables>\n`;
  xml += `    <Table>\n`;
  xml += `      <Name>TRAC计划任务表</Name>\n`;
  xml += `      <ID>1</ID>\n`;
  xml += `      <TaskTable>1</TaskTable>\n`;
  xml += `      <TableFields>\n`;
  xml += `        <TableField><FieldID>188743694</FieldID><Width>10</Width><Title>ID</Title><AlignTitle>1</AlignTitle><AlignData>1</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743731</FieldID><Width>8</Width><Title>任务类型</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743695</FieldID><Width>38</Width><Title>任务名称</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743709</FieldID><Width>8</Width><Title>工期</Title><AlignTitle>1</AlignTitle><AlignData>1</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743706</FieldID><Width>14</Width><Title>开始时间</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743707</FieldID><Width>14</Width><Title>完成时间</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743734</FieldID><Width>12</Width><Title>部门</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743733</FieldID><Width>10</Width><Title>负责人</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743712</FieldID><Width>8</Width><Title>完成百分比</Title><AlignTitle>1</AlignTitle><AlignData>1</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743732</FieldID><Width>10</Width><Title>状态</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743710</FieldID><Width>8</Width><Title>前置任务</Title><AlignTitle>1</AlignTitle><AlignData>0</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743716</FieldID><Width>8</Width><Title>里程碑</Title><AlignTitle>1</AlignTitle><AlignData>1</AlignData></TableField>\n`;
  xml += `        <TableField><FieldID>188743713</FieldID><Width>8</Width><Title>成本</Title><AlignTitle>1</AlignTitle><AlignData>1</AlignData></TableField>\n`;
  xml += `      </TableFields>\n`;
  xml += `    </Table>\n`;
  xml += `  </Tables>\n`;

  xml += `  <Views>\n`;
  xml += `    <View>\n`;
  xml += `      <Name>TRAC甘特图</Name>\n`;
  xml += `      <Type>0</Type>\n`;
  xml += `      <Screen>1</Screen>\n`;
  xml += `      <ShowInMenu>1</ShowInMenu>\n`;
  xml += `      <TableID>1</TableID>\n`;
  xml += `      <FilterID>65535</FilterID>\n`;
  xml += `      <GroupID>65535</GroupID>\n`;
  xml += `    </View>\n`;
  xml += `  </Views>\n`;

  xml += `</Project>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );
  res.send(xml);
}
