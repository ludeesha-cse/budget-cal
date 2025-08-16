export function formatDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentDateString(): string {
  return formatDateString(new Date());
}

export function getCurrentMonthString(): string {
  return getCurrentDateString().slice(0, 7);
}

export function getCurrentYearString(): string {
  return getCurrentDateString().slice(0, 4);
}
