'use client';

import { useEffect, useState } from 'react';
import { Image, Palette, X } from 'lucide-react';
import type { Wallpaper } from '@/lib/types';
import { setOverlay, setThemeMode, setWallpaper } from '@/lib/store/theme-slice';
import type { ThemeMode } from '@/lib/store/theme-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/provider';

const themes: Array<{ mode: Exclude<ThemeMode, 'custom'>; label: string; className: string }> = [
  { mode: 'aurora', label: 'Aurora glass', className: 'theme-swatch-aurora' },
  { mode: 'midnight', label: 'Obsidian', className: 'theme-swatch-midnight' },
  { mode: 'ocean', label: 'Deep ocean', className: 'theme-swatch-ocean' },
  { mode: 'sunset', label: 'Solar dusk', className: 'theme-swatch-sunset' },
  { mode: 'mint', label: 'Neo mint', className: 'theme-swatch-mint' }
];

export function ThemeSystem() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector(state => state.theme);
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/portfolio', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => setWallpapers((data?.wallpapers ?? []).filter((wallpaper: Wallpaper) => wallpaper.active))).catch(() => { });
  }, []);

  const backgroundImage = theme.mode === 'custom' && theme.wallpaperUrl ? `linear-gradient(rgba(7,9,15,${theme.overlay}), rgba(7,9,15,${theme.overlay})), url(${theme.wallpaperUrl})` : undefined;
  return <>
    <div className={`site-background site-background-${theme.mode}`} style={backgroundImage ? { backgroundImage } : undefined} aria-hidden="true" />
    <div className="theme-control">
      <button className="theme-trigger" type="button" onClick={() => setOpen(value => !value)} aria-label="Change background theme"><Palette size={17} /></button>
      {open && <div className="theme-menu">
        <div className="theme-menu-header"><strong>Choose a mood</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close theme menu"><X size={15} /></button></div>
        {themes.map(item => <button className={`theme-option ${theme.mode === item.mode ? 'selected' : ''}`} type="button" key={item.mode} onClick={() => dispatch(setThemeMode(item.mode))}><span className={`theme-swatch ${item.className}`} /> <span>{item.label}</span></button>)}
        {wallpapers.map(wallpaper => <button className={`theme-option ${theme.wallpaperUrl === wallpaper.public_url ? 'selected' : ''}`} type="button" key={wallpaper.id ?? wallpaper.public_url} onClick={() => dispatch(setWallpaper(wallpaper.public_url))}><span className="theme-swatch" style={{ backgroundImage: `url(${wallpaper.public_url})` }} /><span>{wallpaper.name}</span></button>)}
        {theme.mode === 'custom' && <label className="overlay-control">Readability overlay <input type="range" min="15" max="90" value={Math.round(theme.overlay * 100)} onChange={event => dispatch(setOverlay(Number(event.target.value) / 100))} /></label>}
        <a className="theme-admin-link" href="/admin">Manage wallpapers in Admin <Image size={14} /></a>
      </div>}
    </div>
  </>;
}
