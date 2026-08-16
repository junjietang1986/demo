export interface User {
  id: number;
  username: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  job_title?: string;
  role: string;
  role_label?: string;
  avatar?: string;
  status: string;
  created_at: string;
}

export interface PermissionItem {
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export interface UserPermissions {
  role: string;
  role_name: string;
  permissions: Record<string, PermissionItem>;
  menuTree: MenuItem[];
}

export interface PermissionModule {
  id: number;
  code: string;
  name: string;
  parent_code: string | null;
  icon: string | null;
  path: string | null;
  sort_order: number;
  is_menu: number;
}

export interface Role {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: number;
  is_builtin: number;
  dept_id: string | null;
  dept_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RoleWithPermissions {
  code: string;
  name: string;
  description: string | null;
  is_builtin: number;
  is_system: number;
  permissions: Array<{
    id: number;
    role_code: string;
    module_code: string;
    can_view: number;
    can_edit: number;
    can_delete: number;
    can_approve: number;
  }>;
}

export interface MenuItem {
  key: string;
  code: string;
  label: string;
  icon?: string;
  path?: string;
  children?: MenuItem[];
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '系统管理员',
  dept_manager: '部门经理',
  project_manager: '项目经理',
  qa_engineer: '质量工程师',
  doc_controller: '文控',
  user: '普通用户'
};

export const ROLE_COLORS: Record<string, string> = {
  super_admin: 'red',
  admin: 'purple',
  dept_manager: 'blue',
  project_manager: 'cyan',
  qa_engineer: 'green',
  doc_controller: 'orange',
  user: 'default'
};

export interface Project {
  id: number;
  project_type: string;
  project_code: string;
  project_name: string;
  customer?: string;
  customer_id?: number;
  customer_name?: string;
  customer_code?: string;
  customer_type?: string;
  mech_designer_id?: number;
  mech_designer_name?: string;
  elec_designer_id?: number;
  elec_designer_name?: string;
  test_designer_id?: number;
  test_designer_name?: string;
  assembly_team?: string;
  electrician_lead_id?: number;
  electrician_lead_name?: string;
  fitter_lead_id?: number;
  fitter_lead_name?: string;
  project_manager_id?: number;
  project_manager_name?: string;
  status: string;
  description?: string;
  workstations?: Workstation[];
  apqp_phase?: number;
  apqp_status?: string;
  health_status?: string;
  kickoff_date?: string;
  planned_fat_date?: string;
  planned_sat_date?: string;
  planned_sop_date?: string;
  actual_fat_date?: string;
  actual_sat_date?: string;
  actual_sop_date?: string;
  project_priority?: string;
  contract_amount?: number;
  customer_requirements?: string;
  feasibility_status?: string;
  lessons_learned_note?: string;
  apqp_phases?: any[];
  apqp_gates?: any[];
  risks?: any[];
  created_at: string;
  updated_at: string;
}

export interface Workstation {
  id: number;
  project_id: number;
  station_code: string;
  station_name: string;
  description?: string;
  mech_designer_id?: number;
  mech_designer_name?: string;
  elec_designer_id?: number;
  elec_designer_name?: string;
  meas_control_designer_id?: number;
  meas_control_designer_name?: string;
  sort_order: number;
}

export interface ProjectPlan {
  id: number;
  project_id: number;
  plan_name: string;
  department?: string;
  version: number;
  status: string;
  tasks?: PlanTask[];
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface PlanTask {
  id: number;
  plan_id: number;
  parent_id: number;
  predecessor_id?: number;
  scheduling_mode?: string;
  task_name: string;
  task_type: string;
  department?: string;
  assignee_id?: number;
  assignee_name?: string;
  start_date?: string;
  end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  progress: number;
  status: string;
  sort_order: number;
  level: number;
  duration_days?: number;
  wbs_code?: string;
  milestone_summary?: string;
  children?: PlanTask[];
  deliverables?: Deliverable[];
}

export interface Deliverable {
  id: number;
  module: string;
  record_id: number;
  task_id?: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  uploaded_by?: number;
  created_at: string;
}

export interface ApprovalFlow {
  id: number;
  module: string;
  flow_name: string;
  description?: string;
  steps: ApprovalStep[];
  is_default: number;
  created_at: string;
}

export interface ApprovalStep {
  step: number;
  name: string;
  role: string;
  description: string;
}

export interface ApprovalRecord {
  id: number;
  module: string;
  record_id: number;
  flow_id: number;
  current_step: number;
  status: string;
  submitter_id?: number;
  submitter_name?: string;
  submitted_at?: string;
  approved_at?: string;
  rejected_at?: string;
  reject_reason?: string;
  step_records?: ApprovalStepRecord[];
  created_at: string;
}

export interface ApprovalStepRecord {
  id: number;
  approval_record_id: number;
  step_index: number;
  approver_id: number;
  approver_name: string;
  status: string;
  comment?: string;
  approved_at?: string;
}

export interface OPLRecord {
  id: number;
  occurrence_date: string;
  project_id?: number;
  project_code?: string;
  project_name?: string;
  workstation_id?: number;
  station_code?: string;
  station_name?: string;
  responsible_dept: string;
  responsible_person_id?: number;
  responsible_person_name?: string;
  handler_id?: number;
  handler_name?: string;
  problem_description: string;
  solution_plan?: string;
  planned_completion_date?: string;
  actual_completion_date?: string;
  status: string;
  improvement_initiated: number;
  improvement_id?: number;
  created_at: string;
  updated_at: string;
}

export interface AnomalyRecord {
  id: number;
  occurrence_date: string;
  anomaly_type: string;
  project_id?: number;
  project_code?: string;
  project_name?: string;
  workstation_id?: number;
  station_code?: string;
  station_name?: string;
  responsible_dept: string;
  responsible_person_id?: number;
  responsible_person_name?: string;
  project_manager_id?: number;
  project_manager_name?: string;
  problem_description: string;
  solution_plan?: string;
  planned_completion_date?: string;
  actual_completion_date?: string;
  part_number?: string;
  part_spec?: string;
  supplier?: string;
  designer_id?: number;
  designer_name?: string;
  status: string;
  improvement_initiated: number;
  improvement_id?: number;
  created_at: string;
  updated_at: string;
}

export interface AcceptanceConfig {
  id: number;
  project_type: string;
  category: string;
  item_name: string;
  item_description?: string;
  standard?: string;
  method?: string;
  sort_order: number;
  is_active: number;
}

export interface AcceptanceForm {
  id: number;
  project_id: number;
  project_type: string;
  form_code: string;
  status: string;
  approval_record_id?: number;
  acceptance_date?: string;
  conclusion?: string;
  items?: AcceptanceFormItem[];
  attachments?: AcceptanceAttachment[];
  project_name?: string;
  project_code?: string;
  created_at: string;
}

export interface AcceptanceFormItem {
  id: number;
  form_id: number;
  workstation_id?: number;
  workstation_name?: string;
  config_id?: number;
  category: string;
  item_name: string;
  standard?: string;
  method?: string;
  result?: string;
  is_pass?: number;
  remark?: string;
  inspector_id?: number;
  inspector_name?: string;
  inspect_date?: string;
  sort_order: number;
}

export interface AcceptanceAttachment {
  id: number;
  form_id: number;
  attach_type: string;
  file_name: string;
  file_path: string;
  file_size?: number;
}

export interface AcceptancePlan {
  id: number;
  project_id: number;
  plan_name: string;
  start_date?: string;
  end_date?: string;
  status: string;
  version: number;
  project_name?: string;
  project_code?: string;
  items?: AcceptancePlanItem[];
  created_at: string;
}

export interface AcceptancePlanItem {
  id: number;
  plan_id: number;
  item_name: string;
  item_type: string;
  assignee_id?: number;
  assignee_name?: string;
  planned_date?: string;
  actual_date?: string;
  status: string;
  deliverable_required: number;
  result?: string;
  remark?: string;
  sort_order: number;
  deliverables?: Deliverable[];
}

export interface Improvement {
  id: number;
  improvement_code: string;
  title: string;
  source_module?: string;
  source_record_id?: number;
  problem_description: string;
  root_cause_analysis?: string;
  corrective_action?: string;
  preventive_action?: string;
  responsible_dept?: string;
  responsible_person_id?: number;
  responsible_person_name?: string;
  planned_completion_date?: string;
  actual_completion_date?: string;
  effectiveness_verification?: string;
  verifier_id?: number;
  verifier_name?: string;
  verify_date?: string;
  status: string;
  step_data?: string;
  current_step: number;
  attachments?: ImprovementAttachment[];
  created_at: string;
}

export interface ImprovementAttachment {
  id: number;
  improvement_id: number;
  step_name?: string;
  file_name: string;
  file_path: string;
  file_size?: number;
}

export const PROJECT_TYPES = [
  { value: 'G项目-小工装', label: 'G项目-小工装' },
  { value: 'P项目-产线', label: 'P项目-产线' },
  { value: 'P项目-实验室设备', label: 'P项目-实验室设备' }
];

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  pending: { label: '待审批', color: 'warning' },
  approved: { label: '已批准', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  planning: { label: '规划中', color: 'default' },
  in_progress: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  open: { label: '待处理', color: 'warning' },
  closed: { label: '已关闭', color: 'success' },
  cancelled: { label: '已取消', color: 'default' }
};

export const DEPARTMENTS = [
  '机械设计部', '电气设计部', '测试部', '装配部', '质检部', '项目部', '管理部'
];

export interface CEMaterial {
  id: number;
  sort_no?: number;
  part_code?: string;
  part_name: string;
  spec?: string;
  brand?: string;
  category?: string;
  alternative_model?: string;
  selector_name?: string;
  purchaser_name?: string;
  remarks?: string;
  // 状态字段（人工枚举）
  nande_status?: string;       // 南德: pending/approved/deviation/rejected/na
  ouce_status?: string;        // 欧测: 同上
  compliance_status?: string;  // 合规: pending/compliant/non_compliant/deviation/not_required
  archive_status_manual?: string; // 存档: not_archived/archived/no_cert/no_manual
  alternative_suggestion?: string;
  reject_reason?: string;
  approval_remark?: string;
  archive_count?: number;
  archive_names?: string;
  batches?: CEArchiveBatch[];
  archives?: CEArchive[];
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CEArchiveBatch {
  id: number;
  batch_code: string;
  material_id: number;
  project_id?: number;
  workstation_id?: number;
  title?: string;
  archive_ids: string;
  status: string;
  approval_status: string;
  flow_instance_id?: string;
  submitter_id?: number;
  submitter_name?: string;
  submitted_at?: string;
  approver_id?: number;
  approver_name?: string;
  approved_at?: string;
  reject_reason?: string;
  form_data?: string;
  created_at?: string;
}

export interface CEMaterialAttachment {
  id: number;
  material_id: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  uploader_name?: string;
  uploaded_by?: number;
  created_at: string;
}

export interface CEDocType {
  id: number;
  type_code: string;
  type_name: string;
  description?: string;
  code_prefix: string;
  seq_length: number;
  current_seq: number;
  sort_order?: number;
  is_enabled: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CEArchive {
  id: number;
  material_id: number;
  doc_type_id: number;
  archive_code: string;
  file_name: string;
  original_name: string;
  file_path?: string;
  file_url?: string;
  file_size?: number;
  file_type?: string;
  project_id?: number;
  workstation_id?: number;
  cert_no?: string;
  version_no?: string;
  batch_id?: string;
  status?: string;
  approval_status: string;
  flow_instance_id?: number;
  submitter_id?: number;
  submitter_name?: string;
  submitted_at?: string;
  approver_id?: number;
  approver_name?: string;
  approved_at?: string;
  reject_reason?: string;
  remarks?: string;
  type_name?: string;
  type_code?: string;
  code_prefix?: string;
  is_bound?: number;
  source_archive_id?: number;
  replaces_archive_id?: number;
  change_remark?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CEProjectBomItem {
  id: number;
  project_id: number;
  workstation_id?: number;
  workstation_name?: string;
  bom_row_no?: number;
  part_code?: string;
  part_name?: string;
  part_spec?: string;
  brand?: string;
  qty?: number;
  match_status: string;
  ce_material_id?: number;
  ce_name?: string;
  ce_spec?: string;
  ce_brand?: string;
  nande_status?: string;
  ouce_status?: string;
  compliance_status?: string;
  archive_status_manual?: string;
  alternative_suggestion?: string;
  archive_names?: string;
  import_batch_id?: string;
  created_by?: number;
}

export const CE_MATERIAL_CATEGORIES = [
  '电气', '机械', '视觉', '测试', '标准化'
];

export const NANDE_STATUS_OPTIONS = [
  { value: 'pending',   label: '未确认' },
  { value: 'approved',  label: '认可' },
  { value: 'deviation', label: '偏差认可' },
  { value: 'rejected',  label: '不认可' },
  { value: 'na',        label: '-' }
];
export const OUCE_STATUS_OPTIONS = NANDE_STATUS_OPTIONS;

export const COMPLIANCE_STATUS_OPTIONS = [
  { value: 'pending',       label: '待确认' },
  { value: 'compliant',     label: '合规' },
  { value: 'non_compliant', label: '不合规' },
  { value: 'deviation',     label: '偏差' },
  { value: 'not_required',  label: '不需要' }
];

export const ARCHIVE_STATUS_MANUAL_OPTIONS = [
  { value: 'not_archived', label: '未存档' },
  { value: 'archived',     label: '已存档' },
  { value: 'no_cert',      label: '没有证书/DOC' },
  { value: 'no_manual',    label: '没有英文说明书' }
];

export const NANDE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: '未确认',   color: 'cyan' },
  approved:   { label: '认可',     color: 'success' },
  deviation:  { label: '偏差认可', color: 'warning' },
  rejected:   { label: '不认可',   color: 'error' },
  na:         { label: '-',        color: 'default' }
};
export const OUCE_STATUS_MAP = NANDE_STATUS_MAP;
export const COMPLIANCE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:        { label: '待确认', color: 'processing' },
  compliant:      { label: '合规',   color: 'success' },
  non_compliant:  { label: '不合规', color: 'error' },
  deviation:      { label: '偏差',   color: 'warning' },
  not_required:   { label: '不需要', color: 'default' }
};
export const ARCHIVE_STATUS_MANUAL_MAP: Record<string, { label: string; color: string }> = {
  not_archived: { label: '未存档',         color: 'default' },
  archived:     { label: '已存档',         color: 'success' },
  no_cert:      { label: '没有证书/DOC',   color: 'warning' },
  no_manual:    { label: '没有英文说明书', color: 'warning' }
};

export const CE_APPROVAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:    { label: '草稿',   color: 'default' },
  pending:  { label: '审批中', color: 'orange' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已驳回', color: 'error' }
};

export const CE_BOM_MATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  matched:   { label: '已匹配', color: 'success' },
  added:     { label: '新增',   color: 'processing' },
  unmatched: { label: '未匹配', color: 'error' }
};
