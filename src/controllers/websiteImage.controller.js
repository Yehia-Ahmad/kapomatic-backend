const mongoose = require("mongoose");
const Category = require("../models/category.model");
const Product = require("../models/product.model");
const WebsiteImage = require("../models/websiteImage.model");
const asyncHandler = require("../utils/asyncHandler");
const isBase64Image = require("../utils/isBase64Image");
const { withProductPriceAfterDiscount } = require("../utils/productPricing");

const TARGET_TYPES = new Set(["category", "product", "both", "price", "specification"]);

const populateWebsiteImages = (query) =>
  query
    .populate("categoryIds", "name image specifications")
    .populate(
      "productIds",
      "name code image category retailPrice wholesalePrice purchasePrice discountPercentage inventoryCount specifications"
    );

// The combined storefront response already includes full resolved products.
// Keep target references compact to avoid returning the same base64 images twice.
const populateCompactWebsiteImageTargets = (query) =>
  query
    .populate("categoryIds", "name")
    .populate("productIds", "name code category retailPrice discountPercentage");

const withPricingForWebsiteImage = (websiteImage) => {
  const imageObject =
    typeof websiteImage.toObject === "function" ? websiteImage.toObject() : websiteImage;

  return {
    ...imageObject,
    productIds: (imageObject.productIds || []).map(withProductPriceAfterDiscount),
  };
};

const ensureObjectId = (value, fieldLabel, res) => {
  if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
    res.status(400);
    throw new Error(`تنسيق ${fieldLabel} غير صالح`);
  }

  return value;
};

const normalizeObjectIdList = (value, fieldLabel, res) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    res.status(400);
    throw new Error(`يجب أن تكون قيمة ${fieldLabel} قائمة`);
  }

  const uniqueIds = [];
  const seenIds = new Set();

  value.forEach((item, index) => {
    const id = ensureObjectId(String(item), `${fieldLabel}[${index}]`, res);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      uniqueIds.push(id);
    }
  });

  return uniqueIds;
};

const normalizeTargetType = (value, res) => {
  if (typeof value !== "string" || !value.trim()) {
    res.status(400);
    throw new Error("نوع استهداف صورة الموقع مطلوب");
  }

  const targetType = value.trim().toLowerCase();
  if (!TARGET_TYPES.has(targetType)) {
    res.status(400);
    throw new Error("نوع الاستهداف يجب أن يكون category أو product أو both أو price أو specification");
  }

  return targetType;
};

const normalizeBoolean = (value, fieldLabel, res) => {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;

  res.status(400);
  throw new Error(`${fieldLabel} يجب أن يكون true أو false`);
};

const normalizeMaxPrice = (value, res) => {
  const maxPrice = Number(value);
  if (!Number.isFinite(maxPrice) || maxPrice < 0) {
    res.status(400);
    throw new Error("الحد الأقصى للسعر يجب أن يكون رقمًا غير سالب");
  }

  return Number(maxPrice.toFixed(2));
};

const normalizeSpecificationName = (value, res, index = null) => {
  if (typeof value !== "string" || !value.trim()) {
    res.status(400);
    throw new Error(
      index === null
        ? "اسم الخاصية مطلوب"
        : `اسم الخاصية مطلوب في الفلتر رقم ${index + 1}`
    );
  }

  return value.trim();
};

const normalizeSpecificationValue = (value, res, filterIndex = null) => {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim())
  ) {
    res.status(400);
    throw new Error(
      filterIndex === null
        ? "قيمة الخاصية مطلوبة"
        : `قيمة الخاصية مطلوبة في الفلتر رقم ${filterIndex + 1}`
    );
  }

  return typeof value === "string" ? value.trim() : value;
};

const getSpecificationName = (specification) => {
  if (!specification || typeof specification !== "object") return "";
  return String(
    specification.name ?? specification.title ?? specification.key ?? specification.label ?? ""
  ).trim();
};

const getSpecificationValue = (specification) => {
  if (!specification || typeof specification !== "object") return undefined;
  return specification.value ?? specification.values;
};

const normalizeComparableValue = (value) =>
  String(value && typeof value === "object" ? JSON.stringify(value) : value)
    .trim()
    .toLowerCase();

const normalizeSpecificationFilters = (value, res) => {
  if (!Array.isArray(value) || value.length === 0) {
    res.status(400);
    throw new Error("يجب تحديد خاصية واحدة على الأقل عند استخدام استهداف specification");
  }

  const filtersByName = new Map();

  value.forEach((filter, index) => {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      res.status(400);
      throw new Error(`فلتر الخاصية رقم ${index + 1} غير صالح`);
    }

    const specificationName = normalizeSpecificationName(
      filter.specificationName ?? filter.specificationType ?? filter.specification ?? filter.name,
      res,
      index
    );
    const rawValues = filter.values ?? filter.value ?? filter.specificationValue;
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues]).map((item) =>
      normalizeSpecificationValue(item, res, index)
    );
    const key = normalizeComparableValue(specificationName);
    const existing = filtersByName.get(key) || {
      specificationName,
      values: new Map(),
    };

    values.forEach((item) => existing.values.set(normalizeComparableValue(item), item));
    filtersByName.set(key, existing);
  });

  return [...filtersByName.values()].map((filter) => ({
    specificationName: filter.specificationName,
    values: [...filter.values.values()],
  }));
};

const productMatchesSpecificationFilters = (product, filters) =>
  filters.every((filter) => {
    const normalizedName = normalizeComparableValue(filter.specificationName);
    const selectedValues = new Set(filter.values.map(normalizeComparableValue));

    return (product.specifications || []).some((specification) => {
      if (normalizeComparableValue(getSpecificationName(specification)) !== normalizedName) {
        return false;
      }

      const value = getSpecificationValue(specification);
      const values = Array.isArray(value) ? value : [value];
      return values.some((item) => selectedValues.has(normalizeComparableValue(item)));
    });
  });

const serializeUniqueValue = (value) =>
  value && typeof value === "object" ? JSON.stringify(value) : String(value);

const buildCategorySpecificationFilters = (categorySpecifications, products) => {
  const valuesByName = new Map();

  products.forEach((product) => {
    (product.specifications || []).forEach((specification) => {
      const name = getSpecificationName(specification);
      if (!name) return;

      const key = normalizeComparableValue(name);
      const value = getSpecificationValue(specification);
      const values = Array.isArray(value) ? value : [value];
      if (!valuesByName.has(key)) valuesByName.set(key, new Map());

      values.forEach((item) => {
        if (item === undefined || item === null || item === "") return;
        valuesByName.get(key).set(serializeUniqueValue(item), item);
      });
    });
  });

  return (categorySpecifications || []).map((specification) => ({
    ...specification,
    values: [
      ...(valuesByName.get(normalizeComparableValue(getSpecificationName(specification)))
        ?.values() || []),
    ],
  }));
};

const getReferenceIds = (references = []) =>
  references.map((reference) => (reference?._id || reference).toString());

const buildWebsiteImageInput = (body, res, current = null) => {
  const targetType = normalizeTargetType(body.targetType ?? current?.targetType, res);
  const targetTypeChanged = current && targetType !== current.targetType;
  const imageBase64 = body.imageBase64 ?? body.image ?? current?.imageBase64;

  if (typeof imageBase64 !== "string" || !isBase64Image(imageBase64)) {
    res.status(400);
    throw new Error("يجب أن تكون صورة الموقع سلسلة base64 صالحة (خام أو بصيغة data URI)");
  }

  if (body.title !== undefined && typeof body.title !== "string") {
    res.status(400);
    throw new Error("عنوان صورة الموقع غير صالح");
  }

  const categoryIds = normalizeObjectIdList(
    body.categoryIds !== undefined
      ? body.categoryIds
      : targetTypeChanged
        ? []
        : getReferenceIds(current?.categoryIds),
    "categoryIds",
    res
  );
  const productIds = normalizeObjectIdList(
    body.productIds !== undefined
      ? body.productIds
      : targetTypeChanged
        ? []
        : getReferenceIds(current?.productIds),
    "productIds",
    res
  );
  let maxPrice =
    body.maxPrice !== undefined
      ? normalizeMaxPrice(body.maxPrice, res)
      : targetTypeChanged
        ? null
        : current?.maxPrice;
  let specificationFilters =
    body.specificationFilters !== undefined || body.specifications !== undefined
      ? normalizeSpecificationFilters(
          body.specificationFilters ?? body.specifications,
          res
        )
      : targetTypeChanged
        ? []
        : current?.specificationFilters || [];

  if (targetType === "category") {
    if (categoryIds.length === 0) {
      res.status(400);
      throw new Error("يجب تحديد فئة واحدة على الأقل عند استخدام استهداف category");
    }
    productIds.length = 0;
    maxPrice = null;
  }

  if (targetType === "product") {
    if (productIds.length === 0) {
      res.status(400);
      throw new Error("يجب تحديد منتج واحد على الأقل عند استخدام استهداف product");
    }
    categoryIds.length = 0;
    maxPrice = null;
  }

  if (targetType === "both") {
    if (categoryIds.length === 0 || productIds.length === 0) {
      res.status(400);
      throw new Error("يجب تحديد فئة واحدة ومنتج واحد على الأقل عند استخدام استهداف both");
    }
    maxPrice = null;
  }

  if (targetType === "price") {
    if (maxPrice === undefined || maxPrice === null) {
      res.status(400);
      throw new Error("الحد الأقصى للسعر مطلوب عند استخدام استهداف price");
    }
    productIds.length = 0;
  }

  if (targetType === "specification") {
    if (categoryIds.length === 0) {
      res.status(400);
      throw new Error("يجب تحديد فئة واحدة على الأقل عند استخدام استهداف specification");
    }
    specificationFilters = normalizeSpecificationFilters(specificationFilters, res);
    productIds.length = 0;
    maxPrice = null;
  } else {
    specificationFilters = [];
  }

  return {
    title: body.title !== undefined ? body.title.trim() : current?.title || "",
    imageBase64: imageBase64.trim(),
    targetType,
    categoryIds,
    productIds,
    maxPrice,
    specificationFilters,
    isActive:
      body.isActive !== undefined
        ? normalizeBoolean(body.isActive, "isActive", res)
        : current?.isActive ?? true,
  };
};

const validateReferencesExist = async ({ categoryIds, productIds }, res) => {
  const [categoryCount, productCount] = await Promise.all([
    categoryIds.length > 0
      ? Category.countDocuments({ _id: { $in: categoryIds } })
      : 0,
    productIds.length > 0
      ? Product.countDocuments({ _id: { $in: productIds } })
      : 0,
  ]);

  if (categoryCount !== categoryIds.length) {
    res.status(400);
    throw new Error("واحدة أو أكثر من الفئات المحددة غير موجودة");
  }

  if (productCount !== productIds.length) {
    res.status(400);
    throw new Error("واحد أو أكثر من المنتجات المحددة غير موجود");
  }
};

const resolveWebsiteImageProducts = async (websiteImage) => {
  let productQuery;

  if (websiteImage.targetType === "product" || websiteImage.targetType === "both") {
    productQuery = { _id: { $in: getReferenceIds(websiteImage.productIds) } };
  } else if (websiteImage.targetType === "price") {
    productQuery = { retailPrice: { $lte: websiteImage.maxPrice } };
    const categoryIds = getReferenceIds(websiteImage.categoryIds);
    if (categoryIds.length > 0) productQuery.category = { $in: categoryIds };
  } else if (websiteImage.targetType === "specification") {
    const categoryIds = getReferenceIds(websiteImage.categoryIds);
    const matchingProductIds = (
      await Product.find({ category: { $in: categoryIds } })
        .select("_id specifications")
        .lean()
    )
      .filter((product) =>
        productMatchesSpecificationFilters(
          product,
          websiteImage.specificationFilters || []
        )
      )
      .map((product) => product._id);

    if (matchingProductIds.length === 0) return [];
    productQuery = { _id: { $in: matchingProductIds } };
  } else {
    return [];
  }

  const products = await Product.find(productQuery)
    .populate("category", "name image")
    .sort({ createdAt: -1 })
    .lean();

  return [
    ...new Map(
      products.map((product) => {
        const pricedProduct = withProductPriceAfterDiscount(product);
        return [product._id.toString(), pricedProduct];
      })
    ).values(),
  ];
};

const getWebsiteImageSpecifications = asyncHandler(async (req, res) => {
  const rawCategoryIds = req.query.categoryIds ?? req.query.categoryId;
  const categoryIds = normalizeObjectIdList(
    (Array.isArray(rawCategoryIds) ? rawCategoryIds : [rawCategoryIds])
      .filter((value) => value !== undefined)
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean),
    "categoryIds",
    res
  );

  if (categoryIds.length === 0) {
    res.status(400);
    throw new Error("يجب تحديد فئة واحدة على الأقل");
  }

  const [categories, products] = await Promise.all([
    Category.find({ _id: { $in: categoryIds } })
      .select("name specifications")
      .lean(),
    Product.find({ category: { $in: categoryIds } })
      .select("category specifications")
      .lean(),
  ]);

  if (categories.length !== categoryIds.length) {
    res.status(400);
    throw new Error("واحدة أو أكثر من الفئات المحددة غير موجودة");
  }

  const productsByCategoryId = products.reduce((grouped, product) => {
    const categoryId = product.category.toString();
    if (!grouped.has(categoryId)) grouped.set(categoryId, []);
    grouped.get(categoryId).push(product);
    return grouped;
  }, new Map());
  const categoriesById = new Map(
    categories.map((category) => [category._id.toString(), category])
  );

  res.json(
    categoryIds.map((categoryId) => {
      const category = categoriesById.get(categoryId);
      return {
        _id: category._id,
        name: category.name,
        specifications: buildCategorySpecificationFilters(
          category.specifications,
          productsByCategoryId.get(categoryId) || []
        ),
      };
    })
  );
});

const toWebsiteImageWithAssetUrl = (websiteImage, resolvedProducts) => {
  const { imageBase64: _imageBase64, ...imageWithoutEmbeddedAsset } = websiteImage;

  return {
    ...imageWithoutEmbeddedAsset,
    productIds: (imageWithoutEmbeddedAsset.productIds || []).map(
      withProductPriceAfterDiscount
    ),
    imageUrl: `/api/website-images/${websiteImage._id}/image`,
    resolvedProducts,
  };
};

const createWebsiteImage = asyncHandler(async (req, res) => {
  const input = buildWebsiteImageInput(req.body, res);
  await validateReferencesExist(input, res);

  const websiteImage = await WebsiteImage.create(input);
  await websiteImage.populate("categoryIds", "name image specifications");
  await websiteImage.populate(
    "productIds",
    "name code image category retailPrice wholesalePrice purchasePrice discountPercentage inventoryCount specifications"
  );

  res.status(201).json(withPricingForWebsiteImage(websiteImage));
});

const getWebsiteImages = asyncHandler(async (req, res) => {
  const websiteImages = await populateWebsiteImages(
    WebsiteImage.find().sort({ createdAt: -1 })
  );
  res.json(websiteImages.map(withPricingForWebsiteImage));
});

const getActiveWebsiteImages = asyncHandler(async (req, res) => {
  const websiteImages = await populateWebsiteImages(
    WebsiteImage.find({ isActive: true }).sort({ createdAt: -1 })
  );
  res.json(websiteImages.map(withPricingForWebsiteImage));
});

const getActiveWebsiteImagesWithProducts = asyncHandler(async (req, res) => {
  const websiteImages = await populateCompactWebsiteImageTargets(
    WebsiteImage.find({ isActive: true }).sort({ createdAt: -1 })
  ).lean();

  res.set("Cache-Control", "no-store");
  if (websiteImages.length === 0) {
    return res.json([]);
  }

  const resolvedProducts = await Promise.all(
    websiteImages.map((websiteImage) => resolveWebsiteImageProducts(websiteImage))
  );

  res.json(
    websiteImages.map((websiteImage, index) =>
      toWebsiteImageWithAssetUrl(websiteImage, resolvedProducts[index])
    )
  );
});

const getWebsiteImageAsset = asyncHandler(async (req, res) => {
  const id = ensureObjectId(req.params.id, "معرّف صورة الموقع", res);
  const websiteImage = await WebsiteImage.findById(id).select("imageBase64").lean();

  if (!websiteImage) {
    res.status(404);
    throw new Error("صورة الموقع غير موجودة");
  }

  const dataUriMatch = websiteImage.imageBase64.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
  );
  const contentType = dataUriMatch?.[1] || "image/png";
  const base64Data = dataUriMatch?.[2] || websiteImage.imageBase64;
  const imageBuffer = Buffer.from(base64Data.replace(/\s+/g, ""), "base64");

  res.set("Content-Type", contentType);
  res.set("Cache-Control", "public, max-age=3600");
  res.send(imageBuffer);
});

const getWebsiteImageById = asyncHandler(async (req, res) => {
  const id = ensureObjectId(req.params.id, "معرّف صورة الموقع", res);
  const websiteImage = await populateWebsiteImages(WebsiteImage.findById(id));

  if (!websiteImage) {
    res.status(404);
    throw new Error("صورة الموقع غير موجودة");
  }

  res.json(withPricingForWebsiteImage(websiteImage));
});

const getWebsiteImageProducts = asyncHandler(async (req, res) => {
  const id = ensureObjectId(req.params.id, "معرّف صورة الموقع", res);
  const websiteImage = await WebsiteImage.findById(id).lean();

  if (!websiteImage) {
    res.status(404);
    throw new Error("صورة الموقع غير موجودة");
  }

  res.json(await resolveWebsiteImageProducts(websiteImage));
});

const updateWebsiteImage = asyncHandler(async (req, res) => {
  const id = ensureObjectId(req.params.id, "معرّف صورة الموقع", res);
  const websiteImage = await WebsiteImage.findById(id);

  if (!websiteImage) {
    res.status(404);
    throw new Error("صورة الموقع غير موجودة");
  }

  const input = buildWebsiteImageInput(req.body, res, websiteImage);
  await validateReferencesExist(input, res);
  Object.assign(websiteImage, input);
  await websiteImage.save();
  await websiteImage.populate("categoryIds", "name image specifications");
  await websiteImage.populate(
    "productIds",
    "name code image category retailPrice wholesalePrice purchasePrice discountPercentage inventoryCount specifications"
  );

  res.json(withPricingForWebsiteImage(websiteImage));
});

const deleteWebsiteImage = asyncHandler(async (req, res) => {
  const id = ensureObjectId(req.params.id, "معرّف صورة الموقع", res);
  const websiteImage = await WebsiteImage.findByIdAndDelete(id);

  if (!websiteImage) {
    res.status(404);
    throw new Error("صورة الموقع غير موجودة");
  }

  res.json({ message: "Website image deleted successfully" });
});

module.exports = {
  createWebsiteImage,
  getWebsiteImages,
  getActiveWebsiteImages,
  getActiveWebsiteImagesWithProducts,
  getWebsiteImageSpecifications,
  getWebsiteImageAsset,
  getWebsiteImageById,
  getWebsiteImageProducts,
  updateWebsiteImage,
  deleteWebsiteImage,
};
