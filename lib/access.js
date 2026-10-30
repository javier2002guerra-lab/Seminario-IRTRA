export function can(user, ...roles) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "verificador") return roles.includes(user.role);
  return roles.some((role) =>
    [
      "verificador",
      "calidad",
      "responsable_area",
      "auditor",
      "administrador_tecnologias",
    ].includes(role),
  );
}
