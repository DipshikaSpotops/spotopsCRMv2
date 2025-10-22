export const extractOwn = (s) => {
  if (!s) return undefined;
  const m = String(s).match(/own shipping:\s*([^\|]+)/i);
  return m ? m[1].trim() : undefined;
};
export const extractYard = (s) => {
  if (!s) return undefined;
  const m = String(s).match(/yard shipping:\s*([^\|]+)/i);
  return m ? m[1].trim() : undefined;
};

export const isInactiveYard = (y) => {
  const t = String(y?.status || "").trim().toLowerCase();
  return (
    t === "po cancelled" ||
    t === "po canceled" ||
    t === "po cancel" ||
    t === "escalation" ||
    t === "cancelled" ||
    t === "canceled"
  );
};