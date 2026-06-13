const express = require("express");
const {
  getActiveEcommerceSettingCategories,
  getEcommerceCategoryFilters,
  getEcommerceSettingCategories,
  getEcommerceSettings,
  getProductByActiveEcommerceCategory,
  getProductsByActiveEcommerceCategory,
  getStorefrontSettings,
  getEcommerceSettingByCategory,
  upsertEcommerceSetting,
  resetEcommerceSetting,
} = require("../controllers/ecommerceSetting.controller");

const router = express.Router();

router.get("/", getEcommerceSettings);
router.get("/categories", getEcommerceSettingCategories);
router.get("/categories/active", getActiveEcommerceSettingCategories);
router.get("/categories/:categoryId/filters", getEcommerceCategoryFilters);
router.get("/categories/active/:categoryId/products", getProductsByActiveEcommerceCategory);
router.get(
  "/categories/active/:categoryId/products/:productId",
  getProductByActiveEcommerceCategory
);
router.get("/storefront", getStorefrontSettings);
router
  .route("/:categoryId")
  .get(getEcommerceSettingByCategory)
  .put(upsertEcommerceSetting)
  .delete(resetEcommerceSetting);

module.exports = router;
