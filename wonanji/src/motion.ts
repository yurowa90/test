/** 동작 줄이기(prefers-reduced-motion)를 켠 사용자에게는 부드러운 스크롤 대신 바로 옮깁니다. */
export const scrollBehavior = (): ScrollBehavior => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
