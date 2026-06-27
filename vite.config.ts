import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' 로 두면 GitHub Pages 등 하위 경로 배포에서도 자원 경로가 깨지지 않음.
export default defineConfig({ base: "./", plugins: [react()] });
