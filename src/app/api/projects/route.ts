import { signInRequired, viewerOf } from '@/server/auth';
import { listCloudProjects } from '@/server/billing';
import { accountsOn } from '@/server/supabase';

export async function GET(request: Request) {
  const viewer = await viewerOf(request);
  if (!viewer) return signInRequired();
  if (!accountsOn()) return Response.json({ projects: [] });
  return Response.json({ projects: await listCloudProjects(viewer.id) });
}
