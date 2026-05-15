import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { isAdminEmail } from '../../services/adminAccess';

interface ProtectedAdminRouteProps {
  children: React.ReactElement;
}

function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      if (!isAdminEmail(currentUser.email)) {
        await signOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="auth-loading">Validando acceso admin...</div>;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}

export default ProtectedAdminRoute;
