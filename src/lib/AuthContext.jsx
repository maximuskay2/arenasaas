import React, { createContext, useState, useContext, useEffect } from 'react';
import { maxikay } from '@/api/maxikayClient';
import { clearOrganizerPortalSession } from '@/lib/routingLogic';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState({ id: 'local', public_settings: {} });

  useEffect(() => {
    void initAuth();
  }, []);

  const initAuth = async () => {
    setIsLoadingPublicSettings(false);
    setAuthError(null);
    const token =
      typeof localStorage !== 'undefined' &&
      (localStorage.getItem('arena_access_token') ||
        localStorage.getItem('maxikay_access_token') ||
        localStorage.getItem('base44_access_token'));
    if (!token) {
      clearOrganizerPortalSession();
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      return;
    }
    try {
      setIsLoadingAuth(true);
      const currentUser = await maxikay.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
      if (error.status === 401 || error.status === 403) {
        clearOrganizerPortalSession();
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required',
        });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    await maxikay.auth.logout(shouldRedirect ? '/' : undefined);
  };

  const navigateToLogin = () => {
    maxikay.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState: initAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
