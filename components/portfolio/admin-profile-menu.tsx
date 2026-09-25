'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useAppSelector } from '@/lib/store/provider';
import type { User } from '@supabase/supabase-js';

type AdminProfileMenuProps = {
  onSignOut: () => void | Promise<void>;
  avatarUrl?: string | null;
};

function getInitials(user: User) {
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'Admin';
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || 'A';
}

export function AdminProfileMenu({ onSignOut, avatarUrl: savedAvatarUrl }: AdminProfileMenuProps) {
  const user = useAppSelector(state => state.auth.user);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarUrl = savedAvatarUrl || (typeof user?.user_metadata?.avatar_url === 'string'
    ? user.user_metadata.avatar_url
    : typeof user?.user_metadata?.picture === 'string'
      ? user.user_metadata.picture
      : '');

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  if (!user) return null;

  return <div className="profile-menu-wrap" ref={menuRef}>
    <button
      className="profile-avatar-button"
      type="button"
      onClick={() => setOpen(value => !value)}
      aria-label="Open account menu"
      aria-expanded={open}
      title={user.email ?? 'Admin account'}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="profile-avatar" /> : <span className="profile-avatar profile-avatar-fallback">{getInitials(user)}</span>}
    </button>
    {open && <div className="profile-menu" role="menu">
      <button className="profile-menu-item" type="button" role="menuitem" onClick={() => { setOpen(false); void onSignOut(); }}>
        <LogOut size={16} />
        <span>Sign out</span>
      </button>
    </div>}
  </div>;
}

export function AdminProfileIcon() {
  const user = useAppSelector(state => state.auth.user);
  if (!user) return <UserRound size={18} />;
  return typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url
    ? <img src={user.user_metadata.avatar_url} alt="" className="profile-avatar" />
    : <span className="profile-avatar profile-avatar-fallback">{getInitials(user)}</span>;
}
