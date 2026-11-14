import { handleApi } from '../../../lib/api.js';
import { getDatabase } from '../../../lib/database.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handle(request) {
  try {
    return handleApi(request, getDatabase());
  } catch (error) {
    console.error('Crucible database unavailable', error.message);
    return Response.json(
      { error: 'The Seed workspace is temporarily unavailable. Try again shortly.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export { handle as GET, handle as POST };
