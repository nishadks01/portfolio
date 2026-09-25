import { ToolsShowcase } from '@/components/portfolio/tools-showcase';
import { getPortfolioData } from '@/lib/portfolio-data';

export const revalidate = 60;

export default async function ToolsPage() {
  const data = await getPortfolioData();
  return <ToolsShowcase tools={data.tools.filter(tool => tool.active)} features={data.toolFeatures} />;
}
