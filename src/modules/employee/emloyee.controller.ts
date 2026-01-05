import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";

export const getEmployeeById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const employee = await prisma.employee.findUnique({
    where: { id },
  });

  res.json(employee);
};

export const getAllEmployeesByBusinessId = async (
  req: Request,
  res: Response
) => {
  const { businessId } = req.params;
  const employees = await prisma.employee.findMany({
    where: { businessId },
  });

  res.json(employees);
};

export const createEmployee = async (req: Request, res: Response) => {
  const { name, email, businessId } = req.body;
  const employee = await prisma.employee.create({
    data: { name, email, businessId },
  });

  res.status(201).json(employee);
};

export const employeeController = {
  getEmployeeById,
  getAllEmployeesByBusinessId,
  createEmployee,
};
