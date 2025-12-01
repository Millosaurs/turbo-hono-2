import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/schema/auth.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	external: ["pg-native"],
});
