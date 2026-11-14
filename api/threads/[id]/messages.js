import { handleThreadReply } from '../../../server/handlers.mjs'

export async function POST(request) {
  return handleThreadReply(request)
}
