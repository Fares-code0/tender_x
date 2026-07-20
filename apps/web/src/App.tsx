import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { AdminUsersPage } from './pages/AdminUsersPage';
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
