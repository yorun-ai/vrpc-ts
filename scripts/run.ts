import { chalk } from "zx";

export const logger = {
  info: (message: string) =>
    process.stdout.write(`${chalk.blue("ℹ")} ${chalk.bgBlue("INFO")} ${message}\n`),
  success: (message: string) =>
    process.stdout.write(`${chalk.green("✓")} ${chalk.bgGreen("SUCCESS")} ${message}\n`),
  error: (message: string) =>
    process.stdout.write(`${chalk.red("✗")} ${chalk.bgRed("ERROR")} ${message}\n`),
};

interface RunMessages {
  info: string;
  success: string | ((response: any) => string);
  error: string;
  onError?: () => Promise<void>;
}

export async function run<T>(script: Promise<T>, messages: RunMessages) {
  logger.info(messages.info);
  try {
    const response = await script;
    logger.success(
      typeof messages.success === "function" ? messages.success(response) : messages.success,
    );
    return response;
  } catch (err) {
    logger.error(messages.error);
    logger.error(String(err));

    if (messages.onError) {
      await messages.onError();
    }

    throw err;
  }
}
