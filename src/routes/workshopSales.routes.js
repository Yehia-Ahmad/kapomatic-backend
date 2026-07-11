const express = require("express");
const WorkshopSalesController = require("../controllers/workshopSales.controller");

const router = express.Router();

router
  .route("/")
  .get(WorkshopSalesController.getWorkshopSales)
  .post(WorkshopSalesController.createWorkshopSale);

router.post("/:id/payments", WorkshopSalesController.addWorkshopSalePayment);
router.post("/:id/cancel", WorkshopSalesController.cancelWorkshopSale);
router.post("/:id/mark-delivered", WorkshopSalesController.markWorkshopSaleDelivered);

router
  .route("/:id")
  .get(WorkshopSalesController.getWorkshopSaleById)
  .put(WorkshopSalesController.updateWorkshopSale)
  .delete(WorkshopSalesController.deleteWorkshopSale);

module.exports = router;
