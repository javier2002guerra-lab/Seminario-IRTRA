export const HOTEL_OPTIONS = [
  { id: "SAN_MARTIN", name: "SAN MARTIN" },
  { id: "RANCHERIA", name: "RANCHERIA" },
  { id: "PALAJUNOJ", name: "PALAJUNOJ" },
  { id: "SANTA_CRUZ", name: "SANTA CRUZ" },
];

export const RESTAURANT_OPTIONS = [
  { id: "KAPAHAPA", name: "KAPAHAPA" },
  { id: "AREKAS", name: "AREKAS" },
  { id: "LA_HACIENDA", name: "LA HACIENDA" },
  { id: "COROZOS", name: "COROZOS" },
];

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

export function optionId(options, storedValue) {
  const value = normalized(storedValue);
  return options.find((option) =>
    option.id === value || normalized(option.name) === value
  )?.id || "";
}

export function optionName(options, id) {
  return options.find((option) => option.id === id)?.name || null;
}
