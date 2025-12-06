import "dotenv/config";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@turbo-hono-2/api/context";
import { appRouter } from "@turbo-hono-2/api/routers/index";
import { auth } from "@turbo-hono-2/auth";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { notFound } from "stoker/middlewares";
import { createLogger, logger } from "./lib/logger";

const app = new Hono();

const rpcLogger = createLogger("RPC");
const apiLogger = createLogger("API");
const authLogger = createLogger("AUTH");

// Pino logger middleware
app.use(
	"*",
	pinoLogger({
		pino: logger,
		http: { reqId: () => crypto.randomUUID() },
	}),
);

// Global request/response logging
app.use("*", async (c, next) => {
	const start = Date.now();
	logger.debug(
		{ method: c.req.method, path: c.req.path, origin: c.req.header("origin") },
		"Request received",
	);
	await next();
	logger.info(
		{
			method: c.req.method,
			path: c.req.path,
			status: c.res.status,
			duration: Date.now() - start,
		},
		"Request completed",
	);
});

// Auth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
	authLogger.debug(
		{ method: c.req.method, path: c.req.path },
		"Auth request received",
	);
	return auth.handler(c.req.raw);
});

// oRPC handlers with CORSPlugin
const allowedOrigins = [
	process.env.CORS_ORIGIN,
	"http://localhost:3001",
].filter(Boolean);

export const rpcHandler = new RPCHandler(appRouter, {
	plugins: [
		new CORSPlugin({
			origin: (origin) => {
				if (!origin) return allowedOrigins[0] || "*";
				return allowedOrigins.includes(origin)
					? origin
					: allowedOrigins[0] || "*";
			},
			allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
			maxAge: 86400,
		}),
	],
	interceptors: [
		onError((error) => {
			rpcLogger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				},
				"RPC Handler Error",
			);
		}),
	],
});

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
		new CORSPlugin({
			origin: (origin) => {
				if (!origin) return allowedOrigins[0] || "*";
				return allowedOrigins.includes(origin)
					? origin
					: allowedOrigins[0] || "*";
			},
			allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	],
	interceptors: [
		onError((error) => {
			apiLogger.error(
				{
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				},
				"API Handler Error",
			);
		}),
	],
});

// oRPC route handling
app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context,
	});
	if (rpcResult.matched) {
		rpcLogger.info(
			{ path: c.req.path, status: rpcResult.response.status },
			"RPC handler matched",
		);
		return rpcResult.response;
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context,
	});
	if (apiResult.matched) {
		apiLogger.info(
			{ path: c.req.path, status: apiResult.response.status },
			"API handler matched",
		);
		return apiResult.response;
	}

	await next();
});

app.get("/", (c) => c.text("OK"));

app.notFound(notFound);

app.onError((err, c) => {
	logger.error(
		{ error: err.message, stack: err.stack, path: c.req.path },
		"Unhandled error",
	);
	return c.json(
		{
			error: "Internal Server Error",
			message: process.env.NODE_ENV === "development" ? err.message : undefined,
			path: c.req.path,
		},
		500,
	);
});

export default app;
