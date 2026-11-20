import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const read = (name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
test("one running timer, many paused, stale writes, ownership and elapsed across pause/resume", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(read("0000_wide_starjammers.sql"));
  db.exec(read("0008_one_running.sql"));
  const insert = db.prepare(
    "INSERT INTO tasks (id,owner,day,title,elapsed,started,status,created) VALUES (?,?,?,?,?,?,?,?)",
  );
  insert.run("a", "owner", "2026-09-10", "업무", 0, 1000, "running", 1000);
  assert.throws(
    () => insert.run("b", "owner", "2026-09-10", "중복", 0, 1000, "running", 1000),
    /UNIQUE/,
  );
  insert.run("other", "another", "2026-09-10", "다른 사용자", 0, 1000, "running", 1000);
  const update = db.prepare(
    "UPDATE tasks SET elapsed=?,started=?,status=?,version=version+1 WHERE id=? AND owner=? AND version=?",
  );
  assert.equal(update.run(3000, null, "paused", "a", "owner", 0).changes, 1);
  assert.equal(update.run(9000, null, "done", "a", "owner", 0).changes, 0);
  assert.equal(update.run(0, null, "done", "a", "another", 1).changes, 0);
  // 일시정지 작업은 자리를 차지하지 않는다. 측정 중인 작업만 한 개다.
  insert.run("b", "owner", "2026-09-10", "다음 작업", 0, 5000, "running", 5000);
  assert.throws(() => update.run(3000, 10000, "running", "a", "owner", 1), /UNIQUE/);
  assert.equal(update.run(2000, null, "paused", "b", "owner", 0).changes, 1);
  insert.run("c", "owner", "2026-09-10", "세 번째", 0, 9000, "paused", 9000);
  assert.equal(update.run(3000, 10000, "running", "a", "owner", 1).changes, 1);
  const current = db.prepare("SELECT * FROM tasks WHERE id=?").get("a");
  const total = current.elapsed + Math.max(0, 14000 - current.started);
  update.run(total, null, "done", "a", "owner", 2);
  assert.equal(db.prepare("SELECT elapsed FROM tasks WHERE id=?").get("a").elapsed, 7000);
  insert.run("d", "owner", "2026-09-10", "다음 작업", 0, 15000, "running", 15000);
  db.close();
});
