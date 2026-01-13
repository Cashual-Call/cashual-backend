import { Response, Request, NextFunction } from "express";
import respVal from "../validation/response.validation";
import { ZodError } from "zod";
import { fromError } from "zod-validation-error";
import {
	PrismaClientKnownRequestError,
	PrismaClientValidationError,
} from "@prisma/client/runtime/client";

export const validateResponse = (
	_: Request,
	res: Response,
	next: NextFunction,
) => {
	const originalJson = res.json;

	res.json = function (data) {
		try {
			const error = data.error;

			if (error) {
				// Zod Error Handler
				if (error instanceof ZodError) {
					const response = zodErrorHandler(error);
					return originalJson.call(this, response);
				}

				// Prisma Error Handler
				else if (
					error instanceof PrismaClientKnownRequestError ||
					error instanceof PrismaClientValidationError
				) {
					const prismaError = handlePrismaError(error);
					res.status(prismaError.status);
					return originalJson.call(this, {
						success: false,
						message: prismaError.message,
					});
				}

				// console.log(error);
				res.status(500);
				if (error instanceof Error) {
					return originalJson.call(this, {
						success: false,
						message: error.message,
					});
				}
				return originalJson.call(this, {
					success: false,
					message: error || "An unexpected error occurred",
				});
			}

			const validatedData = respVal.parse(data);
			return originalJson.call(this, validatedData);
		} catch (error) {
			console.error(error);
			res.status(500);
			return originalJson.call(this, {
				success: false,
				message: "Response validation failed",
			});
		}
	};

	next();
};

const zodErrorHandler = (error: ZodError) => {
	return {
		success: false,
		message: fromError(error).toString(),
	};
};

const handlePrismaError = (
	err: PrismaClientKnownRequestError | PrismaClientValidationError,
): { message: string; status: number } => {
	if (err instanceof PrismaClientValidationError) {
		console.error(err);
		return {
			message: "Invalid input data format",
			status: 400,
		};
	}

	switch (err.code) {
		case "P2002":
			return {
				message: `Duplicate field value: ${err.meta?.target}`,
				status: 400,
			};
		case "P2014":
			return { message: `Invalid ID: ${err.meta?.target}`, status: 400 };
		case "P2003":
			return {
				message: `Invalid input data: ${err.meta?.target}`,
				status: 400,
			};
		default:
			console.error(err.message);
			return { message: `Something went wrong`, status: 500 };
	}
};
