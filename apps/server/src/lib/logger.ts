import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";

export const logger = pino({
	level: LOG_LEVEL,
	transport:
		NODE_ENV === "development"
			? {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "HH:MM:ss Z",
						ignore: "pid,hostname",
						singleLine: false,
					},
				}
			: undefined,
	formatters: {
		level: (label) => {
			return { level: label.toUpperCase() };
		},
	},
	timestamp: pino.stdTimeFunctions.isoTime,
	base: {
		env: NODE_ENV,
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
	},
	"Logger initialized",
);
