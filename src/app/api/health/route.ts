export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
  });
}
