export const THEME_STORAGE_KEY = "theme";

// 첫 화면이 그려지기 전에 테마를 정해 깜빡임을 막는다. layout의 <head>에서 실행한다.
// 브라우저(OS)의 밝은/어두운 모드가 바뀌면 직접 고른 테마를 지우고 그 모드를 따른다.
export const themeInitScript = `try{var m=matchMedia("(prefers-color-scheme: dark)"),d=document.documentElement,t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dark"&&t!=="light")t=m.matches?"dark":"light";d.dataset.theme=t;m.addEventListener("change",function(e){try{localStorage.removeItem("${THEME_STORAGE_KEY}")}catch(x){}d.dataset.theme=e.matches?"dark":"light"})}catch(e){}`;
