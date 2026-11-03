import { handleRequest } from '../lib/bot.js';

export default {
  fetch(request) {
    // Vercel supplies a context argument; the bot's optional second argument is env.
    return handleRequest(request);
  },
};
