// 여러 파일로 나뉜 서버 모듈을 의존 순서대로 불러온다.
// 테스트의 load는 소스의 import 줄을 지우므로, injected 이름과 앞 파일의 export를 뒤 파일에 주입한다.
export const OAUTH_FILES = [
  "common",
  "metadata",
  "clients",
  "authorize",
  "tokens",
  "connections",
].map((name) => `server/oauth/${name}.ts`);
export const OAUTH_INJECTED = ["hashToken", "fetchClientDocument", "validClientIdUrl"];
export const MCP_FILES = ["views", "auth", "tools/read", "tools/write", "server"].map(
  (name) => `server/mcp/${name}.ts`,
);

export async function loadChain(load, fixtureName, files, injected) {
  const names = new Set(injected);
  for (const file of files) {
    const loaded = await load(file, `const {${[...names].join(",")}}=globalThis.${fixtureName};`);
    Object.keys(loaded).forEach((name) => names.add(name));
    Object.assign(globalThis[fixtureName], loaded);
  }
}
