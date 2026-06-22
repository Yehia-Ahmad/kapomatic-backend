const express = require("express");
const {
  createSelling,
  getSellings,
  getSellingById,
  updateSelling,
  addSellingRefund,
  deleteSelling,
} = require("../controllers/selling.controller");

const router = express.Router();

router.route("/").get(getSellings).post(createSelling);
router.post("/:id/refunds", addSellingRefund);
router.route("/:id").get(getSellingById).put(updateSelling).delete(deleteSelling);

module.exports = router;
