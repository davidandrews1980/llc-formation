export type Member = {
  name: string;
  title: string;
  ownership: number;
  address: string;
};

export function parseMembers(raw: string): Member[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === "object")
      .map((m) => {
        const rec = m as Record<string, unknown>;
        return {
          name: String(rec.name ?? ""),
          title: String(rec.title ?? "Member"),
          ownership: Number(rec.ownership ?? 0),
          address: String(rec.address ?? ""),
        };
      });
  } catch {
    return [];
  }
}

export function emptyMember(): Member {
  return { name: "", title: "Member", ownership: 100, address: "" };
}
