import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { BadRequestError } from "../errors/AppError.js";

interface RequestValidationSchema {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validateRequest = (schema: RequestValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        // Express 5 exposes req.query as a getter; keep parsed/coerced data in locals.
        res.locals.validatedQuery = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params) as any;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issueMsg = err.issues
          .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
          .join(", ");
        return next(new BadRequestError(`Validasi gagal: ${issueMsg}`, err.issues));
      }
      next(err);
    }
  };
};
