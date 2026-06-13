const mongoose = require("mongoose");

const filterSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "عنوان عنصر الفلترة مطلوب"],
      trim: true,
      maxlength: [120, "يجب ألا يزيد عنوان عنصر الفلترة عن 120 حرف"],
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const ecommerceSettingSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "معرّف الفئة مطلوب"],
      unique: true,
    },
    showOnWebsite: {
      type: Boolean,
      default: false,
    },
    selectedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    filters: [filterSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("EcommerceSetting", ecommerceSettingSchema);
