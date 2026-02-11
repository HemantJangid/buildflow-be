import express from "express";
import { PERMISSIONS } from "../constants.js";
import {
  getOrganizationSettings,
  updateOrganizationSettings,
} from "../controllers/organizationController.js";
import { hasPermission, protect } from "../middleware/auth.js";

const router = express.Router();

router.get(
  "/settings",
  protect,
  hasPermission(PERMISSIONS.SYSTEM_SETTINGS),
  getOrganizationSettings,
);

router.put(
  "/settings",
  protect,
  hasPermission(PERMISSIONS.SYSTEM_SETTINGS),
  updateOrganizationSettings,
);

export default router;
