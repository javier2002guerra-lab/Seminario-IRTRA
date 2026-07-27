const DAY_MS = 24 * 60 * 60 * 1000;

export function parseExportRange(searchParams, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  const from = parseDate(searchParams.get("from")) || defaultFrom;
  const to = parseDate(searchParams.get("to")) || today;
  const days = Math.round((to - from) / DAY_MS) + 1;
  if (to < from) throw new Error("La fecha final no puede ser anterior a la inicial.");
  if (days > 31) throw new Error("El rango de exportación debe ser de 1 día hasta 1 mes (31 días).");
  return { from: isoDate(from), to: isoDate(to), days };
}

export function parseMonth(value, fallback = new Date()) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ""));
  const year = match ? Number(match[1]) : fallback.getFullYear();
  const month = match ? Number(match[2]) : fallback.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const toExclusive = isoDate(next);
  return { value: from.slice(0, 7), from, toExclusive };
}

export function previousMonth(value) {
  const selected = parseMonth(value);
  const date = new Date(`${selected.from}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Las fechas deben usar el formato AAAA-MM-DD.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || isoDate(date) !== value) throw new Error("La fecha indicada no es válida.");
  return date;
}

function isoDate(date) { return date.toISOString().slice(0, 10); }
