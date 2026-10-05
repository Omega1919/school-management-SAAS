import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types.ts';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api.ts';
import { requestGoogleSignIn } from '../lib/google-auth.ts';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider, browserPopupRedirectResolver } from '../lib/firebase.ts';

interface LoginResult {
  requiresVerification?: boolean;
  verifyToken?: string;
  email?: string;
  message?: string;
  devCode?: string;
  user?: User;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  roleProfile: any;
  loading: boolean;
  login: (identifier: string, password: string, expectedRole?: string) => Promise<LoginResult>;
  verifyAdminCode: (verifyToken: string, code: string) => Promise<User>;
  resendAdminCode: (verifyToken: string) => Promise<{ success: boolean; message: string; devCode?: string }>;
  loginWithGoogle: () => Promise<User>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  setAuth: (token: string, user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [roleProfile, setRoleProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setRoleProfile(null);
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest('/auth/me');
      setUser(data.user);
      setRoleProfile(data);
    } catch (err) {
      console.warn('Session expired or invalid:', err);
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setRoleProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = async (identifier: string, password: string, expectedRole?: string): Promise<LoginResult> => {
    const res = await apiRequest<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, expectedRole }),
    });

    if (res.requiresVerification) {
      return res;
    }

    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    await refreshProfile();
    return { user: res.user };
  };

  const verifyAdminCode = async (verifyToken: string, code: string): Promise<User> => {
    const res = await apiRequest<{ token: string; user: User }>('/auth/verify-admin-code', {
      method: 'POST',
      body: JSON.stringify({ verifyToken, code }),
    });

    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    await refreshProfile();
    return res.user;
  };

  const resendAdminCode = async (verifyToken: string): Promise<{ success: boolean; message: string; devCode?: string }> => {
    return await apiRequest<{ success: boolean; message: string; devCode?: string }>('/auth/resend-admin-code', {
      method: 'POST',
      body: JSON.stringify({ verifyToken }),
    });
  };

  const loginWithGoogle = async (): Promise<User> => {
    let googleCredentials: { accessToken?: string; idToken?: string };
    try {
      // Primary direct connection to accounts.google.com (bypasses unhosted firebaseapp.com domains)
      googleCredentials = await requestGoogleSignIn();
    } catch (gisError: any) {
      console.warn('Direct Google Sign-In failed or fallback requested, trying Firebase popup:', gisError);
      try {
        const result = await signInWithPopup(auth, googleAuthProvider, browserPopupRedirectResolver);
        const idToken = await result.user.getIdToken();
        googleCredentials = { idToken };
      } catch (fbPopupError: any) {
        throw new Error(gisError?.message || fbPopupError?.message || 'Google Sign-In was cancelled or failed.');
      }
    }

    const res = await apiRequest<{ token: string; user: User }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(googleCredentials),
    });

    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    await refreshProfile();
    return res.user;
  };

  const logout = () => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setRoleProfile(null);
  };

  const setAuth = (newToken: string, newUser: User) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
    refreshProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        roleProfile,
        loading,
        login,
        verifyAdminCode,
        resendAdminCode,
        loginWithGoogle,
        logout,
        refreshProfile,
        setAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
