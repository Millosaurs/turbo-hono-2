import pino from "pino";

const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || "info";
const NODE_ENV = import.meta.env.MODE || "development";
const IS_PRODUCTION = NODE_ENV === "production";

// Browser-compatible logger configuration
export const logger = pino({
	level: LOG_LEVEL,
	browser: {
		asObject: true,
		serialize: true,
		transmit: {
			level: "trace",
			send: (level, logEvent) => {
				const { messages } = logEvent;
				const [msg] = messages;

				if (!msg) return;

				// Format the log message
				const timestamp = new Date().toISOString();
				const logData = typeof msg === "object" ? msg : { message: msg };
				const module = logData.module || "APP";
				const message = logData.msg || logData.message || "";
				const levelLabel = level.toUpperCase().padEnd(5);

				// Create formatted log
				const formattedLog = `[${timestamp}] ${levelLabel} | ${module} | ${message}`;

				// Only log in development or if explicitly enabled
				if (!IS_PRODUCTION || LOG_LEVEL === "debug" || LOG_LEVEL === "trace") {
					switch (level) {
						case "fatal":
						case "error":
							console.error(formattedLog, logData);
							break;
						case "warn":
							console.warn(formattedLog, logData);
							break;
						case "info":
							console.info(formattedLog, logData);
							break;
						case "debug":
						case "trace":
							console.debug(formattedLog, logData);
							break;
						default:
							console.log(formattedLog, logData);
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
		service: "turbo-hono-web",
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
		isProduction: IS_PRODUCTION,
		serverUrl: import.meta.env.VITE_SERVER_URL,
	},
	"Frontend logger initialized",
);
