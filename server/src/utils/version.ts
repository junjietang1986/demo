import { getDb } from '../db/database';

export interface VersionSnapshot {
  module: string;
  recordId: number;
  versionNo: number;
  versionLabel?: string;
  status: string;
  sourceType: string;
  changeSummary?: string;
  snapshotData: any;
  createdBy: number;
}

export function createVersionSnapshot(snapshot: VersionSnapshot): number {
  const db = getDb();

  db.prepare(
    'UPDATE document_versions SET is_current = 0 WHERE module = ? AND record_id = ? AND is_current = 1'
  ).run(snapshot.module, snapshot.recordId);

  const result = db.prepare(
    `INSERT INTO document_versions 
     (module, record_id, version_no, version_label, status, is_current, source_type, change_summary, snapshot_data, created_by)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(
    snapshot.module,
    snapshot.recordId,
    snapshot.versionNo,
    snapshot.versionLabel || `V${snapshot.versionNo}`,
    snapshot.status,
    snapshot.sourceType,
    snapshot.changeSummary || '',
    JSON.stringify(snapshot.snapshotData),
    snapshot.createdBy
  );

  return Number(result.lastInsertRowid);
}

export function getVersionHistory(module: string, recordId: number): any[] {
  const db = getDb();
  return db.prepare(
    `SELECT v.*, u.name as creator_name 
     FROM document_versions v 
     LEFT JOIN users u ON v.created_by = u.id 
     WHERE v.module = ? AND v.record_id = ? 
     ORDER BY v.version_no DESC`
  ).all(module, recordId);
}

export function getLatestVersion(module: string, recordId: number): any {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM document_versions WHERE module = ? AND record_id = ? ORDER BY version_no DESC LIMIT 1`
  ).get(module, recordId);
}

export function getCurrentVersion(module: string, recordId: number): any {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM document_versions WHERE module = ? AND record_id = ? AND is_current = 1`
  ).get(module, recordId);
}

export function getNextVersionNo(module: string, recordId: number): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT MAX(version_no) as max_ver FROM document_versions WHERE module = ? AND record_id = ?'
  ).get(module, recordId) as any;
  return (row?.max_ver || 0) + 1;
}

export function approveVersion(module: string, recordId: number, approvalRecordId?: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE document_versions SET status = 'approved', approved_at = datetime('now', 'localtime'), approval_record_id = COALESCE(?, approval_record_id) 
     WHERE module = ? AND record_id = ? AND is_current = 1`
  ).run(approvalRecordId, module, recordId);
}

export function rejectVersion(module: string, recordId: number): void {
  const db = getDb();
  const current = getCurrentVersion(module, recordId);
  if (current) {
    db.prepare(
      `UPDATE document_versions SET status = 'rejected' WHERE id = ?`
    ).run(current.id);

    const prevApproved = db.prepare(
      `SELECT * FROM document_versions WHERE module = ? AND record_id = ? AND status = 'approved' ORDER BY version_no DESC LIMIT 1`
    ).get(module, recordId);

    if (prevApproved) {
      db.prepare('UPDATE document_versions SET is_current = 0 WHERE module = ? AND record_id = ?', module, recordId);
      db.prepare('UPDATE document_versions SET is_current = 1 WHERE id = ?', (prevApproved as any).id);
    }
  }
}

export function createDraftVersion(module: string, recordId: number, data: any, userId: number, sourceType = 'manual', changeSummary = ''): number {
  const versionNo = getNextVersionNo(module, recordId);
  return createVersionSnapshot({
    module,
    recordId,
    versionNo,
    status: 'draft',
    sourceType,
    snapshotData: data,
    createdBy: userId,
    changeSummary
  });
}

export const MODULES_WITH_APPROVAL = new Set(['project_plan', 'acceptance_form', 'acceptance_plan']);
export const MODULES_WITHOUT_APPROVAL = new Set(['project', 'opl', 'anomaly', 'acceptance_config', 'improvement']);

export function moduleNeedsApproval(module: string): boolean {
  return MODULES_WITH_APPROVAL.has(module);
}
