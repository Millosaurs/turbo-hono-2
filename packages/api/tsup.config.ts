import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/context.ts", "src/routers/index.ts"],
	format: ["esm"],
	dts: {
		resolve: true,
		compilerOptions: {
			composite: false,
			skipLibCheck: true,
		},
	},
	sourcemap: true,
	clean: true,
	splitting: false,
});
