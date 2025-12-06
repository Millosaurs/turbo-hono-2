import { auth } from "@turbo-hono-2/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	let session = null;

	try {
		// Try to get session, but don't fail if database is unavailable
		session = await Promise.race([
			auth.api.getSession({
				headers: context.req.raw.headers as Headers,
			}),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error("Session fetch timeout")), 3000),
			),
		]);
	} catch (error) {
		// Log the error but continue without session
		// This allows public procedures to work even if database is unavailable
		console.warn(
			"Failed to fetch session:",
			error instanceof Error ? error.message : String(error),
		);
		session = null;
	}

	return {
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
