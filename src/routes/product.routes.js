const express = require("express");
const {
  getProducts,
  searchProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/product.controller");

const router = express.Router();

router.route("/").get(getProducts).post(createProduct);
router.get("/search", searchProducts);
router.route("/:id").get(getProductById).put(updateProduct).delete(deleteProduct);

module.exports = router;
