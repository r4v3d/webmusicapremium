export function parseDateInput(str) {
  if (!str) return null;
  const value = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  let match = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    if (year < 100) year = 2000 + year;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  match = value.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    let year = currentYear;
    if (month < currentMonth && currentMonth - month >= 9) year = currentYear + 1;
    else if (month > currentMonth && month - currentMonth >= 9) year = currentYear - 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  if (/^\d{1,2}$/.test(value)) {
    const day = parseInt(value, 10);
    if (day >= 1 && day <= 31) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function splitLine(line) {
  return line.split(/\t|,|;|\|/).map((p) => p.trim());
}

export function previewImport(mode, rawInput) {
  const lines = String(rawInput || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const lineNumber = index + 1;
    const parts = splitLine(line);
    if (mode === "master_accounts") {
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        return { line: lineNumber, ok: false, error: "Se necesitan correo y contraseña", summary: line };
      }
      return {
        line: lineNumber,
        ok: true,
        summary: parts[0],
        fields: { email: parts[0], password: "••••", renewal: parseDateInput(parts[2]) || parseDateInput(parts[3]) || "+30 días" },
      };
    }
    if (mode === "active_members") {
      if (parts.length < 4 || !parts[0] || !parts[1] || !parts[2]) {
        return { line: lineNumber, ok: false, error: "Se necesitan titular, cliente, correo y clave", summary: line };
      }
      return {
        line: lineNumber,
        ok: true,
        summary: `${parts[2]} → ${parts[0]}`,
        fields: { master: parts[0], client: parts[1], member: parts[2], price: parts[4] || "0" },
      };
    }
    if (mode === "stock_members") {
      if (parts.length < 3 || !parts[0] || !parts[2]) {
        return { line: lineNumber, ok: false, error: "Se necesitan correo miembro, clave y titular", summary: line };
      }
      return {
        line: lineNumber,
        ok: true,
        summary: `${parts[0]} → ${parts[2]}`,
        fields: { member: parts[0], master: parts[2] },
      };
    }
    return { line: lineNumber, ok: false, error: "Modo de importación no soportado", summary: line };
  });
}
