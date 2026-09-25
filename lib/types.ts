export type Profile = {
  id?: string;
  full_name: string;
  role: string;
  headline: string;
  bio: string;
  location: string;
  email: string;
  phone: string;
  resume_url: string | null;
  github_url: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  available_for_work: boolean;
};

export type Skill = { id?: string; name: string; group_name: string; sort_order: number };
export type Experience = { id?: string; company: string; title: string; location: string; start_date: string; end_date: string | null; summary: string; bullets: string[]; sort_order: number };
export type Project = { id?: string; name: string; client: string | null; role: string; description: string; responsibilities: string[]; technologies: string[]; url: string | null; featured: boolean; sort_order: number };
export type ProjectVideo = { id?: string; project_id: string; title: string; description: string | null; storage_path: string; public_url: string; sort_order: number; created_at?: string };
export type Tool = { id?: string; name: string; slug: string; description: string; icon: string; website_url: string | null; active: boolean; sort_order: number; created_at?: string };
export type ToolFeature = { id?: string; tool_id: string; title: string; summary: string; details: string | null; version: string | null; release_date: string | null; source_url: string | null; sort_order: number; created_at?: string };
export type Wallpaper = { id?: string; name: string; storage_path: string; public_url: string; active: boolean; sort_order: number; created_at?: string };
export type Education = { id?: string; degree: string; institution: string; year: string; sort_order: number };
export type ContactMessage = { id: string; name: string; email: string; message: string; is_read: boolean; created_at: string };
export type PortfolioData = { profile: Profile; skills: Skill[]; experiences: Experience[]; projects: Project[]; education: Education[]; projectVideos: ProjectVideo[]; tools: Tool[]; toolFeatures: ToolFeature[]; wallpapers: Wallpaper[] };
