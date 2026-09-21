import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ContractsPage from './pages/ContractsPage';
import ContractDetailPage from './pages/ContractDetailPage';
import NewContractPage from './pages/NewContractPage';
import TemplatesPage from './pages/TemplatesPage';
import DocumentsPage from './pages/DocumentsPage';
import PaymentsPage from './pages/PaymentsPage';
import NotificationsPage from './pages/NotificationsPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="clientes/:id" element={<ClientDetailPage />} />
          <Route path="contratos" element={<ContractsPage />} />
          <Route path="contratos/novo" element={<NewContractPage />} />
          <Route path="contratos/:id" element={<ContractDetailPage />} />
          <Route path="modelos" element={<TemplatesPage />} />
          <Route path="documentos" element={<DocumentsPage />} />
          <Route path="pagamentos" element={<PaymentsPage />} />
          <Route path="notificacoes" element={<NotificationsPage />} />
          <Route path="historico" element={<HistoryPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
