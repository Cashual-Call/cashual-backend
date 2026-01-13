import { Request, Response, NextFunction } from "express";
export const errorHandler = (
	error: Error,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	console.error(error.stack);
	res.status(500).json({ error: "Something went wrong!" });
};
