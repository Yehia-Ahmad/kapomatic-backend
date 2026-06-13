const mongoose = require("mongoose");
const Category = require("../models/category.model");
const EcommerceSetting = require("../models/ecommerceSetting.model");
const Product = require("../models/product.model");
const asyncHandler = require("../utils/asyncHandler");

const ECOMMERCE_PRODUCT_FIELDS =
  "name code image retailPrice wholesalePrice inventoryCount category specifications";

const populateSetting = (query) =>
  query
    .populate("category", "name image")
    .populate("selectedProducts", ECOMMERCE_PRODUCT_FIELDS)
    .populate("filters.products", ECOMMERCE_PRODUCT_FIELDS);

const populateSettingDocument = async (setting) => {
  await setting.populate("category", "name image");
  await setting.populate(
    "selectedProducts",
    ECOMMERCE_PRODUCT_FIELDS
  );
  await setting.populate(
    "filters.products",
    ECOMMERCE_PRODUCT_FIELDS
  );
  return setting;
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

const serializeUniqueValue = (value) =>
  value && typeof value === "object" ? JSON.stringify(value) : String(value);

const toArray = (value) => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizeObjectIdsToStrings = (ids = []) => ids.map((id) => id.toString());

const getProductSpecificationValues = (product, specificationName) => {
  const normalizedSpecificationName = normalizeComparableValue(specificationName);

  return (product.specifications || []).flatMap((specification) => {
    if (
      normalizeComparableValue(getSpecificationName(specification)) !== normalizedSpecificationName
    ) {
      return [];
    }

    const value = getSpecificationValue(specification);
    return Array.isArray(value) ? value : [value];
  });
};

const parseSpecificationSearchFilters = (query, res) => {
  const names = toArray(query.specification ?? query.specificationName ?? query.name);
  const values = toArray(query.value);

  if (names.length === 0 && values.length === 0) return [];

  if (names.length === 0 || values.length === 0 || names.length !== values.length) {
    res.status(400);
    throw new Error("يجب إرسال specification و value بنفس العدد");
  }

  return names.map((name, index) => {
    const specificationName = String(name).trim();
    const value = String(values[index]).trim();

    if (!specificationName || !value) {
      res.status(400);
      throw new Error("قيم specification و value مطلوبة");
    }

    return { specificationName, value };
  });
};

const productMatchesSpecificationSearchFilters = (product, filters) =>
  filters.every(({ specificationName, value }) => {
    const normalizedFilterValue = normalizeComparableValue(value);
    return getProductSpecificationValues(product, specificationName).some(
      (productValue) => normalizeComparableValue(productValue) === normalizedFilterValue
    );
  });

const buildCategorySpecificationFilters = (categorySpecifications = [], products = []) => {
  const valuesBySpecificationName = products.reduce((groupedValues, product) => {
    (product.specifications || []).forEach((specification) => {
      const specificationName = getSpecificationName(specification);
      if (!specificationName) return;

      const rawValue = getSpecificationValue(specification);
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];

      values.forEach((value) => {
        if (value === undefined || value === null || value === "") return;
        if (!groupedValues.has(specificationName)) groupedValues.set(specificationName, new Map());
        groupedValues.get(specificationName).set(serializeUniqueValue(value), value);
      });
    });

    return groupedValues;
  }, new Map());

  return categorySpecifications.map((specification) => {
    const specificationName = getSpecificationName(specification);
    const valuesMap = valuesBySpecificationName.get(specificationName);

    return {
      ...specification,
      values: valuesMap ? [...valuesMap.values()] : [],
    };
  });
};

const getFilterTitle = (filter) =>
  String(filter?.title ?? filter?.name ?? filter?.key ?? filter?.label ?? "").trim();

const buildFilterVisibilityByTitle = (filters = []) =>
  filters.reduce((visibilityByTitle, filter) => {
    const title = getFilterTitle(filter);
    if (title) visibilityByTitle.set(normalizeComparableValue(title), filter.isVisible);
    return visibilityByTitle;
  }, new Map());

const formatSpecificationFilterResponse = (specificationFilters = [], settingFilters = []) => {
  const visibilityByTitle = buildFilterVisibilityByTitle(settingFilters);

  return specificationFilters.map((filter) => {
    const title = getFilterTitle(filter);
    const savedVisibility = visibilityByTitle.get(normalizeComparableValue(title));

    return {
      title,
      isVisible: parseBoolean(savedVisibility, parseBoolean(filter.isVisible, true)),
      values: filter.values || [],
    };
  });
};

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "true" || normalizedValue === "1") return true;
    if (normalizedValue === "false" || normalizedValue === "0") return false;
  }

  return value === true || value === 1;
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
  const seen = new Set();

  value.forEach((item, index) => {
    const id = ensureObjectId(String(item), `${fieldLabel}[${index}]`, res);
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  });

  return uniqueIds;
};

const validateProductsBelongToCategory = async (productIds, categoryId, res) => {
  if (productIds.length === 0) return;

  const productsCount = await Product.countDocuments({
    _id: { $in: productIds },
    category: categoryId,
  });

  if (productsCount !== productIds.length) {
    res.status(400);
    throw new Error("يجب أن تكون كل المنتجات المحددة تابعة للفئة نفسها");
  }
};

const normalizeFilters = (filters, res) => {
  if (filters === undefined) return [];

  if (!Array.isArray(filters)) {
    res.status(400);
    throw new Error("يجب أن تكون قيمة filters قائمة");
  }

  return filters.map((filter, index) => {
    const title = typeof filter?.title === "string" ? filter.title.trim() : "";
    if (!title) {
      res.status(400);
      throw new Error(`عنوان عنصر الفلترة رقم ${index + 1} مطلوب`);
    }

    return {
      title,
      products: normalizeObjectIdList(filter.products, `filters[${index}].products`, res),
      isVisible: parseBoolean(filter.isVisible, true),
    };
  });
};

const buildEcommerceSettingCategories = async (activeOnly = false) => {
  const [categories, products, settings] = await Promise.all([
    Category.find().sort({ createdAt: 1 }).lean(),
    Product.find()
      .select(ECOMMERCE_PRODUCT_FIELDS)
      .sort({ createdAt: -1 })
      .lean(),
    EcommerceSetting.find(activeOnly ? { showOnWebsite: true } : {}).lean(),
  ]);

  const productsByCategory = products.reduce((groupedProducts, product) => {
    const categoryId = product.category.toString();
    if (!groupedProducts.has(categoryId)) groupedProducts.set(categoryId, []);
    groupedProducts.get(categoryId).push(product);
    return groupedProducts;
  }, new Map());
  const settingsByCategory = new Map(
    settings.map((setting) => [setting.category.toString(), setting])
  );

  return categories
    .filter((category) => !activeOnly || settingsByCategory.has(category._id.toString()))
    .map((category) => {
      const categoryId = category._id.toString();
      const setting = settingsByCategory.get(categoryId);
      const categoryProducts = productsByCategory.get(categoryId) || [];
      const specificationFilters = buildCategorySpecificationFilters(
        category.specifications || [],
        categoryProducts
      );
      const categoryWithSpecificationFilters = {
        ...category,
        specifications: specificationFilters,
        filters: specificationFilters,
      };

      return {
        category: categoryWithSpecificationFilters,
        products: categoryProducts,
        setting: setting || {
          category: category._id,
          showOnWebsite: false,
          selectedProducts: [],
          filters: [],
        },
      };
    });
};

const getEcommerceSettingCategories = asyncHandler(async (req, res) => {
  res.json(await buildEcommerceSettingCategories());
});

const getActiveEcommerceSettingCategories = asyncHandler(async (req, res) => {
  res.json(await buildEcommerceSettingCategories(true));
});

const getEcommerceCategoryFilters = asyncHandler(async (req, res) => {
  const categoryId = ensureObjectId(req.params.categoryId, "معرّف الفئة", res);
  const [category, products, setting] = await Promise.all([
    Category.findById(categoryId).lean(),
    Product.find({ category: categoryId })
      .select(ECOMMERCE_PRODUCT_FIELDS)
      .sort({ createdAt: -1 })
      .lean(),
    EcommerceSetting.findOne({ category: categoryId }).lean(),
  ]);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  const specificationFilters = buildCategorySpecificationFilters(
    category.specifications || [],
    products
  );

  res.json(formatSpecificationFilterResponse(specificationFilters, setting?.filters));
});

const getProductsByActiveEcommerceCategory = asyncHandler(async (req, res) => {
  const categoryId = ensureObjectId(req.params.categoryId, "معرّف الفئة", res);
  const specificationSearchFilters = parseSpecificationSearchFilters(req.query, res);
  const [category, setting] = await Promise.all([
    Category.findById(categoryId).lean(),
    EcommerceSetting.findOne({ category: categoryId, showOnWebsite: true }).lean(),
  ]);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  if (!setting) {
    res.status(404);
    throw new Error("الفئة غير مفعلة في إعدادات التجارة الإلكترونية");
  }

  const displayedProductIds = setting.selectedProducts || [];
  const [products, allCategoryProducts] = await Promise.all([
    displayedProductIds.length > 0
      ? Product.find({ _id: { $in: displayedProductIds }, category: categoryId })
          .select(ECOMMERCE_PRODUCT_FIELDS)
          .sort({ createdAt: -1 })
          .lean()
      : [],
    Product.find({ category: categoryId })
      .select(ECOMMERCE_PRODUCT_FIELDS)
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const specificationFilters = buildCategorySpecificationFilters(
    category.specifications || [],
    allCategoryProducts
  );
  const filteredProducts =
    specificationSearchFilters.length > 0
      ? products.filter((product) =>
          productMatchesSpecificationSearchFilters(product, specificationSearchFilters)
        )
      : products;

  res.json({
    category: {
      ...category,
      specifications: specificationFilters,
      filters: specificationFilters,
    },
    products: filteredProducts,
    setting,
  });
});

const getProductByActiveEcommerceCategory = asyncHandler(async (req, res) => {
  const categoryId = ensureObjectId(req.params.categoryId, "معرّف الفئة", res);
  const productId = ensureObjectId(req.params.productId, "معرّف المنتج", res);
  const [category, setting] = await Promise.all([
    Category.findById(categoryId).lean(),
    EcommerceSetting.findOne({ category: categoryId, showOnWebsite: true }).lean(),
  ]);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  if (!setting) {
    res.status(404);
    throw new Error("الفئة غير مفعلة في إعدادات التجارة الإلكترونية");
  }

  if (!normalizeObjectIdsToStrings(setting.selectedProducts).includes(productId)) {
    res.status(404);
    throw new Error("المنتج غير معروض داخل هذه الفئة");
  }

  const product = await Product.findOne({ _id: productId, category: categoryId })
    .select(ECOMMERCE_PRODUCT_FIELDS)
    .lean();

  if (!product) {
    res.status(404);
    throw new Error("المنتج غير موجود داخل هذه الفئة");
  }

  const specificationFilters = buildCategorySpecificationFilters(
    category.specifications || [],
    [product]
  );

  res.json({
    category: {
      ...category,
      specifications: specificationFilters,
      filters: specificationFilters,
    },
    product,
    setting,
  });
});

const getEcommerceSettings = asyncHandler(async (req, res) => {
  const settings = await populateSetting(EcommerceSetting.find().sort({ createdAt: 1 }));
  res.json(settings);
});

const getStorefrontSettings = asyncHandler(async (req, res) => {
  const settings = await populateSetting(
    EcommerceSetting.find({ showOnWebsite: true }).sort({ createdAt: 1 })
  ).lean();

  const visibleSettings = settings.map((setting) => ({
    ...setting,
    filters: (setting.filters || []).filter((filter) => filter.isVisible),
  }));

  res.json(visibleSettings);
});

const getEcommerceSettingByCategory = asyncHandler(async (req, res) => {
  const categoryId = ensureObjectId(req.params.categoryId, "معرّف الفئة", res);
  const setting = await populateSetting(EcommerceSetting.findOne({ category: categoryId }));

  if (!setting) {
    res.status(404);
    throw new Error("إعدادات الفئة غير موجودة");
  }

  res.json(setting);
});

const upsertEcommerceSetting = asyncHandler(async (req, res) => {
  const categoryId = ensureObjectId(req.params.categoryId, "معرّف الفئة", res);
  const category = await Category.findById(categoryId);

  if (!category) {
    res.status(404);
    throw new Error("الفئة غير موجودة");
  }

  const selectedProductInput =
    req.body.productIds ?? req.body.selectedProducts ?? req.body.selectedProductIds;
  const selectedProducts = normalizeObjectIdList(selectedProductInput, "productIds", res);
  const filters = normalizeFilters(req.body.filters, res);
  const filterProductIds = filters.flatMap((filter) => filter.products);
  const allProductIds = [...new Set([...selectedProducts, ...filterProductIds])];

  await validateProductsBelongToCategory(allProductIds, categoryId, res);

  const setting = await EcommerceSetting.findOneAndUpdate(
    { category: categoryId },
    {
      category: categoryId,
      showOnWebsite: parseBoolean(req.body.showOnWebsite, false),
      selectedProducts,
      filters,
    },
    { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
  );

  await populateSettingDocument(setting);
  res.json(setting);
});

const resetEcommerceSetting = asyncHandler(async (req, res) => {
  const categoryId = ensureObjectId(req.params.categoryId, "معرّف الفئة", res);
  const setting = await EcommerceSetting.findOneAndDelete({ category: categoryId });

  if (!setting) {
    res.status(404);
    throw new Error("إعدادات الفئة غير موجودة");
  }

  res.json({ message: "E-commerce setting reset successfully" });
});

module.exports = {
  getEcommerceSettingCategories,
  getActiveEcommerceSettingCategories,
  getEcommerceCategoryFilters,
  getProductsByActiveEcommerceCategory,
  getProductByActiveEcommerceCategory,
  getEcommerceSettings,
  getStorefrontSettings,
  getEcommerceSettingByCategory,
  upsertEcommerceSetting,
  resetEcommerceSetting,
};
