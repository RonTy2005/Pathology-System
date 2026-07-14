const express = require("express");
const cors = require("cors");
const path = require("path");

const { authRouter } = require("./routes/authRoutes");
const { userRouter } = require("./routes/userRoutes");
const { doctorRouter } = require("./routes/doctorRoutes");
const { testRouter } = require("./routes/testRoutes");
const { visitRouter } = require("./routes/visitRoutes");
const { dashboardRouter } = require("./routes/dashboardRoutes");
const { backupRouter } = require("./routes/backupRoutes");
const { associateRouter } = require("./routes/associateRoutes");
const { patientRouter } = require("./routes/patientRoutes");
const { accountRouter } = require("./routes/accountRoutes");
const { salaryRouter } = require("./routes/salaryRoutes");
const { authRequired } = require("./middleware/auth");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.static(path.join(process.cwd(), "frontend")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "lab-lms" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", authRequired, userRouter);
  app.use("/api/doctors", authRequired, doctorRouter);
  app.use("/api/associates", authRequired, associateRouter);
  app.use("/api/tests", authRequired, testRouter);
  app.use("/api/visits", authRequired, visitRouter);
  app.use("/api/patients", authRequired, patientRouter);
  app.use("/api/accounts", authRequired, accountRouter);
  app.use("/api/salaries", authRequired, salaryRouter);
  app.use("/api/dashboard", authRequired, dashboardRouter);
  app.use("/api/backup", authRequired, backupRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
      message: err.message || "Unexpected server error",
    });
  });

  return app;
}

module.exports = { createApp };
