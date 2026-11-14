export const dynamic = 'force-dynamic';

export function GET() {
  const id = process.env.REOWN_PROJECT_ID?.trim();
  return Response.json(
    { projectId: /^[0-9a-f]{32}$/i.test(id ?? '') ? id : null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
