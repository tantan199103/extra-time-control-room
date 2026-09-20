const terminalPunctuation = /[.!?](?:["')\]]*)$/
const suspiciousEnding = /\b(?:a|an|and|as|at|by|for|from|in|into|of|on|or|the|to|with|your)$/i

export function cleanSeoText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function looksTruncatedSeoText(value) {
  const text = cleanSeoText(value)
  return Boolean(text && !terminalPunctuation.test(text) && (text.length >= 155 || suspiciousEnding.test(text)))
}

export function truncateSeoText(value, maxLength = 160, minSentenceLength = 90) {
  const text = cleanSeoText(value)
  if (text.length <= maxLength) return text
  const window = text.slice(0, maxLength + 1)
  let sentenceEnd = -1
  for (const match of window.matchAll(/[.!?](?=\s|$)/g)) {
    if (match.index + 1 >= minSentenceLength && match.index + 1 <= maxLength) sentenceEnd = match.index + 1
  }
  if (sentenceEnd > 0) return window.slice(0, sentenceEnd).trim()
  const wordEnd = window.slice(0, maxLength - 1).lastIndexOf(' ')
  const clipped = window.slice(0, wordEnd >= 60 ? wordEnd : maxLength - 1).replace(/[,:;\-\s]+$/g, '')
  return `${clipped}…`
}

export function seoDescription(primary, fallback = '', maxLength = 160) {
  const preferred = cleanSeoText(primary)
  const backup = cleanSeoText(fallback)
  const source = looksTruncatedSeoText(preferred) && backup.length > preferred.length ? backup : (preferred || backup)
  return truncateSeoText(source, maxLength)
}
