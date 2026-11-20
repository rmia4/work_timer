-- 측정 중(running)인 작업만 사용자당 한 개로 제한한다. 일시정지(paused) 작업은 여러 개 둘 수 있다.
DROP INDEX "tasks_one_active";
CREATE UNIQUE INDEX "tasks_one_running" ON "tasks" ("owner") WHERE "status" = 'running';
