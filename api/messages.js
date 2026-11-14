import { handleMessage } from '../server/handlers.mjs'

export async function POST(request) {
  return handleMessage(request)
}
