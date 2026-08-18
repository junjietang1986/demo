/**
 * 恢复 CE 模块种子数据脚本
 *
 * 1. 清理 CE物料清单和文档存档（ce_materials, ce_material_archives, ce_archive_batches, ce_project_bom_items）
 * 2. 恢复法规（ce_regulations）、进出口物料管控（ce_export_controls）、法规数据源（ce_data_sources）的种子数据
 *
 * 运行方式: npx tsx server/scripts/restore-ce-seed-data.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDatabase } from '../src/db/database';

const DB_PATH = path.join(__dirname, '..', 'data', 'qms.db');
console.log('📊 数据库路径:', DB_PATH);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ 数据库文件不存在！');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

try {
  db.exec('BEGIN TRANSACTION');

  // ========== 第一步：清理 CE物料清单和文档存档 ==========

  // 删除存档相关的审批记录
  db.exec("DELETE FROM approval_step_records WHERE approval_record_id IN (SELECT id FROM approval_records WHERE module = 'ce_archive')");
  db.exec("DELETE FROM approval_records WHERE module = 'ce_archive'");

  // 删除 CE 物料文档存档
  db.exec('DELETE FROM ce_material_archives');
  // 删除存档批次
  db.exec('DELETE FROM ce_archive_batches');
  // 删除项目 BOM 关联
  db.exec('DELETE FROM ce_project_bom_items');
  // 删除 CE 物料
  db.exec('DELETE FROM ce_materials');
  // 重置文档类型序列号
  db.exec('UPDATE ce_doc_types SET current_seq = 0');

  console.log('✅ 第一步完成：CE物料清单和文档存档已清理');

  // ========== 第二步：清空法规、进出口管控、数据源表（为恢复种子数据做准备） ==========

  db.exec('DELETE FROM ce_update_logs');
  db.exec('DELETE FROM ce_data_sources');
  db.exec('DELETE FROM ce_export_controls');
  db.exec('DELETE FROM ce_regulations');

  console.log('✅ 第二步完成：已清空法规、进出口管控、数据源表');

  db.exec('COMMIT');
} catch (err: any) {
  db.exec('ROLLBACK');
  console.error('❌ 清理失败:', err.message);
  db.close();
  process.exit(1);
}

db.close();

// ========== 第三步：调用 initDatabase 重新种子 ==========
// initDatabase() -> runMigrations() -> seedCeRegulations/seedCeExportControls/seedCeDataSources
// 由于表已清空，种子函数将插入默认数据

console.log('⏳ 正在调用 initDatabase() 恢复种子数据...');
initDatabase();
console.log('✅ initDatabase() 完成，种子数据已恢复');

// ========== 第四步：验证结果 ==========
const db2 = new Database(DB_PATH);
const tables = [
  { name: 'ce_regulations', expect: '>0', label: '法规' },
  { name: 'ce_export_controls', expect: '>0', label: '进出口物料管控' },
  { name: 'ce_data_sources', expect: '>0', label: '法规数据源' },
  { name: 'ce_materials', expect: '0', label: 'CE物料清单（应保持清空）' },
  { name: 'ce_material_archives', expect: '0', label: '文档存档（应保持清空）' },
  { name: 'ce_archive_batches', expect: '0', label: '存档批次（应保持清空）' },
  { name: 'ce_doc_types', expect: '4', label: '文档类型' },
];

console.log('\n📋 数据恢复结果:');
tables.forEach(t => {
  const result = db2.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get() as any;
  const ok = t.expect === '>0' ? result.c > 0 : String(result.c) === t.expect;
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${t.label} (${t.name}): ${result.c} 条`);
});

db2.close();
console.log('\n🎉 恢复完成！');
process.exit(0);
