import type { auth } from "@turbo-hono-2/auth";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { authLogger } from "./logger";

authLogger.info(
	{
		baseURL: import.meta.env.VITE_SERVER_URL,
	},
	"Initializing auth client",
);

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_SERVER_URL,
	plugins: [inferAdditionalFields<typeof auth>()],
	fetchOptions: {
		onRequest: async (context) => {
			authLogger.debug(
				{
					method: context.method,
					headers: context.headers,
				},
				"🔐 Auth request",
			);
		},
		onResponse: async (context) => {
			authLogger.debug(
				{
					status: context.response.status,
					ok: context.response.ok,
				},
				`🔐 Auth response: ${context.response.status}`,
			);
		},
		onError: async (context) => {
			authLogger.error(
				{
					error: context.error,
				},
				"🔐 Auth request failed",
			);
		},
	},
});

authLogger.info("Auth client initialized successfully");
