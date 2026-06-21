const mongoose = require("mongoose");
const isBase64Image = require("../utils/isBase64Image");

const websiteImageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [200, "يجب ألا يزيد عنوان صورة الموقع عن 200 حرف"],
      default: "",
    },
    imageBase64: {
      type: String,
      required: [true, "صورة الموقع مطلوبة"],
      trim: true,
      validate: {
        validator: isBase64Image,
        message: "يجب أن تكون صورة الموقع سلسلة base64 صالحة (خام أو بصيغة data URI)",
      },
    },
    targetType: {
      type: String,
      required: [true, "نوع استهداف صورة الموقع مطلوب"],
      enum: {
        values: ["category", "product", "both", "price"],
        message: "نوع الاستهداف يجب أن يكون category أو product أو both أو price",
      },
    },
    categoryIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      default: [],
    },
    productIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
      ],
      default: [],
    },
    maxPrice: {
      type: Number,
      min: [0, "الحد الأقصى للسعر لا يمكن أن يكون سالبًا"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

websiteImageSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model("WebsiteImage", websiteImageSchema);
