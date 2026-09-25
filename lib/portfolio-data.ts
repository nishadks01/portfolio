import { createClient } from '@/lib/supabase/server';
import type { PortfolioData } from '@/lib/types';

export async function getPortfolioData(): Promise<PortfolioData> {
  const supabase = await createClient();
  const [profile, skills, experiences, projects, education, projectVideos, tools, toolFeatures, wallpapers] = await Promise.all([
    supabase.from('profiles').select('*').limit(1).single(),
    supabase.from('skills').select('*').order('sort_order'),
    supabase.from('experiences').select('*').order('sort_order'),
    supabase.from('projects').select('*').order('sort_order'),
    supabase.from('education').select('*').order('sort_order'),
    supabase.from('project_videos').select('*').order('sort_order'),
    supabase.from('tools').select('*').order('sort_order'),
    supabase.from('tool_features').select('*').order('release_date', { ascending: false }).order('sort_order'),
    supabase.from('wallpapers').select('*').order('sort_order')
  ]);
  if (profile.error) throw new Error(profile.error.message);
  return {
    profile: profile.data,
    skills: skills.data ?? [],
    experiences: experiences.data ?? [],
    projects: projects.data ?? [],
    education: education.data ?? [],
    projectVideos: projectVideos.data ?? [],
    tools: tools.data ?? [],
    toolFeatures: toolFeatures.data ?? [],
    wallpapers: wallpapers.data ?? []
  };
}
