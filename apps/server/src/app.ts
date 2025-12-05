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
import { pinoLogger } from "hono-pino";
import { createLogger, logger } from "./lib/logger.js";

const app = new Hono();

const corsLogger = createLogger("CORS");
const rpcLogger = createLogger("RPC");
const apiLogger = createLogger("API");
const authLogger = createLogger("AUTH");

// Pino logger middleware with custom configuration
app.use(
	"*",
	pinoLogger({
		pino: logger,
		http: {
			reqId: () => crypto.randomUUID(),
		},
	}),
);

// CORS middleware with detailed logging
app.use(
	"/*",
	cors({
		origin: (origin) => {
			const allowedOrigins = [
				process.env.CORS_ORIGIN,
				process.env.FRONTEND_URL,
				"http://localhost:3001",
				"http://localhost:5173",
			].filter(Boolean);

			corsLogger.debug(
				{
					origin,
					allowedOrigins,
					corsOriginEnv: process.env.CORS_ORIGIN,
					frontendUrlEnv: process.env.FRONTEND_URL,
				},
				"Checking CORS origin against allowed list",
			);

			if (!origin) {
				corsLogger.warn(
					{ allowedOrigins },
					"No origin header present in request, using first allowed origin",
				);
				return allowedOrigins[0] || "*";
			}

			const isAllowed = allowedOrigins.includes(origin);
			corsLogger.debug(
				{
					origin,
					isAllowed,
				},
				`CORS origin validation ${isAllowed ? "passed" : "failed"}`,
			);

			return isAllowed ? origin : allowedOrigins[0] || "*";
		},
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
		maxAge: 86400,
	}),
);

// Log all incoming requests
app.use("*", async (c, next) => {
	const start = Date.now();
	const method = c.req.method;
	const path = c.req.path;
	const origin = c.req.header("origin");
	const contentType = c.req.header("content-type");

	logger.debug(
		{
			method,
			path,
			origin,
			contentType,
			headers: Object.fromEntries(c.req.raw.headers.entries()),
		},
		"Request received",
	);

	await next();

	const duration = Date.now() - start;
	const status = c.res.status;

	logger.info(
		{
			method,
			path,
			status,
			duration,
			origin,
		},
		`Request completed: ${method} ${path} ${status} in ${duration}ms`,
	);

	logger.debug(
		{
			status,
			responseHeaders: Object.fromEntries(c.res.headers.entries()),
		},
		"Response headers sent",
	);
});

// Handle OPTIONS preflight requests explicitly before other handlers
app.options("*", (c) => {
	corsLogger.debug(
		{
			path: c.req.path,
			origin: c.req.header("origin"),
		},
		"OPTIONS preflight request handled",
	);
	return new Response(null, { status: 204 });
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	authLogger.debug(
		{
			method: c.req.method,
			path: c.req.path,
		},
		"Auth request received",
	);

	return auth.handler(c.req.raw);
});

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
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

export const rpcHandler = new RPCHandler(appRouter, {
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

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	rpcLogger.debug(
		{
			path: c.req.path,
			method: c.req.method,
		},
		"Processing RPC handler",
	);

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: context,
	});

	if (rpcResult.matched) {
		rpcLogger.info(
			{
				path: c.req.path,
				status: rpcResult.response.status,
				matched: true,
			},
			"RPC handler matched and processed request",
		);

		rpcLogger.debug(
			{
				status: rpcResult.response.status,
				responseHeaders: Object.fromEntries(
					rpcResult.response.headers.entries(),
				),
			},
			"RPC response prepared",
		);

		return rpcResult.response;
	}

	rpcLogger.debug(
		{
			path: c.req.path,
		},
		"RPC handler not matched, passing to API handler",
	);

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context: context,
	});

	if (apiResult.matched) {
		apiLogger.info(
			{
				path: c.req.path,
				status: apiResult.response.status,
				matched: true,
			},
			"API handler matched and processed request",
		);

		return apiResult.response;
	}

	apiLogger.debug(
		{
			path: c.req.path,
		},
		"API handler not matched, continuing to next middleware",
	);

	await next();
});

app.get("/", (c) => {
	logger.info("Health check endpoint accessed");
	return c.text("OK");
});

app.notFound((c) => {
	logger.warn(
		{
			path: c.req.path,
			method: c.req.method,
		},
		"Route not found - 404",
	);
	return c.json(
		{
			error: "Not Found",
			path: c.req.path,
		},
		404,
	);
});

app.onError((err, c) => {
	logger.error(
		{
			error: err.message,
			stack: err.stack,
			path: c.req.path,
			method: c.req.method,
		},
		"Unhandled error occurred - 500",
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
