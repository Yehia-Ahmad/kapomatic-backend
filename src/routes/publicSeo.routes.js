const express = require("express");
const {
  getCategoryImage,
  getLocalizedCategory,
  getLocalizedCategoryProducts,
  getLocalizedProduct,
  getProductImage,
  getSitemapCategories,
  getSitemapImages,
  getSitemapPages,
  getSitemapProducts,
  resolveSlugAlias,
  searchLocalizedProducts,
} = require("../controllers/publicSeo.controller");

const router = express.Router();

router.get("/seo/sitemap/pages", getSitemapPages);
router.get("/seo/sitemap/categories", getSitemapCategories);
router.get("/seo/sitemap/products", getSitemapProducts);
router.get("/seo/sitemap/images", getSitemapImages);
router.get("/images/categories/:id", getCategoryImage);
router.get("/images/products/:id", getProductImage);
router.get("/products/search", searchLocalizedProducts);
// Deprecated compatibility aliases. New clients should use /api/public/products/search.
router.get("/:language/products/search", searchLocalizedProducts);
router.get("/:language/categories/:slug/products", getLocalizedCategoryProducts);
router.get("/:language/categories/:slug", getLocalizedCategory);
router.get("/:language/products/:slug", getLocalizedProduct);
router.get("/:language/slug-aliases/:entityType/:slug", resolveSlugAlias);

module.exports = router;
