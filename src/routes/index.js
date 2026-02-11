import express from "express";
import attendanceRoutes from "./attendanceRoutes.js";
import authRoutes from "./authRoutes.js";
import expenseRoutes from "./expenseRoutes.js";
import organizationRoutes from "./organizationRoutes.js";
import projectRoutes from "./projectRoutes.js";
import reportRoutes from "./reportRoutes.js";
import roleRoutes from "./roleRoutes.js";
import supervisorRoutes from "./supervisorRoutes.js";

const router = express.Router();

// API Routes
router.use("/auth", authRoutes);
router.use("/organization", organizationRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/projects", projectRoutes);
router.use("/reports", reportRoutes);
router.use("/roles", roleRoutes);
router.use("/supervisor", supervisorRoutes);
router.use("/expenses", expenseRoutes);

export default router;
