// 1 -> 1st, 2 -> 2nd, 11 -> 11th, 23 -> 23rd
export function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

export const formatScore = (n) => Number(n ?? 0).toLocaleString();
