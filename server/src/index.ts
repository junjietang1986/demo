import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './db/database';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import planRoutes from './routes/plans';
import qmsRoutes from './routes/qms';
import acceptanceRoutes from './routes/acceptance';
import approvalRoutes from './routes/approval';
import improvementRoutes from './routes/improvement';
import reportRoutes from './routes/reports';
import userRoutes from './routes/users';
import impexpRoutes from './routes/impexp';
import feishuRoutes, { initFeishuAutoSync } from './routes/feishu';
import ceMaterialRoutes from './routes/ce_materials';
import ceComplianceRoutes, { initCeComplianceAutoCheck } from './routes/ce_compliance';
import permissionRoutes from './routes/permissions';
import planTemplateRoutes, { initPlanTemplates } from './routes/plan-templates';
import customerRoutes from './routes/customers';
import bomRoutes from './routes/bom';
import qualityRoutes from './routes/quality';
import filesRoutes from './routes/files';
import settingsRoutes from './routes/settings';

const app = express();
const PORT = process.env.PORT || 3001;

// 进程级异常保护：防止单请求异常导致整个服务崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err?.message || err, err?.stack);
});
process.on('unhandledRejection', (reason: any, promise) => {
  console.error('[FATAL] unhandledRejection:', reason?.message || reason, reason?.stack);
});

app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

const uploadsDir = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

initDatabase();
initPlanTemplates();

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/qms', qmsRoutes);
app.use('/api/acceptance', acceptanceRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/improvement', improvementRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/impexp', impexpRoutes);
app.use('/api/feishu', feishuRoutes);
app.use('/api/ce-materials', ceMaterialRoutes);
app.use('/api/ce-compliance', ceComplianceRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/plan-templates', planTemplateRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/bom', bomRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/settings', settingsRoutes);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

const server = app.listen(PORT, () => {
  console.log(`🚀 TRAC QMS Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  setTimeout(() => {
    initFeishuAutoSync();
    initCeComplianceAutoCheck();
  }, 2000);
});
server.setTimeout(30 * 60 * 1000);
server.keepAliveTimeout = 60 * 1000;
server.headersTimeout = 65 * 1000;
