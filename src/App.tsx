import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage';
import AdminLoginPage from './pages/AdminLoginPage';
import QuantizeDashboardPage from './pages/QuantizeDashboardPage';
import ProtectedAdminRoute from './components/auth/ProtectedAdminRoute';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin/quantize"
        element={(
          <ProtectedAdminRoute>
            <QuantizeDashboardPage />
          </ProtectedAdminRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
