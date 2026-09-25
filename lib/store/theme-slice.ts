import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'aurora' | 'midnight' | 'ocean' | 'sunset' | 'mint' | 'custom';
export type ThemeState = { mode: ThemeMode; wallpaperUrl: string | null; overlay: number };

const initialState: ThemeState = { mode: 'aurora', wallpaperUrl: null, overlay: 0.48 };

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.mode = action.payload;
      if (action.payload !== 'custom') state.wallpaperUrl = null;
    },
    setWallpaper: (state, action: PayloadAction<string | null>) => {
      state.wallpaperUrl = action.payload;
      state.mode = action.payload ? 'custom' : 'aurora';
    },
    setOverlay: (state, action: PayloadAction<number>) => {
      state.overlay = Math.min(0.9, Math.max(0.15, action.payload));
    },
    hydrateTheme: (_state, action: PayloadAction<ThemeState>) => action.payload
  }
});

export const { setThemeMode, setWallpaper, setOverlay, hydrateTheme } = themeSlice.actions;
export default themeSlice.reducer;
