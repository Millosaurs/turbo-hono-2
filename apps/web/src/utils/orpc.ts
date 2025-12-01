import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@turbo-hono-2/api/routers/index";
import { toast } from "sonner";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			console.error("Query Error:", error);
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
});

const serverUrl = import.meta.env.VITE_SERVER_URL;

if (!serverUrl) {
	console.error(
		"VITE_SERVER_URL is not defined. Please set it in your environment variables.",
	);
}

console.log("API Server URL:", serverUrl);

export const link = new RPCLink({
	url: `${serverUrl}/rpc`,
	async fetch(input, init) {
		console.log("Making request to:", input);
		console.log("Request init:", init);

		const requestInit = init as RequestInit | undefined;

		// Handle both Request objects and string URLs
		let url: string;
		let method: string;
		let headers: HeadersInit;
		let body: BodyInit | null = null;

		if (typeof input === "string") {
			url = input;
			method = requestInit?.method || "GET";
			headers = requestInit?.headers || {};
			body = requestInit?.body || null;
		} else {
			// input is a Request object - we need to read it properly
			url = input.url;
			method = input.method;

			// Convert Headers object to plain object
			const headersObj: Record<string, string> = {};
			input.headers.forEach((value, key) => {
				headersObj[key] = value;
			});
			headers = headersObj;

			// Clone the body if it exists
			if (input.body) {
				body = await input.clone().text();
			}
		}

		// Build final request init with credentials: "include"
		const finalInit: RequestInit = {
			method,
			credentials: "include",
			headers: {
				...(headers as Record<string, string>),
				"Content-Type": "application/json",
			},
			body,
			...(requestInit || {}),
		};

		console.log("Final request:", {
			url,
			method,
			credentials: finalInit.credentials,
		});

		return fetch(url, finalInit)
			.then((response) => {
				console.log("Response status:", response.status);
				console.log("Response headers:", Object.fromEntries(response.headers));
				if (!response.ok) {
					console.error("Response not OK:", response.statusText);
				}
				return response;
			})
			.catch((error) => {
				console.error("Fetch error:", error);
				console.error("Error details:", {
					message: error.message,
					name: error.name,
					stack: error.stack,
				});
				throw error;
			});
	},
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
