import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabaseClient } from '@/lib/supabaseClient';

interface SupabaseContextValue {
  isReady: boolean;
  session: Session | null;
  user: User | null;
  supabaseAvailable: boolean;
  client: typeof supabaseClient;
  signInWithProvider: (provider: 'github' | 'google' | 'azure' | 'bitbucket') => Promise<void>;
  signOut: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextValue | undefined>(undefined);

interface SupabaseProviderProps {
  children: ReactNode;
}

export const SupabaseProvider = ({ children }: SupabaseProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!supabaseClient) {
      setIsReady(true);
      return;
    }

    let isMounted = true;

    supabaseClient.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }
      setSession(data.session ?? null);
      setIsReady(true);
    });

    const {
      data: authListener,
    } = supabaseClient.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) {
        return;
      }
      setSession(newSession ?? null);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SupabaseContextValue>(() => {
    const supabaseAvailable = Boolean(supabaseClient);

    const signInWithProvider = async (provider: 'github' | 'google' | 'azure' | 'bitbucket') => {
      if (!supabaseClient || !supabaseAvailable) {
        throw new Error('Supabase is not configured.');
      }
      await supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
    };

    const signOut = async () => {
      if (!supabaseClient || !supabaseAvailable) {
        return;
      }
      await supabaseClient.auth.signOut();
    };

    return {
      isReady,
      session,
      user: session?.user ?? null,
      supabaseAvailable,
      client: supabaseClient,
      signInWithProvider,
      signOut,
    };
  }, [isReady, session]);

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSupabase = () => {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return ctx;
};
