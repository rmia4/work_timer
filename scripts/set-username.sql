-- 사용자의 로그인 아이디(users.username)를 설정하거나 바꾼다.
-- tasks·memos·daily_memos·code_sessions는 users.id(UUID)를 가리키므로 따로 바꿀 필요가 없다.
-- 기존 개인 코드 사용자는 아이디를 넣으면 기존 코드가 그대로 비밀번호가 된다.
-- 수동 실행용이다. Neon SQL Editor에서 target_id와 new_username만 바꿔 실행한다.
DO $$
DECLARE
  target_id text := '사용자-uuid';
  new_username text := lower(trim('myid'));
BEGIN
  IF new_username !~ '^[a-z0-9_]{4,20}$' THEN
    RAISE EXCEPTION '아이디는 영문 소문자, 숫자, 밑줄(_)로 4~20자여야 합니다: %', new_username;
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE username = new_username AND id <> target_id) THEN
    RAISE EXCEPTION '이미 사용 중인 아이디입니다: %', new_username;
  END IF;
  UPDATE users SET username = new_username, updated = (extract(epoch from now()) * 1000)::bigint WHERE id = target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '사용자 %이(가) 없습니다.', target_id;
  END IF;
END $$;
