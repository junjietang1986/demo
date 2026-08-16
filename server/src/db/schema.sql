-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  feishu_user_id TEXT,
  feishu_open_id TEXT,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 审批流程配置表
CREATE TABLE IF NOT EXISTS approval_flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 审批记录表
CREATE TABLE IF NOT EXISTS approval_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  flow_id INTEGER,
  current_step INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  submitter_id INTEGER,
  submitted_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  reject_reason TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (flow_id) REFERENCES approval_flows(id),
  FOREIGN KEY (submitter_id) REFERENCES users(id)
);

-- 审批步骤记录表
CREATE TABLE IF NOT EXISTS approval_step_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_record_id INTEGER NOT NULL,
  step_index INTEGER NOT NULL,
  approver_id INTEGER NOT NULL,
  approver_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  approved_at TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (approval_record_id) REFERENCES approval_records(id),
  FOREIGN KEY (approver_id) REFERENCES users(id)
);

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_type TEXT NOT NULL,
  project_code TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  customer TEXT,
  mech_designer_id INTEGER,
  elec_designer_id INTEGER,
  test_designer_id INTEGER,
  assembly_team TEXT,
  electrician_lead_id INTEGER,
  fitter_lead_id INTEGER,
  project_manager_id INTEGER,
  status TEXT NOT NULL DEFAULT 'planning',
  description TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (mech_designer_id) REFERENCES users(id),
  FOREIGN KEY (elec_designer_id) REFERENCES users(id),
  FOREIGN KEY (test_designer_id) REFERENCES users(id),
  FOREIGN KEY (electrician_lead_id) REFERENCES users(id),
  FOREIGN KEY (fitter_lead_id) REFERENCES users(id),
  FOREIGN KEY (project_manager_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 工位表
CREATE TABLE IF NOT EXISTS workstations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  station_code TEXT NOT NULL,
  station_name TEXT NOT NULL,
  description TEXT,
  mech_designer_id INTEGER,
  mech_designer_name TEXT,
  elec_designer_id INTEGER,
  elec_designer_name TEXT,
  meas_control_designer_id INTEGER,
  meas_control_designer_name TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 项目计划表
CREATE TABLE IF NOT EXISTS project_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  plan_name TEXT NOT NULL,
  department TEXT,
  version INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_record_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_record_id) REFERENCES approval_records(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 里程碑/任务表
CREATE TABLE IF NOT EXISTS plan_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  parent_id INTEGER DEFAULT 0,
  predecessor_id INTEGER DEFAULT 0,
  scheduling_mode TEXT NOT NULL DEFAULT 'auto',
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'task',
  department TEXT,
  assignee_id INTEGER,
  start_date TEXT,
  end_date TEXT,
  actual_start_date TEXT,
  actual_end_date TEXT,
  progress INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_days INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  wbs_code TEXT,
  milestone_summary TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (plan_id) REFERENCES project_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)
);

-- 交付物表
CREATE TABLE IF NOT EXISTS deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  task_id INTEGER,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (task_id) REFERENCES plan_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- OPL单点课程表
CREATE TABLE IF NOT EXISTS opl_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurrence_date TEXT NOT NULL,
  project_id INTEGER,
  project_code TEXT,
  project_name TEXT,
  workstation_id INTEGER,
  station_code TEXT,
  station_name TEXT,
  responsible_dept TEXT NOT NULL,
  responsible_person_id INTEGER,
  handler_id INTEGER,
  problem_description TEXT NOT NULL,
  solution_plan TEXT,
  planned_completion_date TEXT,
  actual_completion_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  improvement_initiated INTEGER DEFAULT 0,
  improvement_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (workstation_id) REFERENCES workstations(id),
  FOREIGN KEY (responsible_person_id) REFERENCES users(id),
  FOREIGN KEY (handler_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 过程异常及巡检问题表
CREATE TABLE IF NOT EXISTS anomaly_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurrence_date TEXT NOT NULL,
  anomaly_type TEXT NOT NULL DEFAULT 'process',
  project_id INTEGER,
  project_code TEXT,
  project_name TEXT,
  workstation_id INTEGER,
  station_code TEXT,
  station_name TEXT,
  responsible_dept TEXT NOT NULL,
  responsible_person_id INTEGER,
  project_manager_id INTEGER,
  problem_description TEXT NOT NULL,
  solution_plan TEXT,
  planned_completion_date TEXT,
  actual_completion_date TEXT,
  part_number TEXT,
  part_spec TEXT,
  supplier TEXT,
  designer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  improvement_initiated INTEGER DEFAULT 0,
  improvement_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (workstation_id) REFERENCES workstations(id),
  FOREIGN KEY (responsible_person_id) REFERENCES users(id),
  FOREIGN KEY (project_manager_id) REFERENCES users(id),
  FOREIGN KEY (designer_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 验收配置项表
CREATE TABLE IF NOT EXISTS acceptance_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_type TEXT NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_description TEXT,
  standard TEXT,
  method TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 验收单表
CREATE TABLE IF NOT EXISTS acceptance_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  project_type TEXT NOT NULL,
  form_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_record_id INTEGER,
  acceptance_date TEXT,
  conclusion TEXT,
  created_by INTEGER,
  submitted_at TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_record_id) REFERENCES approval_records(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 验收单明细表
CREATE TABLE IF NOT EXISTS acceptance_form_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL,
  workstation_id INTEGER,
  config_id INTEGER,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  standard TEXT,
  method TEXT,
  result TEXT,
  is_pass INTEGER,
  remark TEXT,
  inspector_id INTEGER,
  inspect_date TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (form_id) REFERENCES acceptance_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (workstation_id) REFERENCES workstations(id),
  FOREIGN KEY (config_id) REFERENCES acceptance_configs(id),
  FOREIGN KEY (inspector_id) REFERENCES users(id)
);

-- 验收附表表
CREATE TABLE IF NOT EXISTS acceptance_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL,
  attach_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (form_id) REFERENCES acceptance_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- 验收计划表
CREATE TABLE IF NOT EXISTS acceptance_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  plan_name TEXT NOT NULL,
  plan_items TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  approval_record_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_record_id) REFERENCES approval_records(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 验收计划项表
CREATE TABLE IF NOT EXISTS acceptance_plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  assignee_id INTEGER,
  planned_date TEXT,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  deliverable_required INTEGER DEFAULT 1,
  result TEXT,
  remark TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (plan_id) REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)
);

-- 持续改进流程表
CREATE TABLE IF NOT EXISTS improvements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  improvement_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source_module TEXT,
  source_record_id INTEGER,
  problem_description TEXT NOT NULL,
  root_cause_analysis TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  responsible_dept TEXT,
  responsible_person_id INTEGER,
  planned_completion_date TEXT,
  actual_completion_date TEXT,
  effectiveness_verification TEXT,
  verifier_id INTEGER,
  verify_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  current_step INTEGER DEFAULT 1,
  step_data TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (responsible_person_id) REFERENCES users(id),
  FOREIGN KEY (verifier_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 改进流程附件
CREATE TABLE IF NOT EXISTS improvement_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  improvement_id INTEGER NOT NULL,
  step_name TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (improvement_id) REFERENCES improvements(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- 文档版本快照表（PLM式版本管理）
CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  version_label TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_current INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'manual',
  change_summary TEXT,
  snapshot_data TEXT,
  approval_record_id INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  approved_at TEXT,
  FOREIGN KEY (approval_record_id) REFERENCES approval_records(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 导入批次表（记录每次导入操作）
CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  errors TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requires_confirm INTEGER NOT NULL DEFAULT 0,
  batch_data TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  confirmed_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_workstations_project ON workstations(project_id);
CREATE INDEX IF NOT EXISTS idx_plans_project ON project_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan ON plan_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_opl_project ON opl_records(project_id);
CREATE INDEX IF NOT EXISTS idx_opl_status ON opl_records(status);
CREATE INDEX IF NOT EXISTS idx_opl_date ON opl_records(occurrence_date);
CREATE INDEX IF NOT EXISTS idx_anomaly_project ON anomaly_records(project_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_status ON anomaly_records(status);
CREATE INDEX IF NOT EXISTS idx_anomaly_date ON anomaly_records(occurrence_date);
CREATE INDEX IF NOT EXISTS idx_acceptance_configs_type ON acceptance_configs(project_type);
CREATE INDEX IF NOT EXISTS idx_acceptance_forms_project ON acceptance_forms(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_project ON acceptance_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_records_module ON approval_records(module, record_id);
CREATE INDEX IF NOT EXISTS idx_improvements_status ON improvements(status);
CREATE INDEX IF NOT EXISTS idx_doc_versions_module ON document_versions(module, record_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_current ON document_versions(module, is_current);
CREATE INDEX IF NOT EXISTS idx_import_batches_module ON import_batches(module);

-- CE物料存档库表
CREATE TABLE IF NOT EXISTS ce_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER DEFAULT 0,
  material_code TEXT,
  material_name TEXT NOT NULL,
  specification TEXT,
  brand TEXT,
  category TEXT,
  certificate_no TEXT,
  cert_standard TEXT,
  cert_body TEXT,
  cert_issue_date TEXT,
  cert_expiry_date TEXT,
  supplier TEXT,
  applicable_scope TEXT,
  cert_file_name TEXT,
  cert_file_path TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- CE物料附件表
CREATE TABLE IF NOT EXISTS ce_material_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (material_id) REFERENCES ce_materials(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ce_materials_code ON ce_materials(material_code);
CREATE INDEX IF NOT EXISTS idx_ce_materials_category ON ce_materials(category);
CREATE INDEX IF NOT EXISTS idx_ce_materials_status ON ce_materials(status);
CREATE INDEX IF NOT EXISTS idx_ce_materials_expiry ON ce_materials(cert_expiry_date);
CREATE INDEX IF NOT EXISTS idx_ce_material_attachments_material ON ce_material_attachments(material_id);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_by INTEGER,
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- 默认管理员用户由 database.ts 初始化时创建，确保密码正确
