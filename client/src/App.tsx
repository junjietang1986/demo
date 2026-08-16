import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from './store';
import MainLayout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectList from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';
import ProjectPlan from './pages/ProjectPlan';
import OPLPage from './pages/OPLPage';
import AnomalyPage from './pages/AnomalyPage';
import AcceptanceConfig from './pages/AcceptanceConfig';
import AcceptanceFormList from './pages/AcceptanceFormList';
import AcceptanceFormDetail from './pages/AcceptanceFormDetail';
import AcceptancePlanList from './pages/AcceptancePlanList';
import AcceptancePlanDetail from './pages/AcceptancePlanDetail';
import ApprovalConfig from './pages/ApprovalConfig';
import ApprovalList from './pages/ApprovalList';
import ImprovementList from './pages/ImprovementList';
import ImprovementDetail from './pages/ImprovementDetail';
import Reports from './pages/Reports';
import UserManagement from './pages/UserManagement';
import FeishuConfig from './pages/FeishuConfig';
import CEMaterialPage from './pages/CEMaterialPage';
import CeRegulationsPage from './pages/CeRegulationsPage';
import CeExportControlPage from './pages/CeExportControlPage';
import CeDataSourcesPage from './pages/CeDataSourcesPage';
import FileManagement from './pages/FileManagement';
import PermissionConfig from './pages/PermissionConfig';
import SystemSettings from './pages/SystemSettings';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = useAppStore(s => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const { token, user } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (token && !user) {
      navigate('/login');
    }
  }, [token, user, navigate]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="plans/:id" element={<ProjectPlan />} />
        <Route path="qms/opl" element={<OPLPage />} />
        <Route path="qms/anomaly" element={<AnomalyPage />} />
        <Route path="acceptance/configs" element={<AcceptanceConfig />} />
        <Route path="acceptance/forms" element={<AcceptanceFormList />} />
        <Route path="acceptance/forms/:id" element={<AcceptanceFormDetail />} />
        <Route path="acceptance/plans" element={<AcceptancePlanList />} />
        <Route path="acceptance/plans/:id" element={<AcceptancePlanDetail />} />
        <Route path="approval/config" element={<ApprovalConfig />} />
        <Route path="approval/list" element={<ApprovalList />} />
        <Route path="improvement" element={<ImprovementList />} />
        <Route path="improvement/:id" element={<ImprovementDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="ce-materials" element={<CEMaterialPage />} />
        <Route path="ce-regulations" element={<CeRegulationsPage />} />
        <Route path="ce-export-control" element={<CeExportControlPage />} />
        <Route path="ce-data-sources" element={<CeDataSourcesPage />} />
        <Route path="files" element={<FileManagement />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="settings/feishu" element={<FeishuConfig />} />
        <Route path="settings/system" element={<SystemSettings />} />
        <Route path="settings/permissions" element={<PermissionConfig />} />
        <Route path="settings/roles" element={<PermissionConfig />} />
      </Route>
    </Routes>
  );
};

export default App;
