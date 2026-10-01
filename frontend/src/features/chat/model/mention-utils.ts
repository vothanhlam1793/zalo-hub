import type { MessageMention } from '../../../types';

export function sanitizeMentions(text: string, mentions?: MessageMention[]): MessageMention[] | undefined {
  if (!mentions || !Array.isArray(mentions) || mentions.length === 0 || !text) {
    return undefined;
  }

  const valid = mentions.filter((m) => {
    if (!m || typeof m.pos !== 'number' || typeof m.len !== 'number') return false;
    if (m.pos < 0 || m.len <= 0) return false;
    if (m.pos + m.len > text.length) return false;
    if (typeof m.uid !== 'string' || !m.uid) return false;
    return text.charAt(m.pos) === '@';
  });

  if (valid.length === 0) return undefined;

  // Deduplicate and ensure strict non-overlapping ranges
  valid.sort((a, b) => a.pos - b.pos);
  const result: MessageMention[] = [];
  let lastEnd = -1;

  for (const item of valid) {
    if (item.pos >= lastEnd) {
      result.push(item);
      lastEnd = item.pos + item.len;
    }
  }

  return result.length > 0 ? result : undefined;
}

export function reconcileMentions(
  previousText: string,
  nextText: string,
  currentMentions?: MessageMention[]
): MessageMention[] | undefined {
  if (!currentMentions || currentMentions.length === 0) return undefined;
  if (!nextText.trim()) return undefined;
  if (previousText === nextText) return sanitizeMentions(nextText, currentMentions);

  // Find common prefix length
  let prefix = 0;
  const minLen = Math.min(previousText.length, nextText.length);
  while (prefix < minLen && previousText.charAt(prefix) === nextText.charAt(prefix)) {
    prefix++;
  }

  // Find common suffix length
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    previousText.charAt(previousText.length - 1 - suffix) === nextText.charAt(nextText.length - 1 - suffix)
  ) {
    suffix++;
  }

  const prevEditStart = prefix;
  const prevEditEnd = previousText.length - suffix;
  const nextEditEnd = nextText.length - suffix;
  const delta = nextEditEnd - prevEditStart - (prevEditEnd - prevEditStart);

  const updated: MessageMention[] = [];

  for (const m of currentMentions) {
    const mentionEnd = m.pos + m.len;

    // Mention is strictly before the edited area -> keep position
    if (mentionEnd <= prevEditStart) {
      updated.push(m);
      continue;
    }

    // Mention is strictly after the edited area -> shift position by delta
    if (m.pos >= prevEditEnd) {
      updated.push({
        ...m,
        pos: m.pos + delta,
      });
      continue;
    }

    // Mention overlaps with the modified area -> discard it
  }

  return sanitizeMentions(nextText, updated);
}
