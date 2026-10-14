// 웹앱 theme-script.ts와 같은 규칙이다. 첫 화면이 그려지기 전에 테마를 정해 깜빡임을 막는다(<head>에서 실행).
// 직접 고른 테마는 localStorage "theme"에 두고, 브라우저(OS)의 밝은/어두운 모드가 바뀌면 그 값을 지우고 그 모드를 따른다.
try {
  const media = matchMedia("(prefers-color-scheme: dark)");
  let theme = localStorage.getItem("theme");
  if (theme !== "dark" && theme !== "light") theme = media.matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  media.addEventListener("change", (e) => {
    try {
      localStorage.removeItem("theme");
    } catch {}
    document.documentElement.dataset.theme = e.matches ? "dark" : "light";
  });
} catch {}
