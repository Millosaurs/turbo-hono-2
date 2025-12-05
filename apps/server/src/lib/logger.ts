import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

export const logger = pino({
	level: LOG_LEVEL,
	transport: !IS_PRODUCTION
		? {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "yyyy-mm-dd HH:MM:ss.l",
					ignore: "pid,hostname",
					singleLine: false,
					messageFormat: "{levelLabel} | {module} | {msg}",
				},
			}
		: undefined,
	formatters: {
		level: (label) => {
			return { level: label.toUpperCase() };
		},
		bindings: (bindings) => {
			return {
				...bindings,
				node_env: NODE_ENV,
			};
		},
	},
	timestamp: pino.stdTimeFunctions.isoTime,
	base: {
		env: NODE_ENV,
		service: "turbo-hono-server",
	},
});

// Create child loggers for different modules
export const createLogger = (module: string) => {
	return logger.child({ module });
};

// Log startup info
logger.info(
	{
		logLevel: LOG_LEVEL,
		nodeEnv: NODE_ENV,
		isProduction: IS_PRODUCTION,
	},
	"Logger initialized",
);
