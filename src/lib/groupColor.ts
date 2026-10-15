/** Tailwind classes for each group colour; literal strings so the compiler keeps them. */
export const GROUP_COLOR_BAR: Record<string, string> = {
  zinc: 'bg-zinc-400',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  teal: 'bg-teal-500',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
}
export function groupBar(color: string | undefined): string {
  return GROUP_COLOR_BAR[color ?? ''] ?? GROUP_COLOR_BAR.zinc!
}
