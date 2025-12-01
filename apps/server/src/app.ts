import "dotenv/config";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@turbo-hono-2/api/context";
import { appRouter } from "@turbo-hono-2/api/routers/index";
import { auth } from "@turbo-hono-2/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());

// Parse CORS origins from environment variable
const corsOrigins =
	process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || [];

console.log("CORS Origins configured:", corsOrigins);
console.log("NODE_ENV:", process.env.NODE_ENV);

// Apply CORS middleware
app.use(
	"/*",
	cors({
		origin: (origin) => {
			console.log("CORS check for origin:", origin);

			// Allow requests with no origin (like mobile apps, Postman, curl)
			if (!origin) {
				console.log("No origin, allowing with *");
				return "*";
			}

			// Check if origin is in the allowed list
			if (corsOrigins.length > 0 && corsOrigins.includes(origin)) {
				console.log("Origin in whitelist, allowing:", origin);
				return origin;
			}

			// Allow localhost for development
			if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
				console.log("Localhost origin, allowing:", origin);
				return origin;
			}

			// Allow all Vercel deployments
			if (origin.includes(".vercel.app")) {
				console.log("Vercel origin, allowing:", origin);
				return origin;
			}

			// Log unmatched origins for debugging
			console.warn(`CORS: Unmatched origin: ${origin}`);

			// Allow all origins for now to debug
			console.log("Allowing origin anyway for debugging:", origin);
			return origin;
		},
		allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"X-Requested-With",
			"Accept",
			"Origin",
		],
		exposeHeaders: ["Content-Length", "Content-Type"],
		credentials: true,
		maxAge: 86400, // 24 hours
	}),
);

// Auth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Initialize handlers
export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error("API Handler Error:", error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error("RPC Handler Error:", error);
		}),
	],
});

// Main request handler
app.use("/*", async (c, next) => {
	try {
		// Log incoming request details
		console.log("Incoming request:", {
			method: c.req.method,
			url: c.req.url,
			path: c.req.path,
			origin: c.req.header("origin"),
			contentType: c.req.header("content-type"),
		});

		const context = await createContext({ context: c });

		// Handle RPC requests
		const rpcResult = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context: context,
		});

		if (rpcResult.matched) {
			console.log("RPC matched, returning response:", {
				status: rpcResult.response.status,
				headers: Object.fromEntries(rpcResult.response.headers.entries()),
			});

			// Manually add CORS headers to response
			const origin = c.req.header("origin") || "*";
			const newHeaders = new Headers(rpcResult.response.headers);

			newHeaders.set("Access-Control-Allow-Origin", origin);
			newHeaders.set("Access-Control-Allow-Credentials", "true");
			newHeaders.set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, PATCH, OPTIONS",
			);
			newHeaders.set(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, X-Requested-With, Accept, Origin",
			);

			const responseBody = await rpcResult.response.text();

			return new Response(responseBody, {
				status: rpcResult.response.status,
				statusText: rpcResult.response.statusText,
				headers: newHeaders,
			});
		}

		// Handle API reference requests
		const apiResult = await apiHandler.handle(c.req.raw, {
			prefix: "/api-reference",
			context: context,
		});

		if (apiResult.matched) {
			console.log("API matched, returning response:", {
				status: apiResult.response.status,
				headers: Object.fromEntries(apiResult.response.headers.entries()),
			});

			// Manually add CORS headers to response
			const origin = c.req.header("origin") || "*";
			const newHeaders = new Headers(apiResult.response.headers);

			newHeaders.set("Access-Control-Allow-Origin", origin);
			newHeaders.set("Access-Control-Allow-Credentials", "true");
			newHeaders.set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, PATCH, OPTIONS",
			);
			newHeaders.set(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, X-Requested-With, Accept, Origin",
			);

			const responseBody = await apiResult.response.text();

			return new Response(responseBody, {
				status: apiResult.response.status,
				statusText: apiResult.response.statusText,
				headers: newHeaders,
			});
		}

		console.log("No handler matched, passing to next middleware");
		await next();
	} catch (error) {
		console.error("Request handler error:", error);
		return c.json(
			{
				error: "Internal server error",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
});

// Health check route
app.get("/", (c) => {
	return c.json({
		status: "OK",
		timestamp: new Date().toISOString(),
		cors_origins: corsOrigins.length > 0 ? corsOrigins : ["*"],
	});
});

export default app;
