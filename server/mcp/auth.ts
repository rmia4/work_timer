import type { AuthInfo } from "@modelcontextprotocol/server";
import { resourceUrl } from "@/server/oauth/common";
import { verifyAccessToken } from "@/server/oauth/tokens";
import type { Db } from "./views";
// Bearer 토큰을 확인하고 연결의 마지막 사용 시각을 분 단위로만 갱신한다. 유효하지 않으면 null.
// 갱신할 때가 아니면 UPDATE를 보내지 않아 요청마다 DB 왕복을 1번으로 줄인다.
export async function authenticate(
  db: Db,
  header: string | null,
  now: number,
): Promise<AuthInfo | null> {
  const match = /^Bearer ([A-Za-z0-9]+)$/i.exec(header || "");
  if (!match) return null;
  const grant = await verifyAccessToken(db, match[1], now);
  if (!grant) return null;
  if (grant.lastUsed === null || grant.lastUsed <= now - 60000)
    await db
      .prepare(
        "UPDATE oauth_grants SET last_used=? WHERE id=? AND (last_used IS NULL OR last_used<=?)",
      )
      .bind(now, grant.grantId, now - 60000)
      .run();
  return {
    token: match[1],
    clientId: grant.clientId,
    scopes: grant.scopes,
    resource: new URL(resourceUrl()),
    extra: { owner: grant.owner },
  };
}
