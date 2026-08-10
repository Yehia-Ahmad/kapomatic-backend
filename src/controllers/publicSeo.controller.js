const mongoose = require("mongoose");
const Category = require("../models/category.model");
const EcommerceSetting = require("../models/ecommerceSetting.model");
const Product = require("../models/product.model");
const ShippingSetting = require("../models/shippingSetting.model");
const asyncHandler = require("../utils/asyncHandler");
const { buildPaginationMetadata, getPaginationParams } = require("../utils/pagination");
const { calculatePriceAfterDiscount, withProductPriceAfterDiscount } = require("../utils/productPricing");
const {
  LANGUAGES,
  assertLanguage,
  cacheGet,
  cacheSet,
  escapeRegex,
  getEntityImageUrl,
  getWebsiteOrigin,
  hasObjectId,
  normalizeSlug,
  sendBase64Image,
} = require("../utils/seo");

const ENTITY_MODELS = {
  category: Category,
  product: Product,
};

const PRODUCT_PUBLIC_FIELDS =
  "name code image retailPrice discountPercentage inventoryCount category specifications translations seo slugAliases updatedAt createdAt";

const getLocalized = (entity, language) => entity?.translations?.[language] || {};
const hasTranslation = (entity, language) => Boolean(getLocalized(entity, language).name && getLocalized(entity, language).slug);
const allowArabicLegacyFallback = (entity, language) => language === "ar" && Boolean(entity?.name);
const hasPublicLocalizedValue = (entity, language) =>
  hasTranslation(entity, language) || allowArabicLegacyFallback(entity, language);
const getLocalizedName = (entity, language) =>
  getLocalized(entity, language).name || (language === "ar" ? entity.name : undefined);
const getRobots = (seo = {}) =>
  `${seo.robotsIndex === false ? "noindex" : "index"},${seo.robotsFollow === false ? "nofollow" : "follow"}`;
const getCurrency = async () => {
  const setting = await ShippingSetting.findOne({ key: "default" }).select("currency").lean();
  return setting?.currency || "EGP";
};

const localizedUrl = (entityType, language, slug) =>
  slug ? `${getWebsiteOrigin()}/${language}/${entityType === "category" ? "categories" : "products"}/${slug}` : undefined;

const getLocalizedSlug = (entity, language) =>
  getLocalized(entity, language).slug || (language === "ar" ? String(entity._id) : undefined);

const alternates = (entity, entityType) => {
  const ar = getLocalizedSlug(entity, "ar");
  const en = entity.translations?.en?.slug;
  const urls = {};
  if (ar) urls.ar = localizedUrl(entityType, "ar", ar);
  if (en) urls.en = localizedUrl(entityType, "en", en);
  if (ar) urls.xDefault = urls.ar;
  return urls;
};

const buildSeo = ({ entity, entityType, language, imageUrl }) => {
  const localized = getLocalized(entity, language);
  const seo = entity.seo || {};
  const langSeo = seo[language] || {};
  const name = getLocalizedName(entity, language);
  const canonicalUrl =
    langSeo.canonicalOverride || localizedUrl(entityType, language, getLocalizedSlug(entity, language));
  const fallbackTitle =
    entityType === "category"
      ? language === "ar"
        ? `${name} في مصر | كابوماتيك`
        : `${name} in Egypt | Kapomatic`
      : language === "ar"
        ? `${name} | كابوماتيك`
        : `${name} | Kapomatic`;
  const description = langSeo.metaDescription || localized.description || localized.shortDescription || "";
  const title = langSeo.metaTitle || fallbackTitle;
  const ogTitle = langSeo.ogTitle || title;
  const ogDescription = langSeo.ogDescription || description;
  const ogImage = seo.ogImage && !seo.ogImage.startsWith("data:") ? seo.ogImage : imageUrl;

  return {
    title,
    description,
    canonicalUrl,
    alternateUrls: alternates(entity, entityType),
    robots: getRobots(seo),
    og: {
      title: ogTitle,
      description: ogDescription,
      image: ogImage,
      url: canonicalUrl,
      type: entityType === "product" ? "product" : "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      image: ogImage,
    },
    structuredData: [],
  };
};

const findActiveSettingForCategory = (categoryId) =>
  EcommerceSetting.findOne({ category: categoryId, showOnWebsite: true }).lean();

const getActiveProductIds = async () => {
  const settings = await EcommerceSetting.find({ showOnWebsite: true }).select("selectedProducts").lean();
  return [...new Set(settings.flatMap((setting) => (setting.selectedProducts || []).map(String)))];
};

const parseSort = (sort) => {
  if (sort === "price_asc") return { retailPrice: 1, _id: 1 };
  if (sort === "price_desc") return { retailPrice: -1, _id: 1 };
  return { createdAt: -1, _id: -1 };
};

const productMatchesFilters = (product, query) => {
  const ignored = new Set(["page", "limit", "sort", "q", "search"]);
  const filters = Object.entries(query).filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== "");
  if (filters.length === 0) return true;

  return filters.every(([key, value]) =>
    (product.specifications || []).some((specification) => {
      const name = String(specification.name ?? specification.title ?? specification.key ?? specification.label ?? "").trim();
      const rawValue = specification.value ?? specification.values;
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      return name === key && values.map((item) => String(item)).includes(String(value));
    })
  );
};

const serializeProduct = (req, product, language, currency) => {
  const priced = withProductPriceAfterDiscount(product);
  const category = product.category;
  const imageUrl = getEntityImageUrl(req, "product", product);
  const ratingFields = {};
  if (product.rating !== undefined) ratingFields.rating = product.rating;
  if (product.averageRating !== undefined) ratingFields.averageRating = product.averageRating;
  if (product.reviewCount !== undefined) ratingFields.reviewCount = product.reviewCount;
  if (product.reviewsCount !== undefined) ratingFields.reviewsCount = product.reviewsCount;

  return {
    id: product._id,
    name: getLocalizedName(product, language),
    description: getLocalized(product, language).description,
    slug: getLocalizedSlug(product, language),
    imageAlt: getLocalized(product, language).imageAlt,
    code: product.code,
    category: category
      ? {
          id: category._id,
          name: getLocalizedName(category, language),
          slug: getLocalizedSlug(category, language),
        }
      : undefined,
    imageUrl,
    retailPrice: product.retailPrice,
    discountPercentage: Number(product.discountPercentage || 0),
    finalVisiblePrice:
      Number(product.discountPercentage || 0) > 0 ? priced.priceAfterDiscount : Number(product.retailPrice || 0),
    currency,
    availability:
      Number(product.inventoryCount || 0) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    specifications: product.specifications || [],
    ...ratingFields,
  };
};

const getSlugAvailability = asyncHandler(async (req, res) => {
  const { entityType, language, excludeId } = req.query;
  if (!ENTITY_MODELS[entityType]) {
    res.status(400);
    throw new Error("entityType غير صالح");
  }
  assertLanguage(language, res);
  const slug = normalizeSlug(req.query.slug, language);
  if (!slug) {
    res.status(400);
    throw new Error("slug مطلوب");
  }
  const query = { [`translations.${language}.slug`]: slug };
  if (excludeId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(excludeId))) {
      res.status(400);
      throw new Error("excludeId غير صالح");
    }
    query._id = { $ne: excludeId };
  }
  const existing = await ENTITY_MODELS[entityType].exists(query);
  res.json({ available: !existing });
});

const getLocalizedCategory = asyncHandler(async (req, res) => {
  const { language, slug } = req.params;
  assertLanguage(language, res);
  const normalizedSlug = normalizeSlug(slug, language);
  const isObjectIdLookup = mongoose.Types.ObjectId.isValid(slug);
  const cacheKey = `category:${language}:${isObjectIdLookup ? slug : normalizedSlug}:${req.originalUrl}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const categoryQuery = isObjectIdLookup
    ? { _id: slug }
    : { [`translations.${language}.slug`]: normalizedSlug };
  const category = await Category.findOne(categoryQuery).lean();
  if (!category || !hasPublicLocalizedValue(category, language)) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }
  const setting = await findActiveSettingForCategory(category._id);
  if (!setting) {
    res.status(404);
    throw new Error("الفئة غير مفعلة في الموقع");
  }

  const imageUrl = getEntityImageUrl(req, "category", category);
  const response = {
    data: {
      id: category._id,
      name: getLocalizedName(category, language),
      description: getLocalized(category, language).description,
      slug: getLocalizedSlug(category, language),
      imageUrl,
      imageAlt: getLocalized(category, language).imageAlt,
      products: [],
      pagination: buildPaginationMetadata({ page: 1, limit: 0 || 1, totalItems: 0 }),
    },
    seo: buildSeo({ entity: category, entityType: "category", language, imageUrl }),
  };
  response.data.pagination.limit = 0;
  cacheSet(cacheKey, response);
  res.json(response);
});

const getLocalizedCategoryProducts = asyncHandler(async (req, res) => {
  const { language, slug } = req.params;
  assertLanguage(language, res);
  const normalizedSlug = normalizeSlug(slug, language);
  const isObjectIdLookup = mongoose.Types.ObjectId.isValid(slug);
  const { page, limit, skip } = getPaginationParams(req.query);

  const categoryQuery = isObjectIdLookup
    ? { _id: slug }
    : { [`translations.${language}.slug`]: normalizedSlug };
  const category = await Category.findOne(categoryQuery).lean();
  if (!category || !hasPublicLocalizedValue(category, language)) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }
  const setting = await findActiveSettingForCategory(category._id);
  if (!setting) {
    res.status(404);
    throw new Error("الفئة غير مفعلة في الموقع");
  }

  const products = await Product.find({ category: category._id })
    .select(PRODUCT_PUBLIC_FIELDS)
    .populate("category", "name image translations seo")
    .sort(parseSort(req.query.sort))
    .lean();
  const localizedProducts = products.filter((product) => hasPublicLocalizedValue(product, language) && productMatchesFilters(product, req.query));
  const totalItems = localizedProducts.length;
  const currency = await getCurrency();
  const response = {
    data: {
      id: category._id,
      name: getLocalizedName(category, language),
      description: getLocalized(category, language).description,
      slug: getLocalizedSlug(category, language),
      imageUrl: getEntityImageUrl(req, "category", category),
      imageAlt: getLocalized(category, language).imageAlt,
      products: localizedProducts.slice(skip, skip + limit).map((product) => serializeProduct(req, product, language, currency)),
      pagination: buildPaginationMetadata({ page, limit, totalItems }),
    },
    seo: buildSeo({
      entity: category,
      entityType: "category",
      language,
      imageUrl: getEntityImageUrl(req, "category", category),
    }),
  };
  res.json(response);
});

const getLocalizedProduct = asyncHandler(async (req, res) => {
  const { language, slug } = req.params;
  assertLanguage(language, res);
  const normalizedSlug = normalizeSlug(slug, language);
  const isObjectIdLookup = mongoose.Types.ObjectId.isValid(slug);
  const cacheKey = `product:${language}:${isObjectIdLookup ? slug : normalizedSlug}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const productQuery = isObjectIdLookup
    ? { _id: slug }
    : { [`translations.${language}.slug`]: normalizedSlug };
  const product = await Product.findOne(productQuery)
    .select(PRODUCT_PUBLIC_FIELDS)
    .populate("category", "name image translations seo")
    .lean();
  if (!product || !hasPublicLocalizedValue(product, language)) {
    res.status(404);
    throw new Error("المنتج غير موجود");
  }
  const setting = await findActiveSettingForCategory(product.category?._id);
  if (!setting || !hasObjectId(setting.selectedProducts || [], product._id)) {
    res.status(404);
    throw new Error("المنتج غير متاح في الموقع");
  }
  const currency = await getCurrency();
  const imageUrl = getEntityImageUrl(req, "product", product);
  const response = {
    data: serializeProduct(req, product, language, currency),
    seo: buildSeo({ entity: product, entityType: "product", language, imageUrl }),
  };
  response.seo.structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: response.data.name,
      sku: product.code,
      image: imageUrl ? [imageUrl] : undefined,
      description: response.seo.description || undefined,
      offers: {
        "@type": "Offer",
        priceCurrency: currency,
        price: response.data.finalVisiblePrice,
        availability: response.data.availability,
        url: response.seo.canonicalUrl,
      },
    },
  ];
  cacheSet(cacheKey, response);
  res.json(response);
});

const searchLocalizedProducts = asyncHandler(async (req, res) => {
  const { language } = req.params;
  assertLanguage(language, res);
  const searchTerm = String(req.query.q ?? req.query.search ?? "").trim();
  if (!searchTerm) {
    res.status(400);
    throw new Error("مطلوب معامل البحث q");
  }
  const { page, limit, skip } = getPaginationParams(req.query);
  const activeProductIds = await getActiveProductIds();
  if (activeProductIds.length === 0) {
    return res.json({ success: true, products: [], pagination: buildPaginationMetadata({ page, limit, totalItems: 0 }) });
  }
  const regex = new RegExp(escapeRegex(searchTerm), "i");
  const searchFields =
    language === "ar"
      ? [{ "translations.ar.name": regex }, { "translations.ar.description": regex }, { name: regex }, { code: regex }]
      : [{ "translations.en.name": regex }, { "translations.en.description": regex }, { code: regex }];
  const products = await Product.find({ _id: { $in: activeProductIds }, $or: searchFields })
    .select(PRODUCT_PUBLIC_FIELDS)
    .populate("category", "name image translations seo")
    .lean();
  const localizedProducts = products.filter((product) => hasTranslation(product, language));
  const currency = await getCurrency();
  const totalItems = localizedProducts.length;
  res.json({
    success: true,
    products: localizedProducts.slice(skip, skip + limit).map((product) => serializeProduct(req, product, language, currency)),
    pagination: buildPaginationMetadata({ page, limit, totalItems }),
  });
});

const resolveSlugAlias = asyncHandler(async (req, res) => {
  const { entityType, language, slug } = req.params;
  if (!ENTITY_MODELS[entityType]) {
    res.status(400);
    throw new Error("entityType غير صالح");
  }
  assertLanguage(language, res);
  const normalizedSlug = normalizeSlug(slug, language);
  const entity = await ENTITY_MODELS[entityType].findOne({
    slugAliases: { $elemMatch: { language, slug: normalizedSlug } },
  }).lean();
  if (!entity || !hasTranslation(entity, language)) {
    res.status(404);
    throw new Error("slug غير موجود");
  }
  if (entityType === "category") {
    const setting = await findActiveSettingForCategory(entity._id);
    if (!setting) {
      res.status(404);
      throw new Error("الفئة غير متاحة");
    }
  } else {
    const activeProductIds = await getActiveProductIds();
    if (!activeProductIds.includes(String(entity._id))) {
      res.status(404);
      throw new Error("المنتج غير متاح");
    }
  }
  res.json({
    redirect: true,
    statusCode: 301,
    location: localizedUrl(entityType, language, getLocalized(entity, language).slug),
  });
});

const sitemapRowsFor = async (entityType, req) => {
  if (entityType === "category") {
    const settings = await EcommerceSetting.find({ showOnWebsite: true }).select("category").lean();
    const ids = settings.map((setting) => setting.category);
    const categories = await Category.find({
      _id: { $in: ids },
      "seo.robotsIndex": { $ne: false },
      "seo.includeInSitemap": { $ne: false },
    }).lean();
    return categories.flatMap((category) =>
      LANGUAGES.flatMap((language) => {
        const slug = category.translations?.[language]?.slug;
        if (!slug || !hasTranslation(category, language)) return [];
        return [{
          loc: localizedUrl("category", language, slug),
          lastmod: category.updatedAt?.toISOString(),
          changefreq: category.seo?.sitemapChangeFrequency || "weekly",
          priority: category.seo?.sitemapPriority ?? 0.7,
          alternates: alternates(category, "category"),
          image: category.image ? { loc: getEntityImageUrl(req, "category", category), title: getLocalizedName(category, language) } : undefined,
        }];
      })
    );
  }

  const activeProductIds = await getActiveProductIds();
  const products = await Product.find({
    _id: { $in: activeProductIds },
    "seo.robotsIndex": { $ne: false },
    "seo.includeInSitemap": { $ne: false },
  }).lean();
  return products.flatMap((product) =>
    LANGUAGES.flatMap((language) => {
      const slug = product.translations?.[language]?.slug;
      if (!slug || !hasTranslation(product, language)) return [];
      return [{
        loc: localizedUrl("product", language, slug),
        lastmod: product.updatedAt?.toISOString(),
        changefreq: product.seo?.sitemapChangeFrequency || "weekly",
        priority: product.seo?.sitemapPriority ?? 0.8,
        alternates: alternates(product, "product"),
        image: product.image ? { loc: getEntityImageUrl(req, "product", product), title: getLocalizedName(product, language) } : undefined,
      }];
    })
  );
};

const paginateRows = (rows, req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  res.set("Cache-Control", "public, max-age=300");
  res.json({ data: rows.slice(skip, skip + limit), pagination: buildPaginationMetadata({ page, limit, totalItems: rows.length }) });
};

const getSitemapPages = asyncHandler(async (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ data: [{ loc: getWebsiteOrigin(), lastmod: undefined, alternates: { ar: `${getWebsiteOrigin()}/ar`, en: `${getWebsiteOrigin()}/en` } }] });
});

const getSitemapCategories = asyncHandler(async (req, res) => paginateRows(await sitemapRowsFor("category", req), req, res));
const getSitemapProducts = asyncHandler(async (req, res) => paginateRows(await sitemapRowsFor("product", req), req, res));
const getSitemapImages = asyncHandler(async (req, res) => {
  const rows = [...(await sitemapRowsFor("category", req)), ...(await sitemapRowsFor("product", req))]
    .filter((row) => row.image)
    .map((row) => ({ loc: row.loc, lastmod: row.lastmod, alternates: row.alternates, image: row.image }));
  paginateRows(rows, req, res);
});

const getCategoryImage = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id).select("image").lean();
  sendBase64Image(category, res, "صورة الفئة غير موجودة");
});

const getProductImage = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).select("image").lean();
  sendBase64Image(product, res, "صورة المنتج غير موجودة");
});

module.exports = {
  getSlugAvailability,
  getLocalizedCategory,
  getLocalizedCategoryProducts,
  getLocalizedProduct,
  searchLocalizedProducts,
  resolveSlugAlias,
  getSitemapPages,
  getSitemapCategories,
  getSitemapProducts,
  getSitemapImages,
  getCategoryImage,
  getProductImage,
};
