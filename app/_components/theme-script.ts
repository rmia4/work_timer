export const THEME_STORAGE_KEY = "theme";

// 첫 화면이 그려지기 전에 테마를 정해 깜빡임을 막는다. layout의 <head>에서 실행한다.
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;
