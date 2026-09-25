import { PortfolioShell } from '@/components/portfolio/portfolio-shell';
import { getPortfolioData } from '@/lib/portfolio-data';

export const revalidate = 60;

export default async function Home() {
  const data = await getPortfolioData();
  return <PortfolioShell data={data} />;
}
