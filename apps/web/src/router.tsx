import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Role } from '@axaxax/shared';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { UploadWizard } from './pages/Upload';
import { CashDaily } from './pages/CashDaily';
import { MonthlyClosing } from './pages/MonthlyClosing';
import { Reports } from './pages/Reports';
import { ReportViewer } from './pages/ReportViewer';
import { AuditLogPage } from './pages/AuditLog';

// 모든 보호 라우트는 AppLayout + ProtectedRoute 아래. /login만 공개.
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'upload', element: <UploadWizard /> },
      { path: 'cash-daily', element: <CashDaily /> },
      { path: 'monthly-closing', element: <MonthlyClosing /> },
      { path: 'reports', element: <Reports /> },
      { path: 'reports/:reportId', element: <ReportViewer /> },
      {
        path: 'audit-log',
        // 감사 로그는 APPROVER/ADMIN 전용(§2.1).
        element: (
          <ProtectedRoute roles={[Role.FINANCE_APPROVER, Role.ADMIN]}>
            <AuditLogPage />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
