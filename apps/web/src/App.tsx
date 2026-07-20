import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { TendersPage } from './pages/TendersPage';
import { TenderFormPage } from './pages/TenderFormPage';
import { TenderDetailsPage } from './pages/TenderDetailsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tenders" element={<TendersPage />} />
            <Route path="/tenders/:id" element={<TenderDetailsPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={['QA']} />}>
          <Route element={<Layout />}>
            <Route path="/tenders/new" element={<TenderFormPage mode="create" />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={['QA', 'MANAGER', 'ADMIN']} />}>
          <Route element={<Layout />}>
            <Route path="/tenders/:id/edit" element={<TenderFormPage mode="edit" />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route element={<Layout />}>
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
