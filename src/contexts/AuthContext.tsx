import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  deleteUser,
  getAdditionalUserInfo,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getFriendlyErrorMessage } from '@/lib/auth-errors';



interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  signInWithGoogle: () => Promise<any>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signUp = async (email: string, password: string) => {
    // Check if account exists with different provider
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length > 0) {
      if (methods.includes('google.com')) {
        throw new Error('This email is already linked to a Google account. Please use Google Sign In.');
      }
      if (methods.includes('password')) {
        throw new Error('An account with this email already exists. Please sign in.');
      }
    }

    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const res = await fetch(`${base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Signup failed');
    }

    const data = await res.json();
    return data;
  };

  const signIn = async (email: string, password: string) => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.includes('google.com') && !methods.includes('password')) {
        throw new Error('Please sign in with Google.');
      }
    } catch (e: any) {
      if (e.message === 'Please sign in with Google.') throw e;
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        await signOut(auth);
        throw new Error('Email not verified. Please check your inbox.');
      }
    } catch (err: any) {
      throw new Error(getFriendlyErrorMessage(err));
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('user-profile-picture');
    } catch (e) {
      // noop
    }
    await signOut(auth);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const cred = await signInWithPopup(auth, provider);
      const email = cred.user.email;

      if (!email) {
        await signOut(auth);
        throw new Error('We could not retrieve an email address from your Google account.');
      }

      // Check for existing sign-in methods for this email
      const methods = await fetchSignInMethodsForEmail(auth, email);
      const hasPasswordMethod = methods.includes('password');

      if (hasPasswordMethod) {
        // If they have a password account, we don't want them using Google 
        // unless they are already linked (which they won't be if methods.length > 1 and it's a conflict case)
        // Actually, if they have a password account and just signed in with Google, 
        // Firebase might have linked them if "Link accounts" is on.
        // We want to force them to use password if they started with it.

        const additionalInfo = getAdditionalUserInfo(cred);
        const isNewUser = additionalInfo?.isNewUser;

        console.log('Auth Conflict Detected:', { email, methods, isNewUser });

        // If it's a new Google "user" (new link/account) but email already has password
        // we block it and sign out.
        await signOut(auth);

        if (isNewUser) {
          try {
            await deleteUser(cred.user);
          } catch (e) {
            console.error('Failed to cleanup duplicate user:', e);
          }
        }

        throw new Error('CONFLICT_PASSWORD_EXISTS');
      }

      // If no password conflict, proceed
      const additionalInfo = getAdditionalUserInfo(cred);
      if (additionalInfo?.isNewUser) {
        try {
          localStorage.removeItem('music-analyzer-library');
        } catch (e) { }
      }

      return cred;
    } catch (err: any) {
      if (err.message === 'CONFLICT_PASSWORD_EXISTS') {
        throw new Error('This email is already linked to a password account. Please sign in with your email and password.');
      }

      if (err.code === 'auth/account-exists-with-different-credential') {
        throw new Error('This email is already linked to a different sign-in method. Please use your existing account.');
      }

      throw new Error(getFriendlyErrorMessage(err));
    }
  };

  const refreshUser = async () => {
    if (currentUser) {
      await currentUser.reload();
      setCurrentUser({ ...currentUser });
    }
  };

  useEffect(() => {
    let unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    (async () => {
      try {
        const result = await getRedirectResult(auth as any);
        if (result && getAdditionalUserInfo(result)?.isNewUser) {
          localStorage.removeItem('music-analyzer-library');
        }
      } catch (e) { }
    })();

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    signIn,
    signUp,
    logout,
    signInWithGoogle,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
