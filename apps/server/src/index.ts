import { serve } from "@hono/node-server";
import app from "./app.js";
import { logger } from "./lib/logger.js";

const PORT = Number.parseInt(process.env.PORT || "9999", 10);

logger.info(
	{
		port: PORT,
		nodeEnv: process.env.NODE_ENV,
		corsOrigin: process.env.CORS_ORIGIN,
		frontendUrl: process.env.FRONTEND_URL,
		logLevel: process.env.LOG_LEVEL || "info",
	},
	"Server initialization starting",
);

serve(
	{
		fetch: app.fetch,
		port: PORT,
	},
	(info) => {
		logger.info(
			{
				port: info.port,
				address: info.address,
				family: info.family,
				url: `http://localhost:${info.port}`,
			},
			`Server successfully started and listening on port ${info.port}`,
		);
	},
);
