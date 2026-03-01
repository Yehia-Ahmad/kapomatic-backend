const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || "خطأ داخلي في الخادم";

  if (err.name === "CastError") {
    statusCode = 400;
    message = "تنسيق المعرّف غير صالح";
  }

  if (err.code === 11000) {
    statusCode = 400;
    message = "تم إدخال قيمة مكررة";
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((value) => value.message)
      .join(", ");
  }

  res.status(statusCode).json({ message });
};

module.exports = errorHandler;
