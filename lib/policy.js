export function requiresReview(result, threshold = 0.85) {
  return (
    result.priority === "Crítico" ||
    Number(result.confidence) < threshold ||
    (result.areas || []).includes("Sin especificar")
  );
}
export function canClose(record) {
  return record.priority !== "Crítico" && !record.needs_review;
}
export function priorityRank(value) {
  return (
    { Crítico: 1, Alto: 2, Medio: 3, Bajo: 4, Informativo: 5 }[value] || 99
  );
}
