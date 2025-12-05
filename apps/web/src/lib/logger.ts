import pino from "pino";

const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || "info";
const NODE_ENV = import.meta.env.MODE || "development";

// Browser-compatible logger configuration
export const logger = pino({
	level: LOG_LEVEL,
	browser: {
		asObject: true,
		serialize: true,
		transmit: {
			level: "debug",
			send: (level, logEvent) => {
				// Send logs to console in development
				if (NODE_ENV === "development") {
					const { messages } = logEvent;
					const [msg] = messages;

					switch (level) {
						case "fatal":
						case "error":
							console.error(msg);
							break;
						case "warn":
							console.warn(msg);
							break;
						case "info":
							console.info(msg);
							break;
						case "debug":
						case "trace":
							console.debug(msg);
							break;
						default:
							console.log(msg);
					}
				}
			},
		},
	},
	formatters: {
		level: (label) => {
			return { level: label.toUpperCase() };
		},
	},
	base: {
		env: NODE_ENV,
	},
});

// Create child loggers for different modules
export const createLogger = (module: string) => {
	return logger.child({ module });
};

// Export specific loggers for common use cases
export const httpLogger = createLogger("HTTP");
export const orpcLogger = createLogger("ORPC");
export const authLogger = createLogger("AUTH");
export const routerLogger = createLogger("ROUTER");

// Log startup info
logger.info(
	{
		logLevel: LOG_LEVEL,
		env: NODE_ENV,
		serverUrl: import.meta.env.VITE_SERVER_URL,
	},
	"Frontend logger initialized",
);
