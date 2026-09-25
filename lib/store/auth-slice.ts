import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type AuthState = {
  user: User | null;
  initialized: boolean;
  loading: boolean;
  error: string;
};

const initialState: AuthState = { user: null, initialized: false, loading: false, error: '' };

export const loginWithUsername = createAsyncThunk<User, { username: string; password: string }, { rejectValue: string }>(
  'auth/loginWithUsername',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const result = await response.json();
      if (!response.ok) return rejectWithValue(result.error ?? 'Unable to sign in.');
      const { data, error } = await createClient().auth.getUser();
      if (error || !data.user) return rejectWithValue(error?.message ?? 'Login succeeded, but the session could not be loaded.');
      return data.user;
    } catch {
      return rejectWithValue('Unable to connect to the login server.');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSessionUser: (state, action: PayloadAction<User | null>) => { state.user = action.payload; state.initialized = true; },
    clearAuthError: state => { state.error = ''; }
  },
  extraReducers: builder => {
    builder
      .addCase(loginWithUsername.pending, state => { state.loading = true; state.error = ''; })
      .addCase(loginWithUsername.fulfilled, (state, action) => { state.loading = false; state.user = action.payload; state.initialized = true; })
      .addCase(loginWithUsername.rejected, (state, action) => { state.loading = false; state.error = action.payload ?? 'Unable to sign in.'; });
  }
});

export const { setSessionUser, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
