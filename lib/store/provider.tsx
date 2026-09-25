'use client';

import { useEffect, useState } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider, useDispatch, useSelector } from 'react-redux';
import themeReducer, { hydrateTheme } from './theme-slice';
import authReducer, { setSessionUser } from './auth-slice';
import assistantReducer, { hydrateAssistant } from './assistant-slice';
import type { ThemeState } from './theme-slice';
import type { AssistantState } from './assistant-slice';
import { createClient } from '@/lib/supabase/client';

const store = configureStore({ reducer: { theme: themeReducer, auth: authReducer, assistant: assistantReducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

const STORAGE_KEY = 'nishad-portfolio-theme';

function ThemeHydrator() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector(state => state.theme);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) dispatch(hydrateTheme(JSON.parse(saved) as ThemeState));
    } catch {}
    setHydrated(true);
  }, [dispatch]);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  }, [theme, hydrated]);

  return null;
}

const ASSISTANT_STORAGE_KEY = 'nishad-portfolio-assistant-session';

function AssistantHydrator() {
  const dispatch = useAppDispatch();
  const assistant = useAppSelector(state => state.assistant);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(ASSISTANT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AssistantState;
        if (Array.isArray(parsed.messages)) dispatch(hydrateAssistant({ messages: parsed.messages.slice(-40), pending: parsed.pending ?? null }));
      }
    } catch {}
    setHydrated(true);
  }, [dispatch]);

  useEffect(() => {
    if (hydrated) window.sessionStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(assistant));
  }, [assistant, hydrated]);

  return null;
}

function AuthHydrator() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => dispatch(setSessionUser(data.user ?? null)));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      dispatch(setSessionUser(session?.user ?? null));
    });
    return () => subscription.unsubscribe();
  }, [dispatch]);

  return null;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}><ThemeHydrator /><AssistantHydrator /><AuthHydrator />{children}</Provider>;
}
