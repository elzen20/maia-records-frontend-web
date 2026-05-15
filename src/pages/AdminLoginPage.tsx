import React, { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { getAdminEmails, isAdminEmail } from '../services/adminAccess';
import './AdminLoginPage.css';

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        return;
      }

      if (isAdminEmail(user.email)) {
        navigate('/admin/quantize', { replace: true });
        return;
      }

      await signOut(auth);
      setError('Esta cuenta no tiene permisos admin para esta zona.');
    });

    return unsubscribe;
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);

      if (!isAdminEmail(credential.user.email)) {
        await signOut(auth);
        setError('Esta cuenta no esta autorizada para el dashboard de cuantizacion.');
        return;
      }

      navigate('/admin/quantize', { replace: true });
    } catch (requestError) {
      setError('No se pudo iniciar sesion. Verifica correo, password y que el usuario exista en Firebase Auth.');
    } finally {
      setLoading(false);
    }
  };

  const configuredAdmins = getAdminEmails();

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        <h1>Admin Login</h1>
        <p>Acceso restringido al dashboard de cuantizacion.</p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <label htmlFor="admin-email">Correo</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar al dashboard'}
          </button>
        </form>

        {error && <p className="admin-login-error">{error}</p>}

        {configuredAdmins.length > 0 && (
          <p className="admin-login-hint">
            Admins configurados: {configuredAdmins.join(', ')}
          </p>
        )}

        <Link to="/" className="admin-login-back">
          Volver al sitio publico
        </Link>
      </div>
    </main>
  );
}

export default AdminLoginPage;
