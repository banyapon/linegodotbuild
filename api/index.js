import { handleRequest } from '../lib/bot.js';
import { waitUntil } from '@vercel/functions';

export default {
  fetch(request) {
    // Vercel supplies a context argument; the bot's optional second argument is env.
    return handleRequest(request, process.env, fetch, waitUntil);
  },
};
