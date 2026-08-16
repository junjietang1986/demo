import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'qms.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db: any;

class DatabaseWrapper {
  private _db: Database.Database;

  constructor(filename: string) {
    this._db = new Database(filename);
  }

  exec(sql: string) {
    this._db.exec(sql);
    return this;
  }

  pragma(pragmaStr: string) {
    this._db.pragma(pragmaStr);
    return this;
  }

  prepare(sql: string) {
    const stmt = this._db.prepare(sql);
    return {
      run: (...params: any[]) => {
        const normalized = normalizeParams(params);
        const result = stmt.run(...normalized);
        return {
          lastInsertRowid: Number(result.lastInsertRowid),
          changes: Number(result.changes)
        };
      },
      get: (...params: any[]) => {
        return stmt.get(...normalizeParams(params)) || undefined;
      },
      all: (...params: any[]) => {
        return stmt.all(...normalizeParams(params)) || [];
      }
    };
  }

  transaction(fn: Function) {
    return this._db.transaction((...args: any[]) => fn(...args));
  }

  close() {
    this._db.close();
  }
}

function normalizeParams(params: any[]): any[] {
  return params.map(p => (p === undefined ? null : p));
}

function ensureDataDir() {
  const dataDir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

export function initDatabase() {
  ensureDataDir();
  db = new DatabaseWrapper(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  runMigrations();

  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (username, password, name, role, department, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('admin', hashedPassword, '系统管理员', 'admin', '管理部', 'active');
  }

  resetAllApprovalFlowsToAdmin();
  seedAcceptanceConfigs();

  return db;
}

function runMigrations() {
  const migrations = [
    "CREATE INDEX IF NOT EXISTS idx_users_feishu_user_id ON users(feishu_user_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feishu_user_id_unique ON users(feishu_user_id) WHERE feishu_user_id IS NOT NULL AND feishu_user_id != ''",
    "ALTER TABLE workstations ADD COLUMN mech_designer_id INTEGER",
    "ALTER TABLE workstations ADD COLUMN mech_designer_name TEXT",
    "ALTER TABLE workstations ADD COLUMN elec_designer_id INTEGER",
    "ALTER TABLE workstations ADD COLUMN elec_designer_name TEXT",
    "ALTER TABLE workstations ADD COLUMN meas_control_designer_id INTEGER",
    "ALTER TABLE workstations ADD COLUMN meas_control_designer_name TEXT",
    "ALTER TABLE users ADD COLUMN job_title TEXT",
    "ALTER TABLE users ADD COLUMN feishu_department_ids TEXT",
    `CREATE TABLE IF NOT EXISTS permission_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      parent_code TEXT,
      icon TEXT,
      path TEXT,
      sort_order INTEGER DEFAULT 0,
      is_menu INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_system INTEGER DEFAULT 0,
      is_builtin INTEGER DEFAULT 0,
      dept_id TEXT,
      dept_name TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_code TEXT NOT NULL,
      module_code TEXT NOT NULL,
      can_view INTEGER DEFAULT 1,
      can_edit INTEGER DEFAULT 0,
      can_delete INTEGER DEFAULT 0,
      can_approve INTEGER DEFAULT 0,
      UNIQUE(role_code, module_code)
    )`,
    "ALTER TABLE plan_tasks ADD COLUMN predecessor_id INTEGER DEFAULT 0",
    "ALTER TABLE plan_tasks ADD COLUMN scheduling_mode TEXT DEFAULT 'auto'",
    "ALTER TABLE plan_tasks ADD COLUMN duration_days INTEGER DEFAULT 1",
    "ALTER TABLE plan_tasks ADD COLUMN wbs_code TEXT",

    // ========== 2026-07-06 APQP/质量管理模块扩展 ==========
    // 客户表
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      customer_type TEXT DEFAULT 'automotive',
      contact_person TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      address TEXT,
      csr_requirements TEXT,
      is_active INTEGER DEFAULT 1,
      remark TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,

    // APQP阶段定义
    `CREATE TABLE IF NOT EXISTS apqp_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phase_no INTEGER NOT NULL,
      phase_code TEXT NOT NULL UNIQUE,
      phase_name TEXT NOT NULL,
      description TEXT,
      gate_name TEXT,
      deliverables_json TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    )`,

    // APQP门控评审记录
    `CREATE TABLE IF NOT EXISTS apqp_gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      phase_no INTEGER NOT NULL,
      gate_status TEXT NOT NULL DEFAULT 'pending',
      review_date TEXT,
      reviewer_id INTEGER,
      reviewer_name TEXT,
      conclusion TEXT,
      comments TEXT,
      conditional_terms TEXT,
      follow_up_date TEXT,
      approval_record_id INTEGER,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewer_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,

    // APQP门控检查项
    `CREATE TABLE IF NOT EXISTS apqp_gate_checkitems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gate_id INTEGER NOT NULL,
      phase_no INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_category TEXT,
      deliverable_id INTEGER,
      is_required INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      remark TEXT,
      checked_by INTEGER,
      checked_at TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (gate_id) REFERENCES apqp_gates(id) ON DELETE CASCADE,
      FOREIGN KEY (checked_by) REFERENCES users(id)
    )`,

    // 项目风险登记册
    `CREATE TABLE IF NOT EXISTS project_risks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      risk_category TEXT DEFAULT 'technical',
      risk_description TEXT NOT NULL,
      impact TEXT,
      probability TEXT DEFAULT 'medium',
      severity TEXT DEFAULT 'medium',
      risk_level TEXT DEFAULT 'medium',
      mitigation_plan TEXT,
      responsible_id INTEGER,
      due_date TEXT,
      status TEXT DEFAULT 'open',
      closure_note TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (responsible_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`,

    // projects表扩展APQP字段（ALTER TABLE，已存在列通过try/catch忽略）
    "ALTER TABLE projects ADD COLUMN customer_id INTEGER",
    "ALTER TABLE projects ADD COLUMN apqp_phase INTEGER DEFAULT 1",
    "ALTER TABLE projects ADD COLUMN apqp_status TEXT DEFAULT 'in_progress'",
    "ALTER TABLE projects ADD COLUMN health_status TEXT DEFAULT 'green'",
    "ALTER TABLE projects ADD COLUMN kickoff_date TEXT",
    "ALTER TABLE projects ADD COLUMN planned_fat_date TEXT",
    "ALTER TABLE projects ADD COLUMN planned_sat_date TEXT",
    "ALTER TABLE projects ADD COLUMN planned_sop_date TEXT",
    "ALTER TABLE projects ADD COLUMN actual_fat_date TEXT",
    "ALTER TABLE projects ADD COLUMN actual_sat_date TEXT",
    "ALTER TABLE projects ADD COLUMN actual_sop_date TEXT",
    "ALTER TABLE projects ADD COLUMN project_priority TEXT DEFAULT 'medium'",
    "ALTER TABLE projects ADD COLUMN contract_amount REAL DEFAULT 0",
    "ALTER TABLE projects ADD COLUMN customer_requirements TEXT",
    "ALTER TABLE projects ADD COLUMN feasibility_status TEXT DEFAULT 'pending'",
    "ALTER TABLE projects ADD COLUMN lessons_learned_note TEXT",

    // ========== 2026-07-07 交付物附件 & BOM模块 ==========
    // APQP门控交付物附件表
    `CREATE TABLE IF NOT EXISTS apqp_gate_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkitem_id INTEGER NOT NULL,
      gate_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      file_type TEXT,
      uploaded_by INTEGER,
      uploader_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (gate_id) REFERENCES apqp_gates(id) ON DELETE CASCADE,
      FOREIGN KEY (checkitem_id) REFERENCES apqp_gate_checkitems(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`,

    // BOM物料分类表
    `CREATE TABLE IF NOT EXISTS bom_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_code TEXT UNIQUE NOT NULL,
      category_name TEXT NOT NULL,
      parent_id INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1
    )`,

    // BOM物料主表
    `CREATE TABLE IF NOT EXISTS bom_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      item_code TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_spec TEXT,
      category_id INTEGER,
      category_name TEXT,
      material TEXT,
      quantity REAL DEFAULT 1,
      unit TEXT DEFAULT 'PCS',
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      supplier TEXT,
      make_or_buy TEXT DEFAULT 'buy',
      drawing_no TEXT,
      drawing_version TEXT,
      is_key_part INTEGER DEFAULT 0,
      is_safety_part INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft',
      remark TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // BOM物料版本/变更表
    `CREATE TABLE IF NOT EXISTS bom_item_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      version_no INTEGER DEFAULT 1,
      change_type TEXT,
      change_description TEXT,
      changed_by INTEGER,
      snapshot_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (item_id) REFERENCES bom_items(id) ON DELETE CASCADE
    )`,

    // BOM物料附件表
    `CREATE TABLE IF NOT EXISTS bom_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      file_type TEXT,
      attach_type TEXT DEFAULT 'drawing',
      uploaded_by INTEGER,
      uploader_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (item_id) REFERENCES bom_items(id) ON DELETE CASCADE
    )`,

    // ========== 2026-07-06 剩余APQP质量模块 ==========
    // FMEA失效模式与影响分析
    `CREATE TABLE IF NOT EXISTS fmea_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      fmea_type TEXT DEFAULT 'dfmea',
      process_or_function TEXT NOT NULL,
      failure_mode TEXT NOT NULL,
      failure_effect TEXT,
      failure_cause TEXT,
      current_controls TEXT,
      severity INTEGER DEFAULT 5,
      occurrence INTEGER DEFAULT 3,
      detection INTEGER DEFAULT 3,
      rpn INTEGER DEFAULT 45,
      recommended_action TEXT,
      responsible_id INTEGER,
      responsible_name TEXT,
      target_date TEXT,
      action_taken TEXT,
      severity_after INTEGER,
      occurrence_after INTEGER,
      detection_after INTEGER,
      rpn_after INTEGER,
      status TEXT DEFAULT 'open',
      attachments_json TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // DVP&R设计验证计划与报告
    `CREATE TABLE IF NOT EXISTS dvpr_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      test_no TEXT NOT NULL,
      test_name TEXT NOT NULL,
      test_category TEXT DEFAULT 'functional',
      test_spec TEXT,
      requirement TEXT,
      test_method TEXT,
      sample_size INTEGER DEFAULT 1,
      responsible_id INTEGER,
      responsible_name TEXT,
      planned_start TEXT,
      planned_finish TEXT,
      actual_start TEXT,
      actual_finish TEXT,
      result TEXT DEFAULT 'pending',
      result_data TEXT,
      pass_fail TEXT DEFAULT 'pending',
      lab_name TEXT,
      report_no TEXT,
      remark TEXT,
      attachments_json TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // 控制计划CP
    `CREATE TABLE IF NOT EXISTS control_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      cp_type TEXT DEFAULT 'prototype',
      process_no TEXT,
      process_name TEXT,
      machine_or_device TEXT,
      characteristics_product TEXT,
      characteristics_process TEXT,
      specification TEXT,
      tolerance TEXT,
      measurement_technique TEXT,
      sample_size INTEGER DEFAULT 5,
      sample_frequency TEXT DEFAULT '每小时',
      control_method TEXT,
      reaction_plan TEXT,
      responsible_id INTEGER,
      responsible_name TEXT,
      sort_order INTEGER DEFAULT 0,
      attachments_json TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // ECR/ECO工程变更
    `CREATE TABLE IF NOT EXISTS eco_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      change_no TEXT NOT NULL,
      change_type TEXT DEFAULT 'ecr',
      change_title TEXT NOT NULL,
      change_description TEXT NOT NULL,
      reason TEXT,
      affected_parts TEXT,
      impact_analysis TEXT,
      risk_assessment TEXT,
      requested_by INTEGER,
      requested_by_name TEXT,
      requested_date TEXT,
      status TEXT DEFAULT 'draft',
      approver_id INTEGER,
      approver_name TEXT,
      approved_date TEXT,
      implementation_date TEXT,
      verification_result TEXT,
      attachments_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // PPAP交付
    `CREATE TABLE IF NOT EXISTS ppap_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      element_code TEXT NOT NULL,
      element_name TEXT NOT NULL,
      is_required INTEGER DEFAULT 1,
      status TEXT DEFAULT 'not_started',
      responsible_id INTEGER,
      responsible_name TEXT,
      planned_submit TEXT,
      actual_submit TEXT,
      submission_level INTEGER DEFAULT 3,
      result TEXT DEFAULT 'pending',
      customer_approval TEXT DEFAULT 'pending',
      remark TEXT,
      attachments_json TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // MSA测量系统分析
    `CREATE TABLE IF NOT EXISTS msa_studies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      study_type TEXT DEFAULT 'grr',
      characteristic TEXT NOT NULL,
      gage_name TEXT,
      gage_no TEXT,
      gage_type TEXT,
      tolerance REAL,
      appraisers_count INTEGER DEFAULT 3,
      parts_count INTEGER DEFAULT 10,
      trials_count INTEGER DEFAULT 3,
      study_date TEXT,
      responsible_id INTEGER,
      responsible_name TEXT,
      result_ev REAL,
      result_av REAL,
      result_grr REAL,
      result_pv REAL,
      result_tv REAL,
      ndc INTEGER,
      pct_grr REAL,
      conclusion TEXT DEFAULT 'pending',
      remark TEXT,
      attachments_json TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // SPC统计过程控制
    `CREATE TABLE IF NOT EXISTS spc_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      feature_name TEXT NOT NULL,
      process_name TEXT,
      station_name TEXT,
      usl REAL,
      lsl REAL,
      target REAL,
      unit TEXT,
      subgroup_size INTEGER DEFAULT 5,
      sampling_frequency TEXT DEFAULT '每2小时',
      cpk_target REAL DEFAULT 1.33,
      status TEXT DEFAULT 'monitoring',
      responsible_id INTEGER,
      responsible_name TEXT,
      latest_cpk REAL,
      latest_ppk REAL,
      latest_mean REAL,
      latest_sigma REAL,
      out_of_control_count INTEGER DEFAULT 0,
      remark TEXT,
      attachments_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // SPC数据点
    `CREATE TABLE IF NOT EXISTS spc_data_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id INTEGER NOT NULL,
      subgroup_no INTEGER,
      sample_time TEXT,
      value1 REAL,
      value2 REAL,
      value3 REAL,
      value4 REAL,
      value5 REAL,
      operator_id INTEGER,
      operator_name TEXT,
      note TEXT,
      is_out_of_control INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (feature_id) REFERENCES spc_features(id) ON DELETE CASCADE
    )`,

    // VDA6.7过程审核
    `CREATE TABLE IF NOT EXISTS vda_audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      audit_no TEXT NOT NULL,
      audit_title TEXT NOT NULL,
      audit_type TEXT DEFAULT 'process',
      audit_date TEXT,
      auditor_id INTEGER,
      auditor_name TEXT,
      scope TEXT,
      result_score REAL,
      result_grade TEXT DEFAULT 'pending',
      status TEXT DEFAULT 'planned',
      findings_count INTEGER DEFAULT 0,
      major_nc INTEGER DEFAULT 0,
      minor_nc INTEGER DEFAULT 0,
      remark TEXT,
      attachments_json TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // VDA6.7审核条款/发现项
    `CREATE TABLE IF NOT EXISTS vda_audit_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id INTEGER NOT NULL,
      clause_no TEXT,
      clause_title TEXT,
      question TEXT,
      score INTEGER DEFAULT 0,
      grade TEXT DEFAULT 'N/A',
      finding TEXT,
      evidence TEXT,
      correction TEXT,
      corrective_action TEXT,
      responsible_id INTEGER,
      responsible_name TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'open',
      verified_date TEXT,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (audit_id) REFERENCES vda_audits(id) ON DELETE CASCADE
    )`,

    // 8D/CAPA纠正预防措施
    `CREATE TABLE IF NOT EXISTS eightd_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      case_no TEXT NOT NULL,
      problem_title TEXT NOT NULL,
      problem_description TEXT NOT NULL,
      problem_date TEXT,
      detected_by INTEGER,
      detected_by_name TEXT,
      detection_method TEXT,
      severity TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'd1_team',
      containment_action TEXT,
      containment_by INTEGER,
      containment_by_name TEXT,
      containment_date TEXT,
      root_cause TEXT,
      root_cause_method TEXT DEFAULT '5why',
      corrective_action TEXT,
      corrective_by INTEGER,
      corrective_by_name TEXT,
      corrective_date TEXT,
      preventive_action TEXT,
      preventive_by INTEGER,
      preventive_by_name TEXT,
      preventive_date TEXT,
      verification_result TEXT,
      verified_by INTEGER,
      verified_by_name TEXT,
      verified_date TEXT,
      closure_note TEXT,
      closed_date TEXT,
      attachments_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // 项目版本历史
    `CREATE TABLE IF NOT EXISTS project_version_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      version_no TEXT NOT NULL,
      version_type TEXT DEFAULT 'revision',
      change_summary TEXT,
      changed_by INTEGER,
      changed_by_name TEXT,
      change_date TEXT,
      snapshot_json TEXT,
      approval_status TEXT DEFAULT 'draft',
      approved_by INTEGER,
      approved_by_name TEXT,
      approved_date TEXT,
      remark TEXT,
      attachments_json TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,

    // ========== 2026-07-07 项目VOC客户需求附件表 ==========
    `CREATE TABLE IF NOT EXISTS project_voc_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      file_type TEXT,
      uploaded_by INTEGER,
      uploader_name TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )`,

    // ========== 2026-07-07 新增菜单模块：文件管理、角色配置 ==========
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('files', '文件管理', NULL, 'FolderOpenOutlined', '/files', 8, 1)`,
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('settings:roles', '角色配置', 'settings', 'TeamOutlined', '/settings/roles', 92, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('admin', 'files', 1, 1, 1, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('super_admin', 'files', 1, 1, 1, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('admin', 'settings:roles', 1, 1, 1, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('super_admin', 'settings:roles', 1, 1, 1, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('user', 'files', 1, 0, 0, 0)`,
    `UPDATE permission_modules SET sort_order = 92 WHERE code = 'settings:roles'`,

    // ========== 2026-07-13 P1初步BOM→长交期物料BOM清单、门控审批支持 ==========
    `UPDATE apqp_phases SET deliverables_json = REPLACE(deliverables_json, '"初步BOM"', '"长交期物料BOM清单"') WHERE phase_no = 1`,
    `UPDATE apqp_gate_checkitems SET item_name = '长交期物料BOM清单' WHERE item_name = '初步BOM'`,
    `ALTER TABLE apqp_gates ADD COLUMN approval_status TEXT DEFAULT 'draft'`,
    `ALTER TABLE apqp_gates ADD COLUMN flow_instance_id INTEGER`,
    `ALTER TABLE apqp_gates ADD COLUMN submitter_id INTEGER`,
    `ALTER TABLE apqp_gates ADD COLUMN submitted_at TEXT`,
    `UPDATE apqp_gates SET approval_status = 'approved' WHERE gate_status = 'completed'`,
    `UPDATE apqp_gates SET approval_status = 'draft' WHERE gate_status = 'draft'`,
    `INSERT OR IGNORE INTO approval_flows (module, flow_name, description, steps, is_default, created_by)
     VALUES ('apqp_gate', 'APQP门控评审流程', 'APQP阶段门控评审标准流程（部门提交→项目经理审批）',
      '[{"step":1,"name":"项目经理审批","role":"project_manager","description":"项目经理对门控交付物进行审批，批准后进入下一阶段"}]', 1, 1)`,

    // ========== 2026-07-13 CE物料存档管理升级 ==========
    // 扩展ce_materials字段以匹配CE认证清单
    `ALTER TABLE ce_materials ADD COLUMN alternative_model TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN selector_name TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN purchaser_name TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN is_archived INTEGER DEFAULT 0`,
    `ALTER TABLE ce_materials ADD COLUMN is_compliant INTEGER DEFAULT 0`,
    `ALTER TABLE ce_materials ADD COLUMN cert_body_nande TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN cert_body_ouce TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN archive_status TEXT DEFAULT 'pending'`,
    // CE文档类型+编码规则表
    `CREATE TABLE IF NOT EXISTS ce_doc_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_code TEXT NOT NULL UNIQUE,
      type_name TEXT NOT NULL,
      description TEXT,
      code_prefix TEXT NOT NULL DEFAULT '',
      seq_length INTEGER NOT NULL DEFAULT 6,
      current_seq INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 1,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )`,
    // CE物料存档记录表（按类型编码规则重命名）
    `CREATE TABLE IF NOT EXISTS ce_material_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      doc_type_id INTEGER NOT NULL,
      archive_code TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_type TEXT,
      project_id INTEGER,
      workstation_id INTEGER,
      cert_no TEXT,
      version_no TEXT DEFAULT '1.0',
      status TEXT NOT NULL DEFAULT 'draft',
      approval_status TEXT NOT NULL DEFAULT 'draft',
      flow_instance_id INTEGER,
      submitter_id INTEGER,
      submitted_at TEXT,
      approver_id INTEGER,
      approver_name TEXT,
      approved_at TEXT,
      reject_reason TEXT,
      remarks TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (material_id) REFERENCES ce_materials(id) ON DELETE CASCADE,
      FOREIGN KEY (doc_type_id) REFERENCES ce_doc_types(id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE SET NULL
    )`,
    // 项目工位BOM-CE物料匹配表
    `CREATE TABLE IF NOT EXISTS ce_project_bom_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      workstation_id INTEGER,
      material_id INTEGER,
      bom_row_no INTEGER,
      part_code TEXT,
      part_name TEXT,
      part_spec TEXT,
      brand TEXT,
      qty REAL DEFAULT 1,
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      ce_material_id INTEGER,
      import_batch_id TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE SET NULL,
      FOREIGN KEY (material_id) REFERENCES ce_materials(id) ON DELETE SET NULL,
      FOREIGN KEY (ce_material_id) REFERENCES ce_materials(id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ce_archives_material ON ce_material_archives(material_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_archives_status ON ce_material_archives(approval_status)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_archives_project ON ce_material_archives(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_archives_code ON ce_material_archives(archive_code)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_bom_project ON ce_project_bom_items(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_bom_workstation ON ce_project_bom_items(workstation_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_bom_partcode ON ce_project_bom_items(part_code)`,
    // 默认文档类型（与截图一致）
    `INSERT OR IGNORE INTO ce_doc_types (type_code, type_name, description, code_prefix, seq_length, current_seq, sort_order, is_enabled, created_by)
     VALUES ('001', 'CE证书', '第三方机构的CE符合性声明、CE证书', 'CE', 6, 1, 0, 1, 1)`,
    `INSERT OR IGNORE INTO ce_doc_types (type_code, type_name, description, code_prefix, seq_length, current_seq, sort_order, is_enabled, created_by)
     VALUES ('002', 'DOC', '符合性声明Declaration of Conformity', 'DOC', 6, 1, 1, 1, 1)`,
    `INSERT OR IGNORE INTO ce_doc_types (type_code, type_name, description, code_prefix, seq_length, current_seq, sort_order, is_enabled, created_by)
     VALUES ('003', '测试报告', '第三方测试报告/检测报告', 'Test Rep-', 6, 1, 2, 1, 1)`,
    `INSERT OR IGNORE INTO ce_doc_types (type_code, type_name, description, code_prefix, seq_length, current_seq, sort_order, is_enabled, created_by)
     VALUES ('004', '英文说明书', '英文版操作说明书', 'Instructions-EN-', 6, 1, 3, 1, 1)`,
    // CE存档审批流程（提交→质量部汤俊杰审核）
    `INSERT OR IGNORE INTO approval_flows (module, flow_name, description, steps, is_default, created_by)
     VALUES ('ce_archive', 'CE物料存档审批流程', 'CE物料认证资料存档审批流程（提交→质量部审核）',
      '[{"step":1,"name":"质量部审核","role":"qa_engineer","description":"质量部指定人员审核CE认证资料的完整性和合规性","assigned_user_name":"汤俊杰"}]', 1, 1)`,

    // ========== 2026-07-13 CE物料状态枚举升级 + 批量审批 + 导出支持 ==========
    // 南德/欧测认证机构确认状态: pending(未确认)/approved(认可)/deviation(偏差认可)/rejected(不认可)/na(-)
    `ALTER TABLE ce_materials ADD COLUMN nande_status TEXT DEFAULT 'pending'`,
    `ALTER TABLE ce_materials ADD COLUMN ouce_status TEXT DEFAULT 'pending'`,
    // 合规状态: compliant(合规)/non_compliant(不合规)/pending(待确认)/deviation(偏差)/not_required(不需要)
    `ALTER TABLE ce_materials ADD COLUMN compliance_status TEXT DEFAULT 'pending'`,
    // 人工确认的存档状态: archived(已存档)/not_archived(未存档)/no_cert(没有证书/DOC)/no_manual(没有英文说明书)
    `ALTER TABLE ce_materials ADD COLUMN archive_status_manual TEXT DEFAULT 'not_archived'`,
    // 替代型号建议（审批时编辑）
    `ALTER TABLE ce_materials ADD COLUMN alternative_suggestion TEXT`,
    // 审批驳回原因/审批备注
    `ALTER TABLE ce_materials ADD COLUMN reject_reason TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN approval_remark TEXT`,
    // 存档批次ID（用于批量发起审批）
    `ALTER TABLE ce_material_archives ADD COLUMN batch_id TEXT`,
    // 存档审批表单数据（审批时填写的物料字段快照，JSON）
    `ALTER TABLE ce_material_archives ADD COLUMN approval_form_data TEXT`,
    // CE存档批量批次表
    `CREATE TABLE IF NOT EXISTS ce_archive_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_code TEXT NOT NULL UNIQUE,
      material_id INTEGER NOT NULL,
      project_id INTEGER,
      workstation_id INTEGER,
      title TEXT,
      archive_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      approval_status TEXT NOT NULL DEFAULT 'draft',
      flow_instance_id INTEGER,
      submitter_id INTEGER,
      submitter_name TEXT,
      submitted_at TEXT,
      approver_id INTEGER,
      approver_name TEXT,
      approved_at TEXT,
      reject_reason TEXT,
      form_data TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (material_id) REFERENCES ce_materials(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ce_batch_material ON ce_archive_batches(material_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_batch_status ON ce_archive_batches(approval_status)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_archives_batch ON ce_material_archives(batch_id)`,
    // 旧数据迁移：已存在物料的合规状态默认待确认
    `UPDATE ce_materials SET compliance_status = 'pending' WHERE compliance_status IS NULL`,
    `UPDATE ce_materials SET nande_status = 'pending' WHERE nande_status IS NULL`,
    `UPDATE ce_materials SET ouce_status = 'pending' WHERE ouce_status IS NULL`,
    `UPDATE ce_materials SET archive_status_manual = 'not_archived' WHERE archive_status_manual IS NULL`,
    // 补齐新字段名（与旧字段material_code/material_name/specification/sort_order对应）
    `ALTER TABLE ce_materials ADD COLUMN part_code TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN part_name TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN spec TEXT`,
    `ALTER TABLE ce_materials ADD COLUMN sort_no INTEGER DEFAULT 0`,
    // 旧字段数据迁移：material_code/material_name/specification/sort_order → part_code/part_name/spec/sort_no
    `UPDATE ce_materials SET part_code = COALESCE(NULLIF(part_code,''), material_code) WHERE part_code IS NULL OR part_code = ''`,
    `UPDATE ce_materials SET part_name = COALESCE(NULLIF(part_name,''), material_name) WHERE part_name IS NULL OR part_name = ''`,
    `UPDATE ce_materials SET spec = COALESCE(NULLIF(spec,''), specification) WHERE spec IS NULL OR spec = ''`,
    `UPDATE ce_materials SET sort_no = COALESCE(NULLIF(sort_no,0), sort_order) WHERE sort_no IS NULL OR sort_no = 0`,
    // 存档绑定共用文件（绑定已有存档，不复制物理文件）
    `ALTER TABLE ce_material_archives ADD COLUMN is_bound INTEGER DEFAULT 0`,
    `ALTER TABLE ce_material_archives ADD COLUMN source_archive_id INTEGER`,
    // 存档变更（新版本替换旧版本）
    `ALTER TABLE ce_material_archives ADD COLUMN replaces_archive_id INTEGER`,
    `ALTER TABLE ce_material_archives ADD COLUMN change_remark TEXT`,

    // ========== 2026-07-15 CE物料信息变更审批 ==========
    // CE物料信息变更审批流程
    `INSERT OR IGNORE INTO approval_flows (module, flow_name, description, steps, is_default, created_by)
     VALUES ('ce_material_change', 'CE物料信息变更审批流程', 'CE物料基本信息变更审批流程（已受控物料编辑需审批）',
      '[{"step":1,"name":"质量部审核","role":"qa_engineer","description":"质量部审核物料信息变更内容","assigned_user_name":"汤俊杰"}]', 1, 1)`,

    // ========== 2026-07-16 系统设置菜单缺失修复 ==========
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('settings:system', '系统设置', 'settings', 'DatabaseOutlined', '/settings/system', 95, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('admin', 'settings:system', 1, 1, 1, 1)`,
    `INSERT OR IGNORE INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
     VALUES ('super_admin', 'settings:system', 1, 1, 1, 1)`,

    // ========== 2026-07-16 CE项目BOM审批/版本/变更管理 ==========
    // BOM主表（项目+工位维度）
    `CREATE TABLE IF NOT EXISTS ce_project_bom (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      workstation_id INTEGER,
      bom_code TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      version_no INTEGER DEFAULT 1,
      version_label TEXT DEFAULT 'V1',
      current_version_id INTEGER,
      approval_record_id INTEGER,
      submitter_id INTEGER,
      submitter_name TEXT,
      submitted_at TEXT,
      approver_id INTEGER,
      approver_name TEXT,
      approved_at TEXT,
      reject_reason TEXT,
      change_reason TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE SET NULL,
      FOREIGN KEY (approval_record_id) REFERENCES approval_records(id)
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ce_bom_proj_ws ON ce_project_bom(project_id, workstation_id)`,
    // BOM明细项添加软删除字段
    `ALTER TABLE ce_project_bom_items ADD COLUMN is_deleted INTEGER DEFAULT 0`,
    `ALTER TABLE ce_project_bom_items ADD COLUMN ce_bom_id INTEGER`,
    `ALTER TABLE ce_project_bom_items ADD COLUMN delete_reason TEXT`,
    `ALTER TABLE ce_project_bom_items ADD COLUMN deleted_at TEXT`,
    // BOM版本快照表
    `CREATE TABLE IF NOT EXISTS ce_project_bom_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ce_bom_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      workstation_id INTEGER,
      version_no INTEGER NOT NULL,
      version_label TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      item_count INTEGER DEFAULT 0,
      matched_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      approval_record_id INTEGER,
      change_reason TEXT,
      submitter_id INTEGER,
      submitter_name TEXT,
      submitted_at TEXT,
      approver_id INTEGER,
      approver_name TEXT,
      approved_at TEXT,
      reject_reason TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (ce_bom_id) REFERENCES ce_project_bom(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (approval_record_id) REFERENCES approval_records(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ce_bom_versions_bom ON ce_project_bom_versions(ce_bom_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_bom_items_bom ON ce_project_bom_items(ce_bom_id)`,
    // CE项目BOM审批流程
    `INSERT OR IGNORE INTO approval_flows (module, flow_name, description, steps, is_default, created_by)
     VALUES ('ce_bom', 'CE项目BOM审批流程', 'CE项目BOM物料清单审批流程（提交→质量/CE工程师审核→受控）',
      '[{"step":1,"name":"CE工程师审核","role":"qa_engineer","description":"审核BOM物料匹配情况、CE认证资料完整性","assigned_user_name":"汤俊杰"}]', 1, 1)`,

    // ========== 2026-07-17 国际法规核查 & 进出口管控 ==========
    // 国际法规/指令清单表
    `CREATE TABLE IF NOT EXISTS ce_regulations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL DEFAULT 'EU',
      regulation_code TEXT,
      regulation_name TEXT NOT NULL,
      directive_name TEXT,
      directive_no TEXT,
      version TEXT,
      category TEXT DEFAULT 'ce',
      effective_date TEXT,
      expiry_date TEXT,
      status TEXT DEFAULT 'active',
      scope TEXT,
      key_requirements TEXT,
      applicable_products TEXT,
      source_url TEXT,
      source_code TEXT,
      source_updated_at TEXT,
      attachment_path TEXT,
      attachment_name TEXT,
      attachment_size INTEGER DEFAULT 0,
      attachment_type TEXT,
      last_checked_at TEXT,
      last_check_result TEXT,
      remarks TEXT,
      sort_order INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ce_regulations_market ON ce_regulations(market)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_regulations_category ON ce_regulations(category)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_regulations_status ON ce_regulations(status)`,

    // 进出口物料/品牌管控清单表
    `CREATE TABLE IF NOT EXISTS ce_export_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      control_type TEXT NOT NULL DEFAULT 'part',
      part_code TEXT,
      part_name TEXT,
      brand TEXT,
      manufacturer TEXT,
      control_region TEXT DEFAULT 'US',
      control_list TEXT,
      restriction_level TEXT DEFAULT 'warning',
      reason TEXT,
      alternative_suggestion TEXT,
      hs_code TEXT,
      eccn_code TEXT,
      version TEXT,
      effective_date TEXT,
      expiry_date TEXT,
      source TEXT,
      source_url TEXT,
      source_code TEXT,
      source_updated_at TEXT,
      attachment_path TEXT,
      attachment_name TEXT,
      attachment_size INTEGER DEFAULT 0,
      attachment_type TEXT,
      status TEXT DEFAULT 'active',
      last_checked_at TEXT,
      last_check_result TEXT,
      remarks TEXT,
      sort_order INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ce_export_controls_type ON ce_export_controls(control_type)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_export_controls_region ON ce_export_controls(control_region)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_export_controls_brand ON ce_export_controls(brand)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_export_controls_part ON ce_export_controls(part_code)`,
    // CE管理改为子菜单，新增法规核查和管控核查菜单项
    `UPDATE permission_modules SET parent_code='ce', path=NULL WHERE code='ce_materials'`,
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('ce', 'CE管理', NULL, 'SafetyCertificateOutlined', NULL, 7, 1)`,
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('ce:materials', 'CE物料存档库', 'ce', 'SafetyCertificateOutlined', '/ce-materials', 71, 1)`,
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('ce:regulations', '国际法规核查清单', 'ce', 'GlobalOutlined', '/ce-regulations', 72, 1)`,
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('ce:export-control', '进出口物料管控核查', 'ce', 'AlertOutlined', '/ce-export-control', 73, 1)`,
    `INSERT OR IGNORE INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
     VALUES ('ce:data-sources', '法规数据源配置', 'ce', 'ApiOutlined', '/ce-data-sources', 74, 1)`,
    `CREATE TABLE IF NOT EXISTS ce_data_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_code TEXT NOT NULL UNIQUE,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'http_check',
      target_table TEXT NOT NULL DEFAULT 'regulations',
      market TEXT,
      category TEXT,
      url TEXT NOT NULL,
      method TEXT DEFAULT 'GET',
      headers TEXT,
      parser_type TEXT DEFAULT 'status_check',
      parser_config TEXT,
      enabled INTEGER DEFAULT 1,
      check_interval_hours INTEGER DEFAULT 168,
      timeout_ms INTEGER DEFAULT 15000,
      last_check_at TEXT,
      last_check_status TEXT,
      last_check_result TEXT,
      last_http_status INTEGER,
      last_new_count INTEGER DEFAULT 0,
      last_updated_count INTEGER DEFAULT 0,
      description TEXT,
      official_name TEXT,
      sort_order INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS ce_update_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      source_code TEXT,
      source_name TEXT,
      target_table TEXT,
      check_type TEXT DEFAULT 'auto',
      status TEXT DEFAULT 'pending',
      http_status INTEGER,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      new_count INTEGER DEFAULT 0,
      updated_count INTEGER DEFAULT 0,
      error_message TEXT,
      response_summary TEXT,
      triggered_by INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ce_data_sources_enabled ON ce_data_sources(enabled)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_data_sources_target ON ce_data_sources(target_table)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_update_logs_source ON ce_update_logs(source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ce_update_logs_time ON ce_update_logs(created_at)`,
    // 法规/管控清单增加附件字段（用于预览标准文件）
    `ALTER TABLE ce_regulations ADD COLUMN attachment_path TEXT`,
    `ALTER TABLE ce_regulations ADD COLUMN attachment_name TEXT`,
    `ALTER TABLE ce_regulations ADD COLUMN attachment_size INTEGER DEFAULT 0`,
    `ALTER TABLE ce_regulations ADD COLUMN attachment_type TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN attachment_path TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN attachment_name TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN attachment_size INTEGER DEFAULT 0`,
    `ALTER TABLE ce_export_controls ADD COLUMN attachment_type TEXT`,
    // 出口管控清单增加有效期/版本字段
    `ALTER TABLE ce_export_controls ADD COLUMN version TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN effective_date TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN expiry_date TEXT`,
    // 增加数据源编码字段用于追踪数据来源
    `ALTER TABLE ce_regulations ADD COLUMN source_code TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN source_code TEXT`,
    `ALTER TABLE ce_regulations ADD COLUMN source_updated_at TEXT`,
    `ALTER TABLE ce_export_controls ADD COLUMN source_updated_at TEXT`
  ];

  migrations.forEach(sql => {
    try {
      db.exec(sql);
    } catch (e) {
      // ignore migration errors (e.g. column already exists)
    }
  });

  seedPermissionModules();
  seedDefaultRoles();
  seedDefaultRolePermissions();
  seedApqpPhases();
  seedDefaultCustomers();
  seedBomCategories();
  seedCeRegulations();
  seedCeExportControls();
  seedCeDataSources();
}

function resetAllApprovalFlowsToAdmin() {
  const modules = ['project_plan', 'acceptance_form', 'acceptance_plan', 'improvement', 'apqp_gate', 'ce_archive', 'ce_material_change'];
  const flowNames: Record<string, string> = {
    project_plan: '项目计划审批流程',
    acceptance_form: '验收单审批流程',
    acceptance_plan: '验收计划审批流程',
    improvement: '持续改进审批流程',
    apqp_gate: 'APQP门控评审流程',
    ce_archive: 'CE物料存档审批流程',
    ce_material_change: 'CE物料信息变更审批流程'
  };

  const adminStep = JSON.stringify([
    { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批' }
  ]);

  const adminUser = db.prepare("SELECT id, name FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id ASC LIMIT 1").get() as any;
  const adminId = adminUser?.id || 1;
  const adminName = adminUser?.name || '系统管理员';

  modules.forEach(m => {
    const existing = db.prepare('SELECT id FROM approval_flows WHERE module = ? ORDER BY is_default DESC, id DESC LIMIT 1').get(m) as any;
    let flowId: number;
    if (existing) {
      db.prepare('UPDATE approval_flows SET steps=?, is_default=1 WHERE id=?')
        .run(adminStep, existing.id);
      flowId = existing.id;
    } else {
      const r = db.prepare(
        'INSERT INTO approval_flows (module, flow_name, description, steps, is_default, created_by) VALUES (?, ?, ?, ?, 1, 1)'
      ).run(m, flowNames[m], `${flowNames[m]}（系统管理员审批）`, adminStep);
      flowId = r.lastInsertRowid as number;
    }

    db.prepare(`
      UPDATE approval_records SET flow_id = ?
      WHERE module = ? AND id IN (
        SELECT ar.id FROM approval_records ar
        INNER JOIN approval_step_records asr ON asr.approval_record_id = ar.id
        WHERE ar.module = ? AND asr.status = 'pending' AND ar.status = 'pending'
      )
    `).run(flowId, m, m);

    db.prepare(`
      UPDATE approval_step_records SET approver_id = ?, approver_name = ?
      WHERE status = 'pending' AND approval_record_id IN (
        SELECT id FROM approval_records WHERE module = ? AND status = 'pending'
      )
    `).run(adminId, adminName, m);
  });
}

function seedDefaultApprovalFlows() {
  const flows = [
    {
      module: 'project_plan',
      flow_name: '项目计划审批流程',
      description: '项目计划变更审批流程（系统管理员审批）',
      steps: JSON.stringify([
        { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批' }
      ]),
      is_default: 1
    },
    {
      module: 'acceptance_form',
      flow_name: '验收单审批流程',
      description: '项目验收单审批流程（系统管理员审批）',
      steps: JSON.stringify([
        { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批' }
      ]),
      is_default: 1
    },
    {
      module: 'acceptance_plan',
      flow_name: '验收计划审批流程',
      description: '验收计划变更审批流程（系统管理员审批）',
      steps: JSON.stringify([
        { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批' }
      ]),
      is_default: 1
    },
    {
      module: 'improvement',
      flow_name: '持续改进审批流程',
      description: '持续改进项目审批流程（系统管理员审批）',
      steps: JSON.stringify([
        { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批' }
      ]),
      is_default: 1
    },
    {
      module: 'apqp_gate',
      flow_name: 'APQP门控评审流程',
      description: 'APQP阶段门控评审流程（系统管理员审批）',
      steps: JSON.stringify([
        { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批' }
      ]),
      is_default: 1
    },
    {
      module: 'ce_archive',
      flow_name: 'CE物料存档审批流程',
      description: 'CE物料存档审批流程（系统管理员审批）',
      steps: JSON.stringify([
        { step: 1, name: '系统管理员审批', role: 'admin', description: '系统管理员审批CE物料存档' }
      ]),
      is_default: 1
    }
  ];

  const insert = db.prepare(
    'INSERT INTO approval_flows (module, flow_name, description, steps, is_default, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  );
  flows.forEach(f => insert.run(f.module, f.flow_name, f.description, f.steps, f.is_default, 1));
}

function seedAcceptanceConfigs() {
  const gProjectItems = [
    { category: '机械结构', name: '设备外观检查', standard: '无划痕、锈蚀、变形', method: '目视检查' },
    { category: '机械结构', name: '紧固件检查', standard: '所有紧固件紧固到位，无松动', method: '扭力扳手/目视' },
    { category: '机械结构', name: '气路系统检查', standard: '无泄漏，压力正常(0.5-0.7MPa)', method: '压力表/肥皂水' },
    { category: '电气系统', name: '接线检查', standard: '接线牢固，标识清晰，线号正确', method: '目视/拉力测试' },
    { category: '电气系统', name: '接地检查', standard: '接地电阻≤4Ω', method: '接地电阻测试仪' },
    { category: '电气系统', name: '绝缘电阻测试', standard: '绝缘电阻≥1MΩ', method: '绝缘电阻测试仪' },
    { category: '功能测试', name: '手动运行测试', standard: '各轴运动顺畅，无异常声响', method: '手动操作' },
    { category: '功能测试', name: '自动运行测试', standard: '连续运行30分钟无故障', method: '自动模式运行' },
    { category: '安全', name: '安全门联锁', standard: '安全门打开时设备停止', method: '功能测试' },
    { category: '安全', name: '急停按钮', standard: '急停按下后设备立即停止', method: '功能测试' }
  ];

  const pProjectLineItems = [
    { category: '机械结构', name: '设备外观检查', standard: '无划痕、锈蚀、变形，涂装均匀', method: '目视检查' },
    { category: '机械结构', name: '紧固件检查', standard: '所有紧固件紧固到位，防松措施到位', method: '扭力扳手/目视' },
    { category: '机械结构', name: '传动系统检查', standard: '皮带/链条张紧合适，运行平稳', method: '手动/目视' },
    { category: '机械结构', name: '气路系统检查', standard: '无泄漏，压力正常，过滤杯清洁', method: '压力表/肥皂水' },
    { category: '机械结构', name: '润滑系统检查', standard: '各润滑点润滑到位', method: '目视/手动' },
    { category: '电气系统', name: '接线检查', standard: '接线牢固，标识清晰，线槽规整', method: '目视/拉力测试' },
    { category: '电气系统', name: '接地检查', standard: '接地电阻≤4Ω', method: '接地电阻测试仪' },
    { category: '电气系统', name: '绝缘电阻测试', standard: '绝缘电阻≥1MΩ', method: '绝缘电阻测试仪' },
    { category: '电气系统', name: '电气柜检查', standard: '柜内清洁，元件标识清楚，散热良好', method: '目视/测温仪' },
    { category: '功能测试', name: '各工位手动测试', standard: '各工位手动动作正常', method: '手动操作' },
    { category: '功能测试', name: '单循环测试', standard: '单循环无报警，节拍符合要求', method: '自动模式' },
    { category: '功能测试', name: '连续运行测试', standard: '连续运行2小时无故障', method: '自动连续运行' },
    { category: '功能测试', name: '合格率测试', standard: '连续生产50件合格率≥98%', method: '统计分析' },
    { category: '安全', name: '安全门联锁', standard: '各安全门打开时对应区域停止', method: '功能测试' },
    { category: '安全', name: '急停按钮', standard: '各急停按下后整线立即停止', method: '功能测试' },
    { category: '安全', name: '安全光栅', standard: '光栅遮挡时设备停止', method: '功能测试' },
    { category: '防错防呆', name: '防错装置验证', standard: '错误工件无法装入或设备报警', method: '错误工件测试' },
    { category: 'MSA', name: '测量系统分析', standard: 'GR&R≤10%', method: 'MSA分析' },
    { category: 'MFU', name: '机器能力验证', standard: 'CMK≥1.67', method: 'MFU测试' }
  ];

  const pProjectLabItems = [
    { category: '机械结构', name: '设备外观检查', standard: '无划痕、锈蚀、变形', method: '目视检查' },
    { category: '机械结构', name: '紧固件检查', standard: '所有紧固件紧固到位', method: '扭力扳手/目视' },
    { category: '机械结构', name: '气路/液路检查', standard: '无泄漏，压力正常', method: '压力表/目视' },
    { category: '电气系统', name: '接线检查', standard: '接线牢固，标识清晰', method: '目视/拉力测试' },
    { category: '电气系统', name: '接地检查', standard: '接地电阻≤4Ω', method: '接地电阻测试仪' },
    { category: '电气系统', name: '绝缘电阻测试', standard: '绝缘电阻≥1MΩ', method: '绝缘电阻测试仪' },
    { category: '功能测试', name: '手动运行测试', standard: '各轴运动顺畅，无异常声响', method: '手动操作' },
    { category: '功能测试', name: '自动测试流程验证', standard: '测试流程按程序执行，数据采集正常', method: '自动模式' },
    { category: '功能测试', name: '数据准确性验证', standard: '测试数据与标准件偏差在允许范围内', method: '标准件比对' },
    { category: '安全', name: '安全防护检查', standard: '防护罩完好，联锁功能正常', method: '功能测试' },
    { category: '安全', name: '急停按钮', standard: '急停按下后设备立即停止', method: '功能测试' }
  ];

  const insert = db.prepare(
    'INSERT INTO acceptance_configs (project_type, category, item_name, item_description, standard, method, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  let order = 1;
  gProjectItems.forEach(item => {
    insert.run('G项目-小工装', item.category, item.name, '', item.standard, item.method, order++);
  });

  order = 1;
  pProjectLineItems.forEach(item => {
    insert.run('P项目-产线', item.category, item.name, '', item.standard, item.method, order++);
  });

  order = 1;
  pProjectLabItems.forEach(item => {
    insert.run('P项目-实验室设备', item.category, item.name, '', item.standard, item.method, order++);
  });
}

function seedPermissionModules() {
  const modules = [
    { code: 'dashboard', name: '工作台', parent_code: null, icon: 'DashboardOutlined', path: '/dashboard', sort_order: 1 },
    { code: 'projects', name: '项目管理', parent_code: null, icon: 'ProjectOutlined', path: '/projects', sort_order: 2 },
    { code: 'qms', name: 'QMS质量管理', parent_code: null, icon: 'FileTextOutlined', path: null, sort_order: 3 },
    { code: 'qms:opl', name: 'OPL单点课程', parent_code: 'qms', icon: 'FileTextOutlined', path: '/qms/opl', sort_order: 31 },
    { code: 'qms:anomaly', name: '过程异常/巡检', parent_code: 'qms', icon: 'WarningOutlined', path: '/qms/anomaly', sort_order: 32 },
    { code: 'qms:improvement', name: '持续改进', parent_code: 'qms', icon: 'RocketOutlined', path: '/improvement', sort_order: 33 },
    { code: 'acceptance', name: '验收管理', parent_code: null, icon: 'CheckSquareOutlined', path: null, sort_order: 4 },
    { code: 'acceptance:configs', name: '验收配置', parent_code: 'acceptance', icon: 'SettingOutlined', path: '/acceptance/configs', sort_order: 41 },
    { code: 'acceptance:forms', name: '验收单', parent_code: 'acceptance', icon: 'CheckSquareOutlined', path: '/acceptance/forms', sort_order: 42 },
    { code: 'acceptance:plans', name: '验收计划', parent_code: 'acceptance', icon: 'ScheduleOutlined', path: '/acceptance/plans', sort_order: 43 },
    { code: 'approval', name: '审批管理', parent_code: null, icon: 'AuditOutlined', path: null, sort_order: 5 },
    { code: 'approval:config', name: '审批流程配置', parent_code: 'approval', icon: 'ApiOutlined', path: '/approval/config', sort_order: 51 },
    { code: 'approval:list', name: '审批记录', parent_code: 'approval', icon: 'AuditOutlined', path: '/approval/list', sort_order: 52 },
    { code: 'reports', name: '报表中心', parent_code: null, icon: 'BarChartOutlined', path: '/reports', sort_order: 6 },
    { code: 'ce', name: 'CE管理', parent_code: null, icon: 'SafetyCertificateOutlined', path: null, sort_order: 7 },
    { code: 'ce:materials', name: 'CE物料存档库', parent_code: 'ce', icon: 'SafetyCertificateOutlined', path: '/ce-materials', sort_order: 71 },
    { code: 'ce:regulations', name: '国际法规核查清单', parent_code: 'ce', icon: 'GlobalOutlined', path: '/ce-regulations', sort_order: 72 },
    { code: 'ce:export-control', name: '进出口物料管控核查', parent_code: 'ce', icon: 'AlertOutlined', path: '/ce-export-control', sort_order: 73 },
    { code: 'ce:data-sources', name: '法规数据源配置', parent_code: 'ce', icon: 'ApiOutlined', path: '/ce-data-sources', sort_order: 74 },
    { code: 'files', name: '文件管理', parent_code: null, icon: 'FolderOpenOutlined', path: '/files', sort_order: 8 },
    { code: 'settings', name: '系统管理', parent_code: null, icon: 'SettingOutlined', path: null, sort_order: 90 },
    { code: 'settings:users', name: '用户管理', parent_code: 'settings', icon: 'UserOutlined', path: '/users', sort_order: 91 },
    { code: 'settings:roles', name: '角色配置', parent_code: 'settings', icon: 'TeamOutlined', path: '/settings/roles', sort_order: 92 },
    { code: 'settings:feishu', name: '飞书集成配置', parent_code: 'settings', icon: 'SettingOutlined', path: '/settings/feishu', sort_order: 93 },
    { code: 'settings:permissions', name: '权限配置', parent_code: 'settings', icon: 'SafetyOutlined', path: '/settings/permissions', sort_order: 94 },
    { code: 'settings:system', name: '系统设置', parent_code: 'settings', icon: 'DatabaseOutlined', path: '/settings/system', sort_order: 95 },
  ];

  const upsert = db.prepare(`
    INSERT INTO permission_modules (code, name, parent_code, icon, path, sort_order, is_menu)
    VALUES (@code, @name, @parent_code, @icon, @path, @sort_order, 1)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      parent_code = excluded.parent_code,
      icon = excluded.icon,
      path = excluded.path,
      sort_order = excluded.sort_order,
      is_menu = 1
  `);

  const tx = db.transaction(() => {
    // Remove the legacy orphan entry (previously was ce_materials at top-level)
    db.prepare('DELETE FROM permission_modules WHERE code IN (?)').run('ce_materials');
    modules.forEach(m => upsert.run(m));
  });
  tx();
}

function seedDefaultRoles() {
  const count = db.prepare('SELECT COUNT(*) as c FROM roles').get() as any;
  if (count.c > 0) return;

  const roles = [
    { code: 'super_admin', name: '超级管理员', description: '系统超级管理员，拥有全部权限', is_system: 1, is_builtin: 1, sort_order: 0 },
    { code: 'admin', name: '系统管理员', description: '系统管理员，拥有系统管理权限', is_system: 1, is_builtin: 1, sort_order: 1 },
    { code: 'user', name: '普通用户', description: '普通用户，基础查看权限', is_system: 1, is_builtin: 1, sort_order: 99 },
  ];

  const insert = db.prepare(`
    INSERT INTO roles (code, name, description, is_system, is_builtin, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  roles.forEach(r => insert.run(r.code, r.name, r.description, r.is_system, r.is_builtin, r.sort_order));
}

function seedDefaultRolePermissions() {
  const cols = db.prepare("PRAGMA table_info(role_permissions)").all() as any[];
  const hasRole = cols.some(c => c.name === 'role');
  const hasRoleCode = cols.some(c => c.name === 'role_code');
  if (hasRole && !hasRoleCode) {
    try {
      db.exec('ALTER TABLE role_permissions RENAME COLUMN role TO role_code');
    } catch (e) {}
  }

  const allModules = db.prepare('SELECT code FROM permission_modules').all() as any[];
  const allCodes = allModules.map(m => m.code);

  const upsert = db.prepare(`
    INSERT INTO role_permissions (role_code, module_code, can_view, can_edit, can_delete, can_approve)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(role_code, module_code) DO UPDATE SET
      can_view   = MAX(can_view,   excluded.can_view),
      can_edit   = MAX(can_edit,   excluded.can_edit),
      can_delete = MAX(can_delete, excluded.can_delete),
      can_approve= MAX(can_approve,excluded.can_approve)
  `);

  const tx = db.transaction(() => {
    // Admin & Super Admin: grant full permissions on every module (幂等)
    allCodes.forEach(code => {
      upsert.run('admin', code, 1, 1, 1, 1);
      upsert.run('super_admin', code, 1, 1, 1, 1);
    });

    function grant(role: string, perms: { code: string; view?: number; edit?: number; del?: number; approve?: number }[]) {
      perms.forEach(p => {
        if (!allCodes.includes(p.code)) return;
        upsert.run(role, p.code, p.view ?? 1, p.edit ?? 0, p.del ?? 0, p.approve ?? 0);
      });
    }

    grant('user', [
      { code: 'dashboard' },
      { code: 'projects' },
      { code: 'qms' },
      { code: 'qms:opl' },
      { code: 'qms:anomaly', edit: 1 },
      { code: 'qms:improvement', edit: 1 },
      { code: 'acceptance' },
      { code: 'acceptance:forms' },
      { code: 'acceptance:plans' },
      { code: 'approval' },
      { code: 'approval:list' },
      { code: 'ce' },
      { code: 'ce:materials' },
      { code: 'files' },
    ]);
  });
  tx();
}

function seedApqpPhases() {
  const count = db.prepare('SELECT COUNT(*) as c FROM apqp_phases').get() as any;
  if (count.c > 0) return;

  const phases = [
    {
      phase_no: 1, phase_code: 'P1_PLAN', phase_name: '计划和确定项目',
      description: '投标/需求分析/方案设计阶段，识别客户要求，评估可行性',
      gate_name: '合同评审（Order Review）',
      deliverables: JSON.stringify([
        '客户需求清单（VOC）', '技术方案', '可行性评估报告', '长交期物料BOM清单',
        '初步风险评估', '初始特殊特性清单', 'APQP策划书', '项目立项书'
      ]),
      sort_order: 1
    },
    {
      phase_no: 2, phase_code: 'P2_DESIGN', phase_name: '产品设计和开发',
      description: '机械/电气/软件详细设计，DFMEA分析，DVP&R策划',
      gate_name: '设计评审（Design Review）',
      deliverables: JSON.stringify([
        '3D模型（SolidWorks）', '2D工程图纸', '电气原理图（EPLAN）',
        '软件需求规格书', 'BOM（EBOM）', 'DFMEA报告', 'DVP&R计划',
        '特殊特性清单', '图纸会签记录', '设计计算书'
      ]),
      sort_order: 2
    },
    {
      phase_no: 3, phase_code: 'P3_PROCESS', phase_name: '过程设计和开发',
      description: '工艺规划/采购/制造准备，PFMEA分析，控制计划制定',
      gate_name: '过程评审（Process Review）',
      deliverables: JSON.stringify([
        '装配工艺卡', '检验规范', 'PFMEA报告', '控制计划（试生产）',
        '作业指导书初稿', '量具清单/MSA计划', '供应商APQP状态',
        '工装/夹具图纸', '包装规范', '设备平面布置图'
      ]),
      sort_order: 3
    },
    {
      phase_no: 4, phase_code: 'P4_VALIDATE', phase_name: '产品和过程确认',
      description: '装配/调试/FAT/SAT，MSA/SPC/Cmk验证，PPAP准备',
      gate_name: '出厂验收（FAT）',
      deliverables: JSON.stringify([
        '设备调试记录', 'MSA报告', 'SPC初始研究（Cmk/Ppk）',
        'PPAP文件包', 'Run@Rate节拍验证', 'FAT验收报告',
        '操作维护手册', '备件清单', '设备CE/UL认证', '控制计划（量产）'
      ]),
      sort_order: 4
    },
    {
      phase_no: 5, phase_code: 'P5_FEEDBACK', phase_name: '反馈评定和纠正',
      description: '发运/现场安装/SAT/SOP/售后，持续改进，经验教训',
      gate_name: '量产放行（SOP Release）',
      deliverables: JSON.stringify([
        '现场安装记录', 'SAT验收报告', '问题清单及关闭记录',
        '客户培训记录', '经验教训总结', '保修记录',
        '客户满意度调查', '持续改进计划', 'OEE数据收集方案'
      ]),
      sort_order: 5
    }
  ];

  const insert = db.prepare(`
    INSERT INTO apqp_phases (phase_no, phase_code, phase_name, description, gate_name, deliverables_json, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  phases.forEach(p => insert.run(p.phase_no, p.phase_code, p.phase_name, p.description, p.gate_name, p.deliverables, p.sort_order));
}

function seedDefaultCustomers() {
  const count = db.prepare('SELECT COUNT(*) as c FROM customers').get() as any;
  if (count.c > 0) return;

  // 预置典型德系车企客户占位（可在系统中维护）
  const customers = [
    { code: 'VW', name: '大众汽车（Volkswagen）', type: 'automotive' },
    { code: 'BMW', name: '宝马（BMW）', type: 'automotive' },
    { code: 'MB', name: '梅赛德斯-奔驰（Mercedes-Benz）', type: 'automotive' },
    { code: 'BOSCH', name: '博世（Bosch）', type: 'tier1' },
    { code: 'SIEMENS', name: '西门子（Siemens）', type: 'tier1' },
    { code: 'SCHAFFLER', name: '舍弗勒（Schaeffler）', type: 'tier1' },
    { code: 'ZF', name: '采埃孚（ZF）', type: 'tier1' },
    { code: 'CONTI', name: '大陆集团（Continental）', type: 'tier1' }
  ];
  const insert = db.prepare(`
    INSERT INTO customers (customer_code, customer_name, customer_type, is_active)
    VALUES (?, ?, ?, 1)
  `);
  customers.forEach(c => insert.run(c.code, c.name, c.type));
}

function seedBomCategories() {
  const count = db.prepare('SELECT COUNT(*) as c FROM bom_categories').get() as any;
  if (count.c > 0) return;

  const parentCategories = [
    { code: 'MECH', name: '机械件', sort_order: 1 },
    { code: 'PNEUMATIC', name: '气动元件', sort_order: 2 },
    { code: 'ELEC', name: '电气元件', sort_order: 3 },
    { code: 'SAFETY', name: '安全件', sort_order: 4 },
    { code: 'STANDARD', name: '标准件/外购件', sort_order: 5 },
    { code: 'TOOLING', name: '工装夹具', sort_order: 6 },
    { code: 'PACKAGE', name: '包装/耗材', sort_order: 7 }
  ];

  const childCategories: { [key: string]: { code: string; name: string; sort_order: number }[] } = {
    'MECH': [
      { code: 'MECH-FRAME', name: '机架/型材', sort_order: 1 },
      { code: 'MECH-PLATE', name: '加工件/板金', sort_order: 2 },
      { code: 'MECH-FASTENER', name: '紧固件', sort_order: 3 },
      { code: 'MECH-TRANSMISSION', name: '传动件', sort_order: 4 }
    ],
    'PNEUMATIC': [
      { code: 'PNEUMATIC-CYLINDER', name: '气缸', sort_order: 1 },
      { code: 'PNEUMATIC-VALVE', name: '电磁阀', sort_order: 2 },
      { code: 'PNEUMATIC-FITTING', name: '接头/气管', sort_order: 3 }
    ],
    'ELEC': [
      { code: 'ELEC-PLC', name: 'PLC/控制器', sort_order: 1 },
      { code: 'ELEC-SENSOR', name: '传感器', sort_order: 2 },
      { code: 'ELEC-MOTOR', name: '电机/驱动', sort_order: 3 },
      { code: 'ELEC-SWITCH', name: '开关/按钮', sort_order: 4 },
      { code: 'ELEC-WIRE', name: '线缆/端子', sort_order: 5 }
    ],
    'SAFETY': [
      { code: 'SAFETY-GUARD', name: '安全光栅', sort_order: 1 },
      { code: 'SAFETY-RELAY', name: '安全继电器', sort_order: 2 },
      { code: 'SAFETY-ESTOP', name: '急停按钮', sort_order: 3 }
    ]
  };

  const insertParent = db.prepare(`
    INSERT INTO bom_categories (category_code, category_name, parent_id, sort_order, is_active)
    VALUES (?, ?, 0, ?, 1)
  `);
  const insertChild = db.prepare(`
    INSERT INTO bom_categories (category_code, category_name, parent_id, sort_order, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);

  const parentIdMap: { [key: string]: number } = {};
  parentCategories.forEach(p => {
    const result = insertParent.run(p.code, p.name, p.sort_order);
    parentIdMap[p.code] = result.lastInsertRowid as number;
  });

  Object.keys(childCategories).forEach(parentCode => {
    const parentId = parentIdMap[parentCode];
    childCategories[parentCode].forEach(c => {
      insertChild.run(c.code, c.name, parentId, c.sort_order);
    });
  });
}

function seedCeRegulations() {
  const count = db.prepare('SELECT COUNT(*) as c FROM ce_regulations').get() as any;
  if (count.c > 0) return;

  const regulations = [
    // ===== 欧盟EU =====
    { market: 'EU', category: 'ce', regulation_name: '机械指令', directive_name: 'Machinery Directive', directive_no: '2006/42/EC', version: '2006/42/EC', effective_date: '2009-12-29', scope: '适用于所有投放欧盟市场的机械产品以及安全零部件', key_requirements: '健康与安全基本要求(EHSR)、风险评估、技术文件、CE标志、合格声明、使用说明书', applicable_products: '机械设备、安全零部件、可互换设备、安全组件等', sort_order: 1 },
    { market: 'EU', category: 'ce', regulation_name: '低电压指令', directive_name: 'Low Voltage Directive', directive_no: '2014/35/EU', version: '2014/35/EU', effective_date: '2016-04-20', scope: '额定电压交流50-1000V、直流75-1500V之间的电气设备', key_requirements: '电气安全、绝缘保护、接地、防触电、温度/电弧/辐射防护、机械强度', applicable_products: '电气设备、电控柜、电机、电源设备等', sort_order: 2 },
    { market: 'EU', category: 'ce', regulation_name: '电磁兼容指令', directive_name: 'EMC Directive', directive_no: '2014/30/EU', version: '2014/30/EU', effective_date: '2016-04-20', scope: '可能产生电磁干扰或受电磁干扰影响的所有电气电子设备', key_requirements: '电磁发射(EMI)限值、电磁抗扰度(EMS)、技术文件、CE标志', applicable_products: '电气电子设备、工业自动化设备、测量仪器等', sort_order: 3 },
    { market: 'EU', category: 'rohs', regulation_name: 'RoHS指令', directive_name: 'Restriction of Hazardous Substances', directive_no: '2011/65/EU (RoHS 2)', version: '2011/65/EU', effective_date: '2013-01-03', scope: '限制电子电气设备中有害物质的使用', key_requirements: '铅、汞、镉、六价铬、多溴联苯(PBB)、多溴二苯醚(PBDE)、邻苯二甲酸酯(4种)等10种物质限值', applicable_products: '电子电气设备、线缆、PCB、电子元器件等', sort_order: 4 },
    { market: 'EU', category: 'rohs', regulation_name: 'RoHS授权指令(Delegated Directive)', directive_name: 'RoHS Delegated Directive', directive_no: '(EU) 2015/863', version: '2015/863', effective_date: '2019-07-22', scope: 'RoHS 2修订案，新增4种邻苯二甲酸酯限制物质', key_requirements: '新增DEHP、BBP、DBP、DIBP四种邻苯二甲酸酯，每种限值0.1%', applicable_products: '同RoHS 2，涵盖所有电子电气设备', sort_order: 5 },
    { market: 'EU', category: 'reach', regulation_name: 'REACH法规', directive_name: 'Registration, Evaluation, Authorization and Restriction of Chemicals', directive_no: 'EC 1907/2006', version: 'EC 1907/2006', effective_date: '2007-06-01', scope: '化学品注册、评估、授权和限制，覆盖所有在欧盟生产或进口的化学品', key_requirements: '化学品注册、SVHC高关注物质通报(>0.1%)、限制物质清单(Annex XVII)、授权清单(Annex XIV)', applicable_products: '所有化学品、含有化学品的制品(含设备零部件)', sort_order: 6 },
    { market: 'EU', category: 'ce', regulation_name: '压力设备指令', directive_name: 'Pressure Equipment Directive', directive_no: '2014/68/EU (PED)', version: '2014/68/EU', effective_date: '2016-07-19', scope: '设计压力大于0.5bar的压力设备和组件', key_requirements: '分类(I/II/III/IV类)、基本安全要求、合格评定、CE标志', applicable_products: '压力容器、管道、阀门、安全附件、压力组件等', sort_order: 7 },
    { market: 'EU', category: 'ce', regulation_name: '无线电设备指令', directive_name: 'Radio Equipment Directive', directive_no: '2014/53/EU (RED)', version: '2014/53/EU', effective_date: '2016-06-13', scope: '发射和/或接收无线电波的无线电设备', key_requirements: '无线电频谱有效利用、EMC、电气安全、健康保护、隐私保护', applicable_products: '无线通信模块、RFID、蓝牙/WiFi设备等', sort_order: 8 },
    { market: 'EU', category: 'ce', regulation_name: '机械安全-通用设计原则', directive_name: 'Safety of machinery - General principles for design', directive_no: 'EN ISO 12100:2010', version: 'EN ISO 12100:2010', effective_date: '2010-11-01', scope: '机械安全设计的通用标准，风险评估和风险减小方法', key_requirements: '风险评估流程、三步法(本质安全设计→防护装置→使用信息)、安全功能', applicable_products: '所有机械设备（机械指令协调标准）', sort_order: 9 },
    { market: 'EU', category: 'ce', regulation_name: '安全相关控制系统-第1部分', directive_name: 'Safety of machinery - Safety-related parts of control systems', directive_no: 'EN ISO 13849-1:2023', version: 'EN ISO 13849-1:2023', effective_date: '2023-12-31', scope: '机械控制系统中安全相关部分的设计和验证原则', key_requirements: '性能等级PL(a-e)、MTTFd、DCavg、CCF、验证、软件要求', applicable_products: '安全继电器、安全PLC、安全光幕等安全控制系统', sort_order: 10 },
    { market: 'EU', category: 'ce', regulation_name: '电安全-机械电气设备', directive_name: 'Electrical equipment of machines', directive_no: 'EN 60204-1:2018', version: 'EN 60204-1:2018', effective_date: '2018-10-31', scope: '机械电气设备安全要求（机械指令协调标准）', key_requirements: '电击防护、保护接地、过流保护、急停、控制电路安全、标记警告', applicable_products: '机械设备的电气部分/电控系统', sort_order: 11 },
    { market: 'EU', category: 'ce', regulation_name: 'WEEE指令', directive_name: 'Waste Electrical and Electronic Equipment', directive_no: '2012/19/EU', version: '2012/19/EU', effective_date: '2014-02-14', scope: '电子电气设备废弃物处理与回收', key_requirements: '产品标识、回收体系、回收率目标(70-80%)、WEEE标志', applicable_products: '电子电气设备废弃物处理', sort_order: 12 },

    // ===== 北美NA（美国/加拿大） =====
    { market: 'NA', category: 'ul', regulation_name: 'UL 508A 工业控制设备标准', directive_name: 'UL 508A - Industrial Control Panels', directive_no: 'UL 508A', version: 'UL 508A (2024 Ed.)', effective_date: '持续更新', scope: '美国/加拿大工业控制设备/电控柜安全标准', key_requirements: '柜体选型、间距要求、短路电流额定值(SCCR)、元件认证、导线规格、标记', applicable_products: '工业控制柜、电控箱、控制面板', sort_order: 20 },
    { market: 'NA', category: 'ul', regulation_name: 'NFPA 79 机械电气标准', directive_name: 'Electrical Standard for Industrial Machinery', directive_no: 'NFPA 79', version: '2024 Ed.', effective_date: '持续更新', scope: '美国工业机械电气设备安全标准（类似EN 60204-1）', key_requirements: '电气安全、保护接地、过流保护、急停、控制电路、布线、元件', applicable_products: '工业机械设备电气系统', sort_order: 21 },
    { market: 'NA', category: 'ul', regulation_name: 'NFPA 70 (NEC) 国家电气规范', directive_name: 'National Electrical Code', directive_no: 'NFPA 70 (NEC)', version: '2024 Ed.', effective_date: '持续更新', scope: '美国电气安装规范', key_requirements: '电气安装、导线规格、接地、过流保护、机柜要求、危险区域分类', applicable_products: '工厂电气安装、设备接线', sort_order: 22 },
    { market: 'NA', category: 'ul', regulation_name: 'OSHA 职业安全健康', directive_name: 'Occupational Safety and Health Act', directive_no: 'OSHA 29 CFR 1910', version: '持续更新', effective_date: '持续更新', scope: '美国工作场所安全健康法规', key_requirements: '机械防护(LOTO上锁挂牌)、电气安全、PPE、机器防护、危险告知', applicable_products: '工作场所设备安全', sort_order: 23 },
    { market: 'NA', category: 'ul', regulation_name: 'CSA C22.2 加拿大电气标准', directive_name: 'Canadian Electrical Code', directive_no: 'CSA C22.2', version: '2024 Ed.', effective_date: '持续更新', scope: '加拿大电气安全标准', key_requirements: '电气安全、设备认证(CSA标志)、安装规范', applicable_products: '出口加拿大的电气设备', sort_order: 24 },
    { market: 'NA', category: 'fcc', regulation_name: 'FCC电磁兼容认证', directive_name: 'FCC Part 15 / Part 18', directive_no: '47 CFR Part 15', version: '持续更新', effective_date: '持续更新', scope: '美国无线电频率设备EMC要求', key_requirements: '射频发射限值、Class A(工业)/Class B(民用)、认证方式(SDoC/Certification)、FCC标志', applicable_products: '电子电气设备、数字设备、射频设备', sort_order: 25 },
    { market: 'NA', category: 'ul', regulation_name: 'UL 3100 自动化设备安全', directive_name: 'UL 3100 - Automated Equipment', directive_no: 'UL 3100', version: '2023 Ed.', effective_date: '2023-01-01', scope: '工业自动化设备、机器人/AGV/AMR安全标准（较新的UL标准）', key_requirements: '风险评估、功能安全、电气安全、紧急停止、移动安全、安全系统验证', applicable_products: '工业机器人、AGV/AMR、自动化工作站', sort_order: 26 },

    // ===== 中国CN =====
    { market: 'CN', category: 'ccc', regulation_name: 'CCC中国强制性产品认证', directive_name: 'China Compulsory Certification', directive_no: 'CCC目录', version: '持续更新', effective_date: '持续更新', scope: '中国强制性产品认证制度', key_requirements: '列入CCC目录的产品需获得CCC认证、加贴CCC标志方可出厂/销售/进口', applicable_products: '列入CCC目录的电气电子产品（低压电器、电焊机、电动工具等）', sort_order: 30 },
    { market: 'CN', category: 'china', regulation_name: 'GB 5226.1 机械电气安全', directive_name: '机械电气安全 机械电气设备', directive_no: 'GB 5226.1-2019', version: 'GB 5226.1-2019', effective_date: '2020-01-01', scope: '中国机械电气设备安全标准（等同采用IEC 60204-1）', key_requirements: '电击防护、保护接地、过流保护、急停、控制电路安全', applicable_products: '机械设备电气系统', sort_order: 31 },
    { market: 'CN', category: 'china', regulation_name: 'GB/T 15706 机械安全设计通则', directive_name: '机械安全 基本概念与设计通则', directive_no: 'GB/T 15706-2012', version: 'GB/T 15706-2012', effective_date: '2013-10-01', scope: '中国机械安全基本标准（等同采用ISO 12100）', key_requirements: '风险评估、风险减小三步法、安全原则', applicable_products: '所有机械设备', sort_order: 32 },
    { market: 'CN', category: 'rohs', regulation_name: '中国RoHS', directive_name: '电器电子产品有害物质限制使用管理办法', directive_no: '国推RoHS', version: '2016版+2021合格评定制度', effective_date: '2016-07-01', scope: '中国电子电气产品有害物质限制', key_requirements: '铅/汞/镉/六价铬/PBB/PBDE/4种邻苯限值、有害物质标识、合格评定', applicable_products: '电器电子产品', sort_order: 33 },

    // ===== 东南亚SEA =====
    { market: 'SEA', category: 'ce', regulation_name: '东盟经济共同体(AEC)标准协调', directive_name: 'ASEAN Harmonized Standards', directive_no: 'AHRDS', version: '持续更新', effective_date: '持续更新', scope: '东盟各国电气/电子/机械产品标准协调', key_requirements: '以IEC/ISO标准为基础，各国逐步采纳协调标准', applicable_products: '出口东盟(泰国/越南/印尼/马来/菲律宾/新加坡等)的机械设备', sort_order: 40 },
    { market: 'SEA', category: 'safety', regulation_name: '泰国TISI工业标准', directive_name: 'Thai Industrial Standards Institute', directive_no: 'TISI', version: '持续更新', effective_date: '持续更新', scope: '泰国强制性/自愿性产品认证', key_requirements: '部分电气产品强制TISI认证、产品安全标准、标签要求', applicable_products: '出口泰国的电气设备、部分机械', sort_order: 41 },
    { market: 'SEA', category: 'safety', regulation_name: '新加坡PSB/SS标准', directive_name: 'Enterprise Singapore/PSB', directive_no: 'SS Standards', version: '持续更新', effective_date: '持续更新', scope: '新加坡产品安全认证', key_requirements: 'Consumer Protection Registration Scheme (CPRS)、PSB标志、安全标准', applicable_products: '出口新加坡的受控电气产品', sort_order: 42 },
    { market: 'SEA', category: 'safety', regulation_name: '越南CR标志认证', directive_name: 'Vietnam QCVN / CR Mark', directive_no: 'QCVN/TCVN', version: '持续更新', effective_date: '持续更新', scope: '越南强制性产品认证', key_requirements: 'CR标志、QCVN国家技术规范、进口产品合规声明', applicable_products: '出口越南的电气电子产品', sort_order: 43 },
    { market: 'SEA', category: 'safety', regulation_name: '印尼SNI认证', directive_name: 'Standar Nasional Indonesia', directive_no: 'SNI', version: '持续更新', effective_date: '持续更新', scope: '印尼国家标准/强制性认证', key_requirements: 'SNI标志、部分电子电器产品强制认证、工厂检查', applicable_products: '出口印尼的部分电气/工业产品', sort_order: 44 },
    { market: 'SEA', category: 'safety', regulation_name: '马来西亚SIRIM认证', directive_name: 'SIRIM QAS International', directive_no: 'MS Standards', version: '持续更新', effective_date: '持续更新', scope: '马来西亚产品认证', key_requirements: 'SIRIM标志、ST许可(能源委员会)、部分产品强制认证', applicable_products: '出口马来西亚的电气产品', sort_order: 45 },

    // ===== 其他市场 =====
    { market: 'JP', category: 'pse', regulation_name: '日本PSE认证', directive_name: 'Product Safety of Electrical Appliances & Materials', directive_no: '电安法/DENAN', version: '持续更新', effective_date: '持续更新', scope: '日本电气用品安全法', key_requirements: '特定电气用品(A类)菱形PSE、非特定(B类)圆形PSE、METI备案', applicable_products: '出口日本的电气设备、电源、电缆等', sort_order: 50 },
    { market: 'JP', category: 'safety', regulation_name: '日本机械安全/労働安全衛生法', directive_name: 'Industrial Safety and Health Act', directive_no: '安衛法', version: '持续更新', effective_date: '持续更新', scope: '日本劳动安全卫生法规', key_requirements: '机械防护、风险评估(2016年起义务化)、安全标准、检查制度', applicable_products: '出口日本的工业机械设备', sort_order: 51 },
    { market: 'KR', category: 'kc', regulation_name: '韩国KC认证', directive_name: 'Korean Certification', directive_no: 'KC Mark', version: '持续更新', effective_date: '持续更新', scope: '韩国强制性产品安全认证', key_requirements: 'KC标志、安全标准(类似IEC)、EMC要求、工厂审查', applicable_products: '出口韩国的电气电子设备', sort_order: 52 },
    { market: 'OTHER', category: 'reach', regulation_name: 'UK REACH(英国脱欧后)', directive_name: 'UK REACH', directive_no: 'UK REACH (post-Brexit)', version: '持续更新', effective_date: '2021-01-01', scope: '英国脱欧后的化学品注册评估法规(独立于EU REACH)', key_requirements: '独立于EU REACH的注册、SVHC、授权/限制要求', applicable_products: '出口英国的化学品/含化学品产品', sort_order: 60 },
    { market: 'OTHER', category: 'ce', regulation_name: 'UKCA标志(英国脱欧后)', directive_name: 'UK Conformity Assessed', directive_no: 'UKCA', version: '持续更新', effective_date: '2021-01-01', scope: '英国脱欧后的产品合格标志(替代CE标志在英国使用)', key_requirements: '与CE标志类似的合规评定、UKCA标志、英国合格评定机构', applicable_products: '出口英国(英格兰/苏格兰/威尔士)的CE管制产品', sort_order: 61 }
  ];

  const insert = db.prepare(`INSERT INTO ce_regulations
    (market, category, regulation_name, directive_name, directive_no, version, effective_date,
     status, scope, key_requirements, applicable_products, sort_order, last_checked_at)
    VALUES (?,?,?,?,?,?,?, 'active', ?,?,?,?, datetime('now','localtime'))`);

  const tx = db.transaction(() => {
    regulations.forEach(r => {
      insert.run(r.market, r.category, r.regulation_name, r.directive_name, r.directive_no, r.version, r.effective_date, r.scope, r.key_requirements, r.applicable_products, r.sort_order);
    });
  });
  tx();
}

function seedCeExportControls() {
  const count = db.prepare('SELECT COUNT(*) as c FROM ce_export_controls').get() as any;
  if (count.c > 0) return;

  const controls = [
    // ===== 受管控品牌/企业 =====
    { control_type: 'brand', brand: '华为/Huawei', manufacturer: '华为技术有限公司', control_region: 'US', control_list: 'Entity List (BIS)', restriction_level: 'prohibited', reason: '美国BIS实体清单管制，涉及国家安全/外交政策关切，出口受EAR管控，需许可证', alternative_suggestion: '使用非实体清单品牌的等效产品替代（如Cisco/Juniper/H3C/锐捷网络等）', source: '美国商务部BIS', sort_order: 1 },
    { control_type: 'brand', brand: '中兴/ZTE', manufacturer: '中兴通讯', control_region: 'US', control_list: 'Entity List', restriction_level: 'prohibited', reason: '美国BIS实体清单管制，出口需许可证', alternative_suggestion: '考虑替代品牌通信设备', source: '美国商务部BIS', sort_order: 2 },
    { control_type: 'brand', brand: '海康威视/Hikvision', manufacturer: '杭州海康威视数字技术', control_region: 'US', control_list: 'Entity List / NDAA Section 889', restriction_level: 'restricted', reason: '美国BIS实体清单 + NDAA 889条款禁止联邦政府采购，出口受限制', alternative_suggestion: '考虑Axis(安讯士)/Bosch(博世)/Hanwha(韩华)/大华(部分受限)/本地合规品牌', source: '美国商务部BIS / NDAA', sort_order: 3 },
    { control_type: 'brand', brand: '大华/Dahua', manufacturer: '浙江大华技术', control_region: 'US', control_list: 'Entity List / NDAA Section 889', restriction_level: 'restricted', reason: '美国BIS实体清单 + NDAA 889条款限制', alternative_suggestion: '考虑替代品牌', source: '美国商务部BIS', sort_order: 4 },
    { control_type: 'brand', brand: '大疆/DJI', manufacturer: '深圳市大疆创新科技', control_region: 'US', control_list: 'Entity List', restriction_level: 'restricted', reason: '美国BIS实体清单管制，出口美国受限', alternative_suggestion: '非美国市场可继续使用，美国项目考虑Skydio/Autel等替代', source: '美国商务部BIS', sort_order: 5 },
    { control_type: 'brand', brand: '科大讯飞/iFLYTEK', manufacturer: '科大讯飞', control_region: 'US', control_list: 'Entity List', restriction_level: 'restricted', reason: '美国BIS实体清单管制', alternative_suggestion: '考虑替代语音/AI方案', source: '美国商务部BIS', sort_order: 6 },
    { control_type: 'brand', brand: '商汤/SenseTime', manufacturer: '商汤科技', control_region: 'US', control_list: 'Entity List', restriction_level: 'restricted', reason: '美国BIS实体清单管制（AI人脸识别相关）', alternative_suggestion: '考虑替代AI视觉方案', source: '美国商务部BIS', sort_order: 7 },

    // ===== 敏感物料/技术管控 =====
    { control_type: 'part', part_name: '加密技术/加密软件', control_region: 'US', control_list: 'EAR Category 5 Part 2', restriction_level: 'warning', reason: '美国出口管理条例(EAR)对加密技术/加密软件有特定出口管制要求', alternative_suggestion: '使用非加密版本或符合EAR例外条款的产品', source: 'EAR', sort_order: 20 },
    { control_type: 'part', part_name: '高性能计算芯片/GPU/AI芯片', control_region: 'US', control_list: 'EAR BIS Advanced Computing Rule', restriction_level: 'prohibited', reason: '美国BIS先进计算/半导体制造设备出口管制规则，限制AI芯片、高性能GPU出口', alternative_suggestion: '使用消费级/非受控芯片或合规渠道采购', source: 'BIS Advanced Computing Rule (2022/2023)', sort_order: 21 },
    { control_type: 'part', part_name: '某些无线电/通信设备(含加密)', control_region: 'US', control_list: 'EAR Category 5 Part 1', restriction_level: 'warning', reason: '通信设备、无线电设备受EAR管制，部分频段/加密功能需许可证', alternative_suggestion: '使用FCC认证合规产品', source: 'EAR', sort_order: 22 },
    { control_type: 'part', part_name: '含SVHC>0.1%的物料', control_region: 'EU', control_list: 'REACH SVHC', restriction_level: 'warning', reason: '欧盟REACH法规：物品中SVHC高关注物质含量>0.1%(w/w)需通报，SCIP数据库申报', alternative_suggestion: '要求供应商提供REACH合规声明/SDS，使用低SVHC替代材料', source: 'ECHA REACH SVHC清单(持续更新)', sort_order: 23 },
    { control_type: 'part', part_name: '含RoHS限制物质超标物料', control_region: 'EU/CN', control_list: 'RoHS', restriction_level: 'warning', reason: 'RoHS限制物质(铅/汞/镉/六价铬/PBB/PBDE/4种邻苯)超过限值不得投放市场', alternative_suggestion: '要求供应商提供RoHS检测报告/合规声明，使用RoHS合规元器件', source: 'Directive 2011/65/EU', sort_order: 24 },
    { control_type: 'part', part_name: '冲突矿产(3TG:锡/钽/钨/金)', control_region: 'US/EU', control_list: 'Dodd-Frank Act 1502 / EU Conflict Minerals Regulation', restriction_level: 'warning', reason: '美国Dodd-Frank法案1502条款/欧盟冲突矿产法规要求披露矿产来源，避免来自刚果(金)等冲突地区武装组织资助', alternative_suggestion: '要求供应商提供冲突矿产调查报告(CMRT)、使用CFS认证冶炼厂产品', source: 'Dodd-Frank 1502 / EU 2017/821', sort_order: 25 },
    { control_type: 'part', part_name: '木质包装材料(IPPC)', control_region: 'GLOBAL', control_list: 'ISPM 15', restriction_level: 'warning', reason: '国际植物保护公约(IPPC)ISPM 15标准：国际贸易中木质包装需热处理/熏蒸处理并加IPPC标识', alternative_suggestion: '使用免熏蒸胶合板/OSB/塑料包装替代，或确保木托盘/木箱有IPPC标识', source: 'IPPC ISPM 15', sort_order: 26 },
    { control_type: 'part', part_name: '含放射性物质/激光产品', control_region: 'GLOBAL', control_list: 'IEC / FDA CDRH', restriction_level: 'warning', reason: '激光产品需符合IEC 60825激光安全等级(Class 1/2/3R/3B/4)，FDA CDRH注册', alternative_suggestion: '使用Class 1安全等级激光，提供激光安全评估报告', source: 'IEC 60825 / FDA 21 CFR 1040', sort_order: 27 },
    { control_type: 'part', part_name: '电池/锂电池', control_region: 'GLOBAL', control_list: 'UN 38.3 / IEC 62133', restriction_level: 'warning', reason: '锂电池运输需通过UN 38.3测试，符合UN3480/UN3481运输分类，部分国家有回收/标识要求', alternative_suggestion: '使用有UN38.3报告、IEC 62133认证的电池，MSDS/SDS报告齐全', source: 'UN Manual of Tests and Criteria / IEC 62133', sort_order: 28 },
    { control_type: 'part', part_name: '压力容器/安全泄压装置', control_region: 'EU/NA', control_list: 'PED / ASME BPVC', restriction_level: 'warning', reason: '压力容器需符合PED(欧盟)或ASME BPVC(美国/加拿大)规范，安全阀需CE/ASME认证', alternative_suggestion: '使用有PED/ASME认证的压力容器和安全附件', source: 'PED 2014/68/EU / ASME Boiler and Pressure Vessel Code', sort_order: 29 },
    { control_type: 'part', part_name: '无线通信模块(WiFi/蓝牙/4G/5G)', control_region: 'GLOBAL', control_list: 'RED / FCC / SRRC', restriction_level: 'warning', reason: '无线模块需满足各地区无线电型号核准（欧盟RED、美国FCC ID、中国SRRC、日本TELEC等）', alternative_suggestion: '使用已获得目标市场认证的模块，保留认证证书', source: '各国无线电管理机构', sort_order: 30 },
    { control_type: 'part', part_name: '某些伊朗/朝鲜/叙利亚/古巴来源物料', control_region: 'US/EU', control_list: 'Comprehensive Sanctions', restriction_level: 'prohibited', reason: '美国/欧盟对伊朗、朝鲜、叙利亚、古巴实施全面制裁，禁止进口/出口相关产品和服务', alternative_suggestion: '严格审查供应商和物料来源，避免采购来自受制裁国家的产品', source: 'OFAC SDN List / EU Sanctions Lists', sort_order: 31 }
  ];

  const insert = db.prepare(`INSERT INTO ce_export_controls
    (control_type, part_code, part_name, brand, manufacturer, control_region, control_list,
     restriction_level, reason, alternative_suggestion, source, status, sort_order, last_checked_at)
    VALUES (?,NULL,?,?,?,?,?,?,?,?,?, 'active', ?, datetime('now','localtime'))`);

  const tx = db.transaction(() => {
    controls.forEach(c => {
      insert.run(c.control_type, c.part_name || null, c.brand || null, c.manufacturer || null, c.control_region, c.control_list, c.restriction_level, c.reason, c.alternative_suggestion || null, c.source, c.sort_order);
    });
  });
  tx();
}

function seedCeDataSources() {
  const count = db.prepare('SELECT COUNT(*) as c FROM ce_data_sources').get() as any;
  if (count.c > 0) return;

  const sources = [
    {
      source_code: 'eu_eur_lex_ce', source_name: 'EUR-Lex 欧盟官方法规库（CE指令）',
      source_type: 'http_check', target_table: 'regulations', market: 'EU', category: 'ce',
      url: 'https://eur-lex.europa.eu/homepage.html', parser_type: 'status_check',
      check_interval_hours: 168, enabled: 1, sort_order: 1,
      official_name: 'EUR-Lex (Official Journal of the EU)',
      description: '欧盟官方法律数据库，查询CE相关指令（机械、低电压、EMC、RED、PED等）最新版本与生效状态'
    },
    {
      source_code: 'eu_eur_lex_machinery', source_name: 'EUR-Lex 机械指令2006/42/EC',
      source_type: 'http_check', target_table: 'regulations', market: 'EU', category: 'MD机械安全',
      url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32006L0042', parser_type: 'metadata_check',
      check_interval_hours: 168, enabled: 1, sort_order: 2,
      official_name: 'Directive 2006/42/EC - Machinery',
      description: '欧盟机械指令官方页面，可查询最新修订版本及生效日期'
    },
    {
      source_code: 'eu_eur_lex_lvd', source_name: 'EUR-Lex 低电压指令2014/35/EU',
      source_type: 'http_check', target_table: 'regulations', market: 'EU', category: 'LVD低电压',
      url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014L0035', parser_type: 'metadata_check',
      check_interval_hours: 168, enabled: 1, sort_order: 3,
      official_name: 'Directive 2014/35/EU - LVD',
      description: '欧盟低电压指令(LVD)官方页面'
    },
    {
      source_code: 'eu_eur_lex_emc', source_name: 'EUR-Lex EMC指令2014/30/EU',
      source_type: 'http_check', target_table: 'regulations', market: 'EU', category: 'EMC电磁兼容',
      url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32014L0030', parser_type: 'metadata_check',
      check_interval_hours: 168, enabled: 1, sort_order: 4,
      official_name: 'Directive 2014/30/EU - EMC',
      description: '欧盟电磁兼容指令(EMC)官方页面'
    },
    {
      source_code: 'eu_rohs_eurlex', source_name: 'EUR-Lex RoHS指令2011/65/EU',
      source_type: 'http_check', target_table: 'regulations', market: 'EU', category: 'rohs',
      url: 'https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32011L0065', parser_type: 'metadata_check',
      check_interval_hours: 168, enabled: 1, sort_order: 5,
      official_name: 'Directive 2011/65/EU - RoHS 2',
      description: '欧盟RoHS 2指令官方页面'
    },
    {
      source_code: 'echa_svhc', source_name: 'ECHA SVHC高关注物质清单',
      source_type: 'http_check', target_table: 'export_controls', market: 'EU', category: 'reach',
      url: 'https://echa.europa.eu/candidate-list-table', parser_type: 'status_check',
      check_interval_hours: 168, enabled: 1, sort_order: 10,
      official_name: 'ECHA Candidate List of SVHCs',
      description: '欧洲化学品管理局(ECHA)SVHC候选清单，每6个月更新一次'
    },
    {
      source_code: 'echa_reach_annex_xvii', source_name: 'ECHA REACH限制物质清单(Annex XVII)',
      source_type: 'http_check', target_table: 'regulations', market: 'EU', category: 'reach',
      url: 'https://echa.europa.eu/substances-restricted-under-reach', parser_type: 'status_check',
      check_interval_hours: 168, enabled: 1, sort_order: 11,
      official_name: 'ECHA REACH Annex XVII - Restriction list',
      description: 'REACH法规附件XVII限制物质清单'
    },
    {
      source_code: 'bis_entity_list', source_name: '美国BIS实体清单(Entity List)',
      source_type: 'http_check', target_table: 'export_controls', market: 'US',
      url: 'https://www.bis.doc.gov/index.php/policy-guidance/lists-of-parties-of-concern/entity-list', parser_type: 'status_check',
      check_interval_hours: 168, enabled: 1, sort_order: 20,
      official_name: 'BIS Entity List',
      description: '美国商务部工业与安全局实体清单，出口管制核心清单'
    },
    {
      source_code: 'bis_ear', source_name: '美国出口管理条例(EAR)',
      source_type: 'http_check', target_table: 'regulations', market: 'NA', category: 'export_control',
      url: 'https://www.bis.doc.gov/index.php/regulations/export-administration-regulations-ear', parser_type: 'metadata_check',
      check_interval_hours: 720, enabled: 1, sort_order: 21,
      official_name: 'Export Administration Regulations (EAR)',
      description: '美国出口管理条例，包含商业管制清单(CCL)等'
    },
    {
      source_code: 'ofac_sdn', source_name: '美国OFAC特别指定国民清单(SDN List)',
      source_type: 'http_check', target_table: 'export_controls', market: 'US',
      url: 'https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-list-sdn-list', parser_type: 'status_check',
      check_interval_hours: 168, enabled: 1, sort_order: 22,
      official_name: 'OFAC SDN List',
      description: '美国财政部海外资产控制办公室SDN制裁清单'
    },
    {
      source_code: 'federal_register', source_name: '美国联邦公报(Federal Register)',
      source_type: 'http_check', target_table: 'regulations', market: 'NA',
      url: 'https://www.federalregister.gov/', parser_type: 'status_check',
      check_interval_hours: 168, enabled: 1, sort_order: 23,
      official_name: 'Federal Register',
      description: '美国联邦政府官方公报，发布新规、修订通知'
    },
    {
      source_code: 'ul_standards', source_name: 'UL标准(美国/加拿大安全标准)',
      source_type: 'http_check', target_table: 'regulations', market: 'NA', category: 'ul',
      url: 'https://www.shopulstandards.com/StandardSearch.aspx', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 1, sort_order: 30,
      official_name: 'UL Standards',
      description: '美国保险商实验室UL标准查询（UL 508A/NFPA 79等）'
    },
    {
      source_code: 'nfpa_codes', source_name: 'NFPA美国消防协会规范',
      source_type: 'http_check', target_table: 'regulations', market: 'NA', category: 'ul',
      url: 'https://www.nfpa.org/codes-and-standards', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 1, sort_order: 31,
      official_name: 'NFPA Codes & Standards',
      description: 'NFPA 70(NEC)/NFPA 79等电气与消防安全规范'
    },
    {
      source_code: 'fcc_oet', source_name: 'FCC设备授权数据库(OET)',
      source_type: 'http_check', target_table: 'regulations', market: 'NA', category: 'fcc',
      url: 'https://apps.fcc.gov/oetcf/eas/reports/GenericSearch.cfm', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 1, sort_order: 32,
      official_name: 'FCC OET Equipment Authorization',
      description: '美国FCC设备认证查询'
    },
    {
      source_code: 'cn_samr_cert', source_name: '中国国家认监委CCC认证目录',
      source_type: 'http_check', target_table: 'regulations', market: 'CN', category: 'ccc',
      url: 'http://www.cnca.gov.cn/', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 1, sort_order: 40,
      official_name: '国家认证认可监督管理委员会',
      description: '中国CCC强制性产品认证目录与公告'
    },
    {
      source_code: 'cn_chinarohs', source_name: '中国RoHS合格评定信息公共服务平台',
      source_type: 'http_check', target_table: 'regulations', market: 'CN', category: 'rohs',
      url: 'https://china-rohs.com/', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 1, sort_order: 41,
      official_name: '中国电器电子产品有害物质限制使用公共服务平台',
      description: '中国RoHS国推认证公共服务平台'
    },
    {
      source_code: 'asean_standards', source_name: '东盟标准与质量咨询委员会(ACCSQ)',
      source_type: 'http_check', target_table: 'regulations', market: 'SEA',
      url: 'https://asean.org/our-communities/economic-community/standards-and-conformance/', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 0, sort_order: 50,
      official_name: 'ASEAN ACCSQ',
      description: '东盟标准与合格评定协调机制（默认关闭，按需启用）'
    },
    {
      source_code: 'jp_meti_pse', source_name: '日本METI电安法(PSE)',
      source_type: 'http_check', target_table: 'regulations', market: 'JP', category: 'pse',
      url: 'https://www.meti.go.jp/policy/consumer/seian/denan/', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 0, sort_order: 60,
      official_name: 'METI 電気用品安全法',
      description: '日本经济产业省电安法PSE认证信息（默认关闭）'
    },
    {
      source_code: 'kr_kats_kc', source_name: '韩国技术标准院(KATS) KC认证',
      source_type: 'http_check', target_table: 'regulations', market: 'KR', category: 'kc',
      url: 'https://www.kats.go.kr/', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 0, sort_order: 61,
      official_name: 'KATS Korean Agency for Technology and Standards',
      description: '韩国KC认证官方机构（默认关闭）'
    },
    {
      source_code: 'uk_legislation', source_name: '英国legislation.gov.uk',
      source_type: 'http_check', target_table: 'regulations', market: 'OTHER',
      url: 'https://www.legislation.gov.uk/', parser_type: 'status_check',
      check_interval_hours: 720, enabled: 0, sort_order: 70,
      official_name: 'UK Legislation',
      description: '英国官方法律数据库，查询UKCA/UK REACH等（默认关闭）'
    }
  ];

  const insert = db.prepare(`INSERT INTO ce_data_sources
    (source_code, source_name, source_type, target_table, market, category, url, method,
     parser_type, enabled, check_interval_hours, timeout_ms, sort_order, official_name, description)
    VALUES (?,?,?,?,?,?,?, 'GET', ?, ?, ?, 15000, ?, ?, ?)`);

  const tx = db.transaction(() => {
    sources.forEach(s => {
      insert.run(s.source_code, s.source_name, s.source_type, s.target_table, s.market || null,
        s.category || null, s.url, s.parser_type, s.enabled, s.check_interval_hours,
        s.sort_order, s.official_name, s.description);
    });
  });
  tx();
}

export function getDb() {
  if (!db) {
    initDatabase();
  }
  return db;
}

export default getDb;
