import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '@/lib/store/provider';
import { ThemeSystem } from '@/components/theme/theme-system';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' });

export const metadata: Metadata = {
  title: 'Nishad K S — Senior Full-stack Engineer',
  description: 'Portfolio of Nishad K S, a senior full-stack engineer focused on React, Next.js, and Node.js.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${inter.variable} ${space.variable}`}><StoreProvider><ThemeSystem />{children}</StoreProvider></body></html>;
}
