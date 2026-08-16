import express, { Request, Response } from 'express';
import { getDb } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { createSuccessResponse, createErrorResponse, exportToExcel } from '../utils/export';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(quarterOfYear);

const router = express.Router();

router.use(authMiddleware);

function buildOplWhereClause(params: any) {
  let whereClauses: string[] = [];
  let queryParams: any[] = [];

  if (params.start_date) {
    whereClauses.push('o.occurrence_date >= ?');
    queryParams.push(params.start_date);
  }
  if (params.end_date) {
    whereClauses.push('o.occurrence_date <= ?');
    queryParams.push(params.end_date);
  }
  if (params.project_id) {
    whereClauses.push('o.project_id = ?');
    queryParams.push(Number(params.project_id));
  }
  if (params.department) {
    whereClauses.push('o.responsible_dept = ?');
    queryParams.push(params.department);
  }
  if (params.status) {
    whereClauses.push('o.status = ?');
    queryParams.push(params.status);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, queryParams };
}

function buildAnomalyWhereClause(params: any) {
  let whereClauses: string[] = [];
  let queryParams: any[] = [];

  if (params.start_date) {
    whereClauses.push('a.occurrence_date >= ?');
    queryParams.push(params.start_date);
  }
  if (params.end_date) {
    whereClauses.push('a.occurrence_date <= ?');
    queryParams.push(params.end_date);
  }
  if (params.project_id) {
    whereClauses.push('a.project_id = ?');
    queryParams.push(Number(params.project_id));
  }
  if (params.department) {
    whereClauses.push('a.responsible_dept = ?');
    queryParams.push(params.department);
  }
  if (params.status) {
    whereClauses.push('a.status = ?');
    queryParams.push(params.status);
  }
  if (params.anomaly_type) {
    whereClauses.push('a.anomaly_type = ?');
    queryParams.push(params.anomaly_type);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, queryParams };
}

// GET /opl - OPL statistics
router.get('/opl', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { period = 'month', start_date, end_date, project_id, department } = req.query;

    let dateFrom = start_date as string;
    let dateTo = end_date as string;

    if (!dateFrom || !dateTo) {
      const now = dayjs();
      if (period === 'year') {
        dateFrom = now.startOf('year').format('YYYY-MM-DD');
        dateTo = now.endOf('year').format('YYYY-MM-DD');
      } else if (period === 'quarter') {
        dateFrom = now.startOf('quarter').format('YYYY-MM-DD');
        dateTo = now.endOf('quarter').format('YYYY-MM-DD');
      } else {
        dateFrom = now.startOf('month').format('YYYY-MM-DD');
        dateTo = now.endOf('month').format('YYYY-MM-DD');
      }
    }

    const { whereSql, queryParams } = buildOplWhereClause({ start_date: dateFrom, end_date: dateTo, project_id, department });

    const totalResult = db.prepare(`SELECT COUNT(*) as count FROM opl_records o ${whereSql}`).get(...queryParams) as any;
    const total = totalResult.count;

    const byStatus = db.prepare(`
      SELECT o.status, COUNT(*) as count
      FROM opl_records o
      ${whereSql}
      GROUP BY o.status
    `).all(...queryParams);

    const byDept = db.prepare(`
      SELECT o.responsible_dept, COUNT(*) as count
      FROM opl_records o
      ${whereSql}
      GROUP BY o.responsible_dept
      ORDER BY count DESC
    `).all(...queryParams);

    const byMonth = db.prepare(`
      SELECT substr(o.occurrence_date, 1, 7) as month, COUNT(*) as count
      FROM opl_records o
      ${whereSql}
      GROUP BY substr(o.occurrence_date, 1, 7)
      ORDER BY month ASC
    `).all(...queryParams);

    const closedCount = (byStatus as any[]).find((s: any) => s.status === 'closed')?.count || 0;
    const openCount = (byStatus as any[]).find((s: any) => s.status === 'open')?.count || 0;
    const closeRate = total > 0 ? Math.round((closedCount / total) * 10000) / 100 : 0;

    const detailSql = `
      SELECT o.*,
        u1.name as responsible_person_name,
        u2.name as handler_name
      FROM opl_records o
      LEFT JOIN users u1 ON o.responsible_person_id = u1.id
      LEFT JOIN users u2 ON o.handler_id = u2.id
      ${whereSql}
      ORDER BY o.occurrence_date DESC
    `;
    const records = db.prepare(detailSql).all(...queryParams);

    res.json(createSuccessResponse({
      summary: {
        total,
        open_count: openCount,
        closed_count: closedCount,
        close_rate: closeRate,
        period,
        date_range: { start: dateFrom, end: dateTo }
      },
      by_status: byStatus,
      by_department: byDept,
      by_month: byMonth,
      records
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取OPL统计失败'));
  }
});

// GET /anomaly - Anomaly statistics
router.get('/anomaly', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { period = 'month', start_date, end_date, project_id, department, anomaly_type } = req.query;

    let dateFrom = start_date as string;
    let dateTo = end_date as string;

    if (!dateFrom || !dateTo) {
      const now = dayjs();
      if (period === 'year') {
        dateFrom = now.startOf('year').format('YYYY-MM-DD');
        dateTo = now.endOf('year').format('YYYY-MM-DD');
      } else if (period === 'quarter') {
        dateFrom = now.startOf('quarter').format('YYYY-MM-DD');
        dateTo = now.endOf('quarter').format('YYYY-MM-DD');
      } else {
        dateFrom = now.startOf('month').format('YYYY-MM-DD');
        dateTo = now.endOf('month').format('YYYY-MM-DD');
      }
    }

    const { whereSql, queryParams } = buildAnomalyWhereClause({ start_date: dateFrom, end_date: dateTo, project_id, department, anomaly_type });

    const totalResult = db.prepare(`SELECT COUNT(*) as count FROM anomaly_records a ${whereSql}`).get(...queryParams) as any;
    const total = totalResult.count;

    const byStatus = db.prepare(`
      SELECT a.status, COUNT(*) as count
      FROM anomaly_records a
      ${whereSql}
      GROUP BY a.status
    `).all(...queryParams);

    const byDept = db.prepare(`
      SELECT a.responsible_dept, COUNT(*) as count
      FROM anomaly_records a
      ${whereSql}
      GROUP BY a.responsible_dept
      ORDER BY count DESC
    `).all(...queryParams);

    const byMonth = db.prepare(`
      SELECT substr(a.occurrence_date, 1, 7) as month, COUNT(*) as count
      FROM anomaly_records a
      ${whereSql}
      GROUP BY substr(a.occurrence_date, 1, 7)
      ORDER BY month ASC
    `).all(...queryParams);

    const byType = db.prepare(`
      SELECT a.anomaly_type, COUNT(*) as count
      FROM anomaly_records a
      ${whereSql}
      GROUP BY a.anomaly_type
    `).all(...queryParams);

    const closedCount = (byStatus as any[]).find((s: any) => s.status === 'closed')?.count || 0;
    const openCount = (byStatus as any[]).find((s: any) => s.status === 'open')?.count || 0;
    const closeRate = total > 0 ? Math.round((closedCount / total) * 10000) / 100 : 0;

    const detailSql = `
      SELECT a.*,
        u1.name as responsible_person_name,
        u2.name as project_manager_name,
        u3.name as designer_name
      FROM anomaly_records a
      LEFT JOIN users u1 ON a.responsible_person_id = u1.id
      LEFT JOIN users u2 ON a.project_manager_id = u2.id
      LEFT JOIN users u3 ON a.designer_id = u3.id
      ${whereSql}
      ORDER BY a.occurrence_date DESC
    `;
    const records = db.prepare(detailSql).all(...queryParams);

    res.json(createSuccessResponse({
      summary: {
        total,
        open_count: openCount,
        closed_count: closedCount,
        close_rate: closeRate,
        period,
        date_range: { start: dateFrom, end: dateTo }
      },
      by_status: byStatus,
      by_department: byDept,
      by_month: byMonth,
      by_type: byType,
      records
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取异常统计失败'));
  }
});

// GET /project/:id - Project summary report
router.get('/project/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const projectId = Number(id);

    const project = db.prepare(`
      SELECT p.*,
        u1.name as mech_designer_name,
        u2.name as elec_designer_name,
        u3.name as test_designer_name,
        u4.name as project_manager_name,
        u5.name as electrician_lead_name,
        u6.name as fitter_lead_name,
        u7.name as created_by_name
      FROM projects p
      LEFT JOIN users u1 ON p.mech_designer_id = u1.id
      LEFT JOIN users u2 ON p.elec_designer_id = u2.id
      LEFT JOIN users u3 ON p.test_designer_id = u3.id
      LEFT JOIN users u4 ON p.project_manager_id = u4.id
      LEFT JOIN users u5 ON p.electrician_lead_id = u5.id
      LEFT JOIN users u6 ON p.fitter_lead_id = u6.id
      LEFT JOIN users u7 ON p.created_by = u7.id
      WHERE p.id = ?
    `).get(projectId);

    if (!project) {
      return res.status(404).json(createErrorResponse('项目不存在'));
    }

    const planCount = db.prepare('SELECT COUNT(*) as count FROM project_plans WHERE project_id = ?').get(projectId) as any;
    const latestPlan = db.prepare(`
      SELECT pp.*, COUNT(pt.id) as task_count,
        SUM(CASE WHEN pt.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN pt.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
        SUM(CASE WHEN pt.status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
        AVG(pt.progress) as avg_progress
      FROM project_plans pp
      LEFT JOIN plan_tasks pt ON pp.id = pt.plan_id
      WHERE pp.project_id = ?
      GROUP BY pp.id
      ORDER BY pp.version DESC
      LIMIT 1
    `).get(projectId);

    const oplCount = db.prepare('SELECT COUNT(*) as count FROM opl_records WHERE project_id = ?').get(projectId) as any;
    const oplClosedCount = db.prepare("SELECT COUNT(*) as count FROM opl_records WHERE project_id = ? AND status = 'closed'").get(projectId) as any;
    const oplOpenCount = db.prepare("SELECT COUNT(*) as count FROM opl_records WHERE project_id = ? AND status = 'open'").get(projectId) as any;

    const anomalyCount = db.prepare('SELECT COUNT(*) as count FROM anomaly_records WHERE project_id = ?').get(projectId) as any;
    const anomalyClosedCount = db.prepare("SELECT COUNT(*) as count FROM anomaly_records WHERE project_id = ? AND status = 'closed'").get(projectId) as any;
    const anomalyOpenCount = db.prepare("SELECT COUNT(*) as count FROM anomaly_records WHERE project_id = ? AND status = 'open'").get(projectId) as any;

    const acceptanceForms = db.prepare(`
      SELECT af.*,
        COUNT(afi.id) as item_count,
        SUM(CASE WHEN afi.is_pass = 1 THEN 1 ELSE 0 END) as passed_items,
        SUM(CASE WHEN afi.is_pass = 0 THEN 1 ELSE 0 END) as failed_items
      FROM acceptance_forms af
      LEFT JOIN acceptance_form_items afi ON af.id = afi.form_id
      WHERE af.project_id = ?
      GROUP BY af.id
      ORDER BY af.created_at DESC
    `).all(projectId);

    const workstationCount = db.prepare('SELECT COUNT(*) as count FROM workstations WHERE project_id = ?').get(projectId) as any;

    let planProgress = 0;
    if (latestPlan && (latestPlan as any).task_count > 0) {
      planProgress = Math.round(((latestPlan as any).avg_progress || 0));
    }

    const totalIssues = oplCount.count + anomalyCount.count;
    const closedIssues = oplClosedCount.count + anomalyClosedCount.count;
    const issueCloseRate = totalIssues > 0 ? Math.round((closedIssues / totalIssues) * 10000) / 100 : 0;

    let acceptanceStatus = '未验收';
    const latestAcceptance = acceptanceForms.length > 0 ? (acceptanceForms as any[])[0] : null;
    if (latestAcceptance) {
      if (latestAcceptance.status === 'approved') acceptanceStatus = '验收通过';
      else if (latestAcceptance.status === 'rejected') acceptanceStatus = '验收不通过';
      else if (latestAcceptance.status === 'submitted') acceptanceStatus = '验收审批中';
      else acceptanceStatus = '验收单编辑中';
    }

    res.json(createSuccessResponse({
      project,
      plan_summary: {
        plan_count: planCount.count,
        latest_plan: latestPlan,
        progress: planProgress
      },
      opl_summary: {
        total: oplCount.count,
        open: oplOpenCount.count,
        closed: oplClosedCount.count
      },
      anomaly_summary: {
        total: anomalyCount.count,
        open: anomalyOpenCount.count,
        closed: anomalyClosedCount.count
      },
      issue_summary: {
        total: totalIssues,
        closed: closedIssues,
        close_rate: issueCloseRate
      },
      acceptance: {
        status: acceptanceStatus,
        forms: acceptanceForms,
        workstation_count: workstationCount.count
      }
    }));
  } catch (err: any) {
    res.status(500).json(createErrorResponse(err.message || '获取项目报表失败'));
  }
});

// GET /opl/export - Export OPL to Excel
router.get('/opl/export', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { start_date, end_date, project_id, department, status } = req.query;

    const { whereSql, queryParams } = buildOplWhereClause({ start_date, end_date, project_id, department, status });

    const totalResult = db.prepare(`SELECT COUNT(*) as count FROM opl_records o ${whereSql}`).get(...queryParams) as any;
    const total = totalResult.count;

    const byStatus = db.prepare(`
      SELECT o.status, COUNT(*) as count
      FROM opl_records o ${whereSql}
      GROUP BY o.status
    `).all(...queryParams);

    const byDept = db.prepare(`
      SELECT o.responsible_dept, COUNT(*) as count
      FROM opl_records o ${whereSql}
      GROUP BY o.responsible_dept
      ORDER BY count DESC
    `).all(...queryParams);

    const byMonth = db.prepare(`
      SELECT substr(o.occurrence_date, 1, 7) as month, COUNT(*) as count
      FROM opl_records o ${whereSql}
      GROUP BY substr(o.occurrence_date, 1, 7)
      ORDER BY month ASC
    `).all(...queryParams);

    const closedCount = (byStatus as any[]).find((s: any) => s.status === 'closed')?.count || 0;
    const openCount = (byStatus as any[]).find((s: any) => s.status === 'open')?.count || 0;
    const closeRate = total > 0 ? (Math.round((closedCount / total) * 10000) / 100) + '%' : '0%';

    const statusMap: Record<string, string> = { open: '未关闭', closed: '已关闭' };

    const summaryHeaders = ['统计项', '数值'];
    const summaryRows: any[][] = [
      ['统计区间', `${start_date || '不限'} 至 ${end_date || '不限'}`],
      ['OPL总数', total],
      ['未关闭数', openCount],
      ['已关闭数', closedCount],
      ['关闭率', closeRate]
    ];

    const statusHeaders = ['状态', '数量'];
    const statusRows = (byStatus as any[]).map(s => [statusMap[s.status] || s.status, s.count]);

    const deptHeaders = ['责任部门', '数量'];
    const deptRows = (byDept as any[]).map(d => [d.responsible_dept, d.count]);

    const monthHeaders = ['月份', '数量'];
    const monthRows = (byMonth as any[]).map(m => [m.month, m.count]);

    const detailSql = `
      SELECT o.*,
        u1.name as responsible_person_name,
        u2.name as handler_name
      FROM opl_records o
      LEFT JOIN users u1 ON o.responsible_person_id = u1.id
      LEFT JOIN users u2 ON o.handler_id = u2.id
      ${whereSql}
      ORDER BY o.occurrence_date DESC
    `;
    const records = db.prepare(detailSql).all(...queryParams) as any[];

    const detailHeaders = [
      'ID', '发生日期', '项目编码', '项目名称', '工位编码', '工位名称',
      '责任部门', '责任人', '处理人', '问题描述', '解决方案',
      '计划完成日期', '实际完成日期', '状态', '创建时间'
    ];
    const detailRows = records.map(r => [
      r.id,
      r.occurrence_date,
      r.project_code || '',
      r.project_name || '',
      r.station_code || '',
      r.station_name || '',
      r.responsible_dept,
      r.responsible_person_name || '',
      r.handler_name || '',
      r.problem_description || '',
      r.solution_plan || '',
      r.planned_completion_date || '',
      r.actual_completion_date || '',
      statusMap[r.status] || r.status,
      r.created_at
    ]);

    const filename = `OPL报表_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;

    await exportToExcel(res, filename, [
      { name: 'OPL汇总统计', headers: summaryHeaders, rows: summaryRows },
      { name: '按状态统计', headers: statusHeaders, rows: statusRows },
      { name: '按部门统计', headers: deptHeaders, rows: deptRows },
      { name: '按月份统计', headers: monthHeaders, rows: monthRows },
      { name: 'OPL明細', headers: detailHeaders, rows: detailRows }
    ]);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json(createErrorResponse(err.message || '导出OPL报表失败'));
    }
  }
});

// GET /anomaly/export - Export anomaly to Excel
router.get('/anomaly/export', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { start_date, end_date, project_id, department, status, anomaly_type } = req.query;

    const { whereSql, queryParams } = buildAnomalyWhereClause({ start_date, end_date, project_id, department, status, anomaly_type });

    const totalResult = db.prepare(`SELECT COUNT(*) as count FROM anomaly_records a ${whereSql}`).get(...queryParams) as any;
    const total = totalResult.count;

    const byStatus = db.prepare(`
      SELECT a.status, COUNT(*) as count
      FROM anomaly_records a ${whereSql}
      GROUP BY a.status
    `).all(...queryParams);

    const byDept = db.prepare(`
      SELECT a.responsible_dept, COUNT(*) as count
      FROM anomaly_records a ${whereSql}
      GROUP BY a.responsible_dept
      ORDER BY count DESC
    `).all(...queryParams);

    const byMonth = db.prepare(`
      SELECT substr(a.occurrence_date, 1, 7) as month, COUNT(*) as count
      FROM anomaly_records a ${whereSql}
      GROUP BY substr(a.occurrence_date, 1, 7)
      ORDER BY month ASC
    `).all(...queryParams);

    const byType = db.prepare(`
      SELECT a.anomaly_type, COUNT(*) as count
      FROM anomaly_records a ${whereSql}
      GROUP BY a.anomaly_type
    `).all(...queryParams);

    const closedCount = (byStatus as any[]).find((s: any) => s.status === 'closed')?.count || 0;
    const openCount = (byStatus as any[]).find((s: any) => s.status === 'open')?.count || 0;
    const closeRate = total > 0 ? (Math.round((closedCount / total) * 10000) / 100) + '%' : '0%';

    const statusMap: Record<string, string> = { open: '未关闭', closed: '已关闭' };
    const typeMap: Record<string, string> = { process: '过程异常', inspection: '巡检问题' };

    const summaryHeaders = ['统计项', '数值'];
    const summaryRows: any[][] = [
      ['统计区间', `${start_date || '不限'} 至 ${end_date || '不限'}`],
      ['异常总数', total],
      ['未关闭数', openCount],
      ['已关闭数', closedCount],
      ['关闭率', closeRate]
    ];

    const statusHeaders = ['状态', '数量'];
    const statusRows = (byStatus as any[]).map(s => [statusMap[s.status] || s.status, s.count]);

    const typeHeaders = ['异常类型', '数量'];
    const typeRows = (byType as any[]).map(t => [typeMap[t.anomaly_type] || t.anomaly_type, t.count]);

    const deptHeaders = ['责任部门', '数量'];
    const deptRows = (byDept as any[]).map(d => [d.responsible_dept, d.count]);

    const monthHeaders = ['月份', '数量'];
    const monthRows = (byMonth as any[]).map(m => [m.month, m.count]);

    const detailSql = `
      SELECT a.*,
        u1.name as responsible_person_name,
        u2.name as project_manager_name,
        u3.name as designer_name
      FROM anomaly_records a
      LEFT JOIN users u1 ON a.responsible_person_id = u1.id
      LEFT JOIN users u2 ON a.project_manager_id = u2.id
      LEFT JOIN users u3 ON a.designer_id = u3.id
      ${whereSql}
      ORDER BY a.occurrence_date DESC
    `;
    const records = db.prepare(detailSql).all(...queryParams) as any[];

    const detailHeaders = [
      'ID', '发生日期', '异常类型', '项目编码', '项目名称', '工位编码', '工位名称',
      '责任部门', '责任人', '项目经理', '问题描述', '解决方案',
      '零件编号', '零件规格', '供应商', '设计人',
      '计划完成日期', '实际完成日期', '状态', '创建时间'
    ];
    const detailRows = records.map(r => [
      r.id,
      r.occurrence_date,
      typeMap[r.anomaly_type] || r.anomaly_type,
      r.project_code || '',
      r.project_name || '',
      r.station_code || '',
      r.station_name || '',
      r.responsible_dept,
      r.responsible_person_name || '',
      r.project_manager_name || '',
      r.problem_description || '',
      r.solution_plan || '',
      r.part_number || '',
      r.part_spec || '',
      r.supplier || '',
      r.designer_name || '',
      r.planned_completion_date || '',
      r.actual_completion_date || '',
      statusMap[r.status] || r.status,
      r.created_at
    ]);

    const filename = `异常报表_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;

    await exportToExcel(res, filename, [
      { name: '异常汇总统计', headers: summaryHeaders, rows: summaryRows },
      { name: '按状态统计', headers: statusHeaders, rows: statusRows },
      { name: '按类型统计', headers: typeHeaders, rows: typeRows },
      { name: '按部门统计', headers: deptHeaders, rows: deptRows },
      { name: '按月份统计', headers: monthHeaders, rows: monthRows },
      { name: '异常明細', headers: detailHeaders, rows: detailRows }
    ]);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json(createErrorResponse(err.message || '导出异常报表失败'));
    }
  }
});

export default router;
