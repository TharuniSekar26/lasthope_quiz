import { createContext, useContext, useEffect, useState } from 'react';
import { loginRequest, meRequest, registerRequest } from '../api/auth.js';
import { tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

// Holds the logged-in host. Students are anonymous and never touch this.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  // Restore the session from a stored token on first load.
  useEffect(() => {
    if (!tokenStore.get()) return;
    meRequest()
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = ({ user, token }) => {
    tokenStore.set(token);
    setUser(user);
  };

  const value = {
    user,
    loading,
    login: async (body) => handleAuth(await loginRequest(body)),
    register: async (body) => handleAuth(await registerRequest(body)),
    logout: () => {
      tokenStore.clear();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
