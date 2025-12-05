import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@turbo-hono-2/api/routers/index";
import { toast } from "sonner";
import { httpLogger, orpcLogger } from "../lib/logger";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			orpcLogger.error(
				{
					error: error.message,
					stack: error.stack,
					cause: error.cause,
				},
				"Query error occurred",
			);

			toast.error(`Error: ${error.message}`, {
				action: {
					label: "retry",
					onClick: () => {
						queryClient.invalidateQueries();
					},
				},
			});
		},
	}),
	defaultOptions: {
		queries: {
			retry: 1,
		},
		mutations: {
			retry: 1,
		},
	},
});

const RPC_URL = `${import.meta.env.VITE_SERVER_URL}/rpc`;

httpLogger.info(
	{
		rpcUrl: RPC_URL,
		serverUrl: import.meta.env.VITE_SERVER_URL,
	},
	"Initializing RPC link",
);

export const link = new RPCLink({
	url: RPC_URL,
	method: "POST",
	async fetch(url, options) {
		const requestId = crypto.randomUUID();
		const startTime = Date.now();

		httpLogger.debug(
			{
				requestId,
				url,
				method: (options as RequestInit)?.method || "POST",
				headers: (options as RequestInit)?.headers,
				hasBody: !!(options as RequestInit)?.body,
			},
			"Sending RPC request",
		);

		try {
			const response = await fetch(url, {
				...options,
				credentials: "include",
			});

			const duration = Date.now() - startTime;

			httpLogger.info(
				{
					requestId,
					url,
					status: response.status,
					statusText: response.statusText,
					ok: response.ok,
					duration: `${duration}ms`,
					headers: Object.fromEntries(response.headers.entries()),
				},
				`RPC response received: ${response.status} ${response.statusText} (${duration}ms)`,
			);

			if (!response.ok) {
				httpLogger.error(
					{
						requestId,
						status: response.status,
						statusText: response.statusText,
						headers: Object.fromEntries(response.headers.entries()),
					},
					"RPC request failed with non-OK status",
				);

				// Try to log response body for debugging
				const clonedResponse = response.clone();
				try {
					const text = await clonedResponse.text();
					httpLogger.error(
						{
							requestId,
							responseBody: text,
						},
						"Response body",
					);
				} catch (e) {
					httpLogger.error(
						{ requestId, error: e },
						"Could not read response body",
					);
				}
			}

			return response;
		} catch (error) {
			const duration = Date.now() - startTime;

			httpLogger.error(
				{
					requestId,
					url,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					duration: `${duration}ms`,
					errorType:
						error instanceof TypeError ? "Network Error" : "Unknown Error",
				},
				`RPC request failed: ${error instanceof Error ? error.message : String(error)}`,
			);

			// Check for common network issues
			if (error instanceof TypeError) {
				httpLogger.error(
					{
						requestId,
						possibleCauses: [
							"CORS issue",
							"Network connectivity problem",
							"Server not responding",
							"Invalid URL",
						],
					},
					"Network error detected - this is likely a CORS or connectivity issue",
				);
			}

			throw error;
		}
	},
});

export const client: AppRouterClient = createORPCClient(link);

orpcLogger.info("ORPC client created successfully");

export const orpc = createTanstackQueryUtils(client);

orpcLogger.info("ORPC Tanstack Query utils initialized");
