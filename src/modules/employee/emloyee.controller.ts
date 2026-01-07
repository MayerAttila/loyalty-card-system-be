import type { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import bcrypt from "bcryptjs";

export const getEmployeeById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
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
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(employees);
};

export const createEmployee = async (req: Request, res: Response) => {
  const { name, email, businessId, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const employee = await prisma.employee.create({
    data: { name, email, businessId, password: hashed },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(employee);
};

export const employeeController = {
  getEmployeeById,
  getAllEmployeesByBusinessId,
  createEmployee,
};
