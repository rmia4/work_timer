import { SCOPE_LABELS, type Db } from "./common";
import { revokeGrant } from "./tokens";
// 설정 화면의 "연결된 앱" 목록. CIMD 클라이언트는 문서 도메인을 함께 보여 준다(앱 이름은 사칭 가능).
export async function listConnections(db: Db, owner: string) {
  const { results } = await db
    .prepare(
      "SELECT g.id,g.client_id,c.name,g.scope,g.created,g.last_used FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.owner=? AND g.revoked IS NULL ORDER BY g.created DESC",
    )
    .bind(owner)
    .all<{
      id: string;
      client_id: string;
      name: string;
      scope: string;
      created: number;
      last_used: number | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    host: r.client_id.startsWith("https://") ? new URL(r.client_id).host : null,
    scopes: r.scope.split(" ").map((s) => SCOPE_LABELS[s] || s),
    created: r.created,
    lastUsed: r.last_used,
  }));
}
// 연결 해제. 남의 연결이거나 이미 폐기된 연결이면 false.
export async function disconnect(db: Db, owner: string, grantId: string, now: number) {
  const row = await db
    .prepare("SELECT id FROM oauth_grants WHERE id=? AND owner=? AND revoked IS NULL")
    .bind(grantId, owner)
    .first<{ id: string }>();
  if (!row) return false;
  await revokeGrant(db, row.id, now);
  return true;
}
