export const BOT_TAG = '@gamecreator';
export const mentionCommand = text => `${BOT_TAG} ${text}`;

// Native LINE mentions use isSelf, independent of the account's display name.
// A typed @gamecreator token also works in direct chats and Card message actions.
export function addressedText(message) {
  if (message?.type !== 'text' || typeof message.text !== 'string') return null;
  const text = message.text;
  const mentions = (message.mention?.mentionees || []).filter(m => Number.isInteger(m.index) && Number.isInteger(m.length) && m.index >= 0 && m.length > 0 && m.index + m.length <= text.length);
  const ranges = mentions.filter(m => m.type === 'user' && m.isSelf === true).map(m => [m.index, m.index + m.length]);
  for (const match of text.matchAll(/(^|\s)@gamecreator(?=$|\s|[:,：，])/gi)) {
    const start = match.index + match[1].length, end = start + BOT_TAG.length;
    // Mentioning another account named gamecreator must not wake this bot.
    if (!mentions.some(m => start < m.index + m.length && end > m.index)) ranges.push([start, end]);
  }
  if (!ranges.length) return null;
  let command = text;
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) command = command.slice(0, start) + command.slice(end);
  return command.trim().replace(/^[:,：，]\s*/, '').trim() || 'help';
}
