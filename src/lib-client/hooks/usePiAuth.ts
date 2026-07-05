'use client';

import { useState, useEffect, useCallback } from 'react';
import { loginWithPi, getStoredUser, logout as piLogout } from '@/lib-client/pi/pi-auth';
import { TecUser } from '@/types/pi.types';

interface AuthState {
  user:            TecUser | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  isNewUser:       boolean;
  error:           string | null;
  errorType:       'not_pi_browser' | 'auth_failed' | 'timeout' | 'storage' | null;
}

export const usePiAuth = () => {
  const [state, setState] = useState<AuthState>({
    user:            null,
    isLoading:       true,
    isAuthenticated: false,
    isNewUser:       false,
    error:           null,
    errorType:       null,
  });

  useEffect(() => {
    const stored = getStoredUser();
    setState(prev => ({
      ...prev,
      user:            stored,
      isAuthenticated: !!stored,
      isLoading:       false,
    }));
  }, []);

  const login = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null, errorType: null }));
    try {
      const result = await loginWithPi();

      // ✅ بعد الـ cookie migration — الـ user بييجي من response مش من cookie
      const user = result.user ?? getStoredUser();

      setState(prev => ({
        ...prev,
        user,
        isAuthenticated: !!user,
        isNewUser:       result.isNewUser,
        isLoading:       false,
        error:           null,
        errorType:       null,
      }));
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل تسجيل الدخول';
      let errorType: AuthState['errorType'] = 'auth_failed';
      if (message.includes('Pi Browser') || message.includes('متصفح Pi')) {
        errorType = 'not_pi_browser';
      } else if (message.includes('timed out') || message.includes('انتهت مهلة')) {
        errorType = 'timeout';
      } else if (message.includes('localStorage') || message.includes('بيانات المصادقة')) {
        errorType = 'storage';
      }
      setState(prev => ({
        ...prev,
        isLoading: false,
        error:     message,
        errorType,
      }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await piLogout();
    setState(prev => ({
      ...prev,
      user:            null,
      isAuthenticated: false,
      isNewUser:       false,
      error:           null,
      errorType:       null,
    }));
  }, []);

  return { ...state, login, logout };
};
