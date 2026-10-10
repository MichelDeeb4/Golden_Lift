export function GET() {
  return Response.json({ service: 'platform-admin', status: 'alive' });
}
