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
	fetch(url, options) {
		const fetchOptions = options as RequestInit;
		console.log("Making request to:", url);
		console.log("Request options:", {
			method: fetchOptions?.method,
			headers: fetchOptions?.headers,
			credentials: "include",
		});

		return fetch(url, {
			...fetchOptions,
			credentials: "include",
			headers: {
				...(fetchOptions?.headers as Record<string, string>),
				"Content-Type": "application/json",
			},
		})
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
