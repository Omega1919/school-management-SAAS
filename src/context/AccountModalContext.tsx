import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';
import { LogoutConfirmModal } from '../components/LogoutConfirmModal.tsx';

interface AccountModalContextType {
  openAccountModal: () => void;
  closeAccountModal: () => void;
  openLogoutConfirm: () => void;
  closeLogoutConfirm: () => void;
}

const AccountModalContext = createContext<AccountModalContextType | undefined>(undefined);

export const AccountModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const [isLogoutOpen, setIsLogoutOpen] = useState<boolean>(false);

  // Navigate to settings page instead of opening a modal dialog
  const openAccountModal = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'settings' }));
    }
  }, []);

  const closeAccountModal = useCallback(() => {
    // No-op since account management is inside settings view
  }, []);

  const openLogoutConfirm = useCallback(() => {
    setIsLogoutOpen(true);
  }, []);

  const closeLogoutConfirm = useCallback(() => {
    setIsLogoutOpen(false);
  }, []);

  const handleConfirmLogout = useCallback(() => {
    closeLogoutConfirm();
    logout();
  }, [logout, closeLogoutConfirm]);

  return (
    <AccountModalContext.Provider
      value={{
        openAccountModal,
        closeAccountModal,
        openLogoutConfirm,
        closeLogoutConfirm,
      }}
    >
      {children}

      {/* Global Logout Confirmation Dialog (Small popup with short text) */}
      <LogoutConfirmModal
        isOpen={isLogoutOpen}
        onClose={closeLogoutConfirm}
        onConfirm={handleConfirmLogout}
      />
    </AccountModalContext.Provider>
  );
};

export const useAccountModal = () => {
  const context = useContext(AccountModalContext);
  if (!context) {
    throw new Error('useAccountModal must be used within an AccountModalProvider');
  }
  return context;
};
