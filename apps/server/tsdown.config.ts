import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["./src/index.ts", "./src/app.ts"],
	format: "esm",
	outDir: "./dist",
	clean: true,
	noExternal: [/@turbo-hono-2\/.*/],
});
