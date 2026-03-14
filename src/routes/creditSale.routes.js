const express = require("express");
const {
  createCreditSale,
  getCreditSales,
  getCreditSaleById,
  updateCreditSale,
  addCreditSalePayment,
  addCreditSaleRefund,
  deleteCreditSale,
} = require("../controllers/creditSale.controller");

const router = express.Router();

router.route("/").get(getCreditSales).post(createCreditSale);
router.post("/:id/payments", addCreditSalePayment);
router.post("/:id/refunds", addCreditSaleRefund);
router.route("/:id").get(getCreditSaleById).put(updateCreditSale).delete(deleteCreditSale);

module.exports = router;
