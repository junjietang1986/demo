import { getDb } from '../db/database';
import { extractChineseDisplayName } from './userHelper';

interface FlowStep {
  step: number;
  name: string;
  role: string;
  description?: string;
  assigned_user_name?: string;
}

function resolveApproverId(
  db: any,
  step: FlowStep,
  submitterId: number,
  context?: { projectId?: number; recordId?: number; module?: string }
): number {
  const stepRole = step.role;

  if (step.assigned_user_name) {
    const u = db.prepare(
      "SELECT id FROM users WHERE name LIKE ? AND status = 'active' ORDER BY id ASC LIMIT 1"
    ).get(`%${step.assigned_user_name}%`) as any;
    if (u) return u.id;
  }

  if (stepRole === 'creator') {
    return submitterId;
  }

  if (stepRole === 'qa_engineer') {
    const qa = db.prepare(
      "SELECT u.id FROM users u JOIN departments d ON u.department_id = d.id WHERE (d.name LIKE '%质量%' OR u.role = 'qa_engineer') AND u.status = 'active' ORDER BY u.id ASC LIMIT 1"
    ).get() as any;
    if (qa) return qa.id;
  }

  if (stepRole.startsWith('role:')) {
    const roleCode = stepRole.slice(5);
    const user = db.prepare(
      "SELECT id FROM users WHERE role = ? AND status = 'active' ORDER BY id ASC LIMIT 1"
    ).get(roleCode) as any;
    if (user) return user.id;
  }

  if (stepRole === 'dept_manager') {
    const submitter = db.prepare('SELECT department_id FROM users WHERE id = ?').get(submitterId) as any;
    if (submitter?.department_id) {
      const mgr = db.prepare(
        `SELECT u.id FROM users u
         WHERE u.department_id = ? AND u.status = 'active'
           AND (u.role IN ('admin','dept_manager','manager','project_manager')
                OR u.job_title LIKE '%经理%' OR u.job_title LIKE '%主管%')
         ORDER BY CASE WHEN u.role = 'admin' THEN 0 WHEN u.role = 'dept_manager' THEN 1 ELSE 2 END, u.id ASC LIMIT 1`
      ).get(submitter.department_id) as any;
      if (mgr) return mgr.id;
    }
  }

  if (stepRole === 'project_manager' && context?.projectId) {
    const pm = db.prepare(
      `SELECT u.id FROM users u
       JOIN projects p ON p.project_manager_id = u.id
       WHERE p.id = ? AND u.status = 'active' LIMIT 1`
    ).get(context.projectId) as any;
    if (pm) return pm.id;
  }

  if (stepRole === 'responsible' && context?.recordId && context?.module) {
    try {
      let sql = '';
      if (context.module === 'project_plan') {
        sql = 'SELECT person_id as rid FROM plan_tasks WHERE id = ?';
      } else if (context.module === 'acceptance_form' || context.module === 'acceptance_plan') {
        sql = 'SELECT responsible_id as rid FROM acceptance_forms WHERE id = ?';
      } else if (context.module === 'improvement') {
        sql = 'SELECT responsible_person_id as rid FROM improvements WHERE id = ?';
      }
      if (sql) {
        const r = db.prepare(sql).get(context.recordId) as any;
        if (r?.rid) return r.rid;
      }
    } catch {}
  }

  if (stepRole === 'verifier' && context?.recordId && context?.module) {
    try {
      let sql = '';
      if (context.module === 'acceptance_form' || context.module === 'acceptance_plan') {
        sql = 'SELECT verifier_id as rid FROM acceptance_forms WHERE id = ?';
      } else if (context.module === 'improvement') {
        sql = 'SELECT verifier_id as rid FROM improvements WHERE id = ?';
      }
      if (sql) {
        const r = db.prepare(sql).get(context.recordId) as any;
        if (r?.rid) return r.rid;
      }
    } catch {}
  }

  const user = db.prepare(
    "SELECT id FROM users WHERE role = ? AND status = 'active' ORDER BY id ASC LIMIT 1"
  ).get(stepRole) as any;
  if (user) {
    return user.id;
  }

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active' LIMIT 1").get() as any;
  return admin ? admin.id : submitterId;
}

export function createApprovalRecord(
  moduleOrDb: any,
  recordIdOrOptions?: any,
  flowModuleName?: string,
  submitterId?: number,
  context?: { projectId?: number }
): number {
  let db: any;
  let module: string;
  let recordId: any;
  let submitter_id: number;
  let options: any = {};

  if (moduleOrDb && typeof moduleOrDb === 'object' && moduleOrDb.prepare) {
    db = moduleOrDb;
    const opts = recordIdOrOptions || {};
    module = opts.module;
    recordId = opts.business_id;
    submitter_id = opts.submitter_id;
    options = opts;
  } else {
    db = getDb();
    module = moduleOrDb;
    recordId = recordIdOrOptions;
    submitter_id = submitterId!;
    options = { flowModuleName, project_id: context?.projectId };
  }

  const flowModule = options.flowModuleName || module;

  const flow = db.prepare(
    'SELECT * FROM approval_flows WHERE module = ? ORDER BY is_default DESC, id DESC LIMIT 1'
  ).get(flowModule) as any;

  if (!flow) {
    throw new Error(`未找到模块"${flowModule}"的审批流程配置，请先配置审批流程`);
  }

  const steps: FlowStep[] = JSON.parse(flow.steps);

  const recordResult = db.prepare(
    `INSERT INTO approval_records (module, record_id, flow_id, current_step, status, submitter_id, submitted_at)
     VALUES (?, ?, ?, 1, 'pending', ?, datetime('now', 'localtime'))`
  ).run(module, recordId, flow.id, submitter_id);

  const approvalRecordId = recordResult.lastInsertRowid as number;

  const insertStep = db.prepare(
    `INSERT INTO approval_step_records (approval_record_id, step_index, approver_id, approver_name, status)
     VALUES (?, ?, ?, ?, 'pending')`
  );

  for (const step of steps) {
    const approverId = resolveApproverId(db, step, submitter_id, {
      projectId: options.project_id,
      recordId: typeof recordId === 'number' ? recordId : undefined,
      module: flowModule
    });
    const approver = db.prepare('SELECT name FROM users WHERE id = ?').get(approverId) as any;
    insertStep.run(
      approvalRecordId,
      step.step,
      approverId,
      approver ? extractChineseDisplayName(approver.name) : ''
    );
  }

  return approvalRecordId;
}
