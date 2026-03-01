const mongoose = require("mongoose");
const isBase64Image = require("../utils/isBase64Image");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "اسم المنتج مطلوب"],
      trim: true,
      maxlength: [200, "يجب ألا يزيد اسم المنتج عن 200 حرف"],
    },
    code: {
      type: String,
      required: [true, "كود المنتج مطلوب"],
      trim: true,
      maxlength: [100, "يجب ألا يزيد كود المنتج عن 100 حرف"],
    },
    inventoryCount: {
      type: Number,
      required: [true, "عدد المنتج في المخزون مطلوب"],
      min: [0, "عدد المخزون لا يمكن أن يكون سالبًا"],
    },
    image: {
      type: String,
      required: [true, "صورة المنتج مطلوبة"],
      trim: true,
      validate: {
        validator: isBase64Image,
        message:
          "يجب أن تكون صورة المنتج سلسلة base64 صالحة (خام أو بصيغة data URI)",
      },
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "معرّف الفئة مطلوب"],
    },
    wholesalePrice: {
      type: Number,
      required: [true, "سعر الجملة مطلوب"],
      min: [0, "سعر الجملة لا يمكن أن يكون سالبًا"],
    },
    retailPrice: {
      type: Number,
      required: [true, "سعر التجزئة مطلوب"],
      min: [0, "سعر التجزئة لا يمكن أن يكون سالبًا"],
      validate: {
        validator: function validateRetailPrice(value) {
          return value >= this.wholesalePrice;
        },
        message: "يجب أن يكون سعر التجزئة أكبر من أو يساوي سعر الجملة",
      },
    },
    soldItemCount: {
      type: Number,
      default: 0,
      min: [0, "عدد العناصر المباعة لا يمكن أن يكون سالبًا"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
