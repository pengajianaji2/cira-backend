import { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/db.config.js";
import { NotFoundError } from "../errors/AppError.js";

type ProjectResource = "task" | "sprint" | "payment" | "paymentTerm" | "asset";

const normalizeRole = (role: string): string =>
  role === "ops" ? "operasional" : role === "dev" ? "developer" : role;

const routeParam = (req: Request, name: string): string | undefined => {
  const value = req.params[name];
  return typeof value === "string" ? value : undefined;
};

async function findProjectIdForResource(resource: ProjectResource, id: string): Promise<string | null> {
  switch (resource) {
    case "task":
      return (await prisma.task.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "sprint":
      return (await prisma.sprint.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "payment":
      return (await prisma.payment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "paymentTerm":
      return (await prisma.paymentTerm.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
    case "asset":
      return (await prisma.designAsset.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  }
}

async function assertProjectAccess(req: Request, projectId: string): Promise<void> {
  const user = req.user;
  if (!user) throw new NotFoundError("Proyek tidak ditemukan.");
  const roles = user.roles.map(normalizeRole);
  const isOrganizationWide = roles.includes("owner") || roles.includes("operasional");
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...(isOrganizationWide ? {} : { roster: { some: { userId: user.id } } }),
    },
    select: { id: true },
  });
  if (!project) throw new NotFoundError("Proyek tidak ditemukan.");
}

/** Developers can access only projects in their roster; owner and operational roles have organization-wide access. */
export const requireProjectAccess = (paramName = "projectId") => async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const projectId = routeParam(req, paramName);
    if (!projectId) throw new NotFoundError("Proyek tidak ditemukan.");
    await assertProjectAccess(req, projectId);
    next();
  } catch (error) {
    next(error);
  }
};

/** Resolves an ID-addressed record to its project and applies the same roster scope. */
export const requireProjectResourceAccess = (resource: ProjectResource, paramName = "id") => async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const resourceId = routeParam(req, paramName);
    if (!resourceId) throw new NotFoundError("Data tidak ditemukan.");
    const projectId = await findProjectIdForResource(resource, resourceId);
    if (!projectId) throw new NotFoundError("Data tidak ditemukan.");
    await assertProjectAccess(req, projectId);
    next();
  } catch (error) {
    next(error);
  }
};
