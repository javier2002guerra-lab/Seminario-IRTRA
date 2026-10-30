export async function readApiJson(response) {
  const text = await response.text();
  if (!text.trim())
    return {
      error: `El servidor no devolvió una respuesta válida (HTTP ${response.status}).`,
    };
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? parsed
      : { error: "El servidor devolvió una respuesta inválida." };
  } catch {
    return {
      error: `El servidor devolvió una respuesta inválida (HTTP ${response.status}).`,
    };
  }
}
