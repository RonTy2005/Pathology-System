const express = require("express");
const cors = require("cors");
const path = require("path");
const { appRoot } = require("./config/paths");

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
const { settingsRouter } = require("./routes/settingsRoutes");
const { patientPortalRouter } = require("./routes/patientPortalRoutes");
const { authRequired, requireActiveSubscription } = require("./middleware/auth");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.static(path.join(appRoot, "frontend")));
  app.use("/vendor/pdfjs", express.static(path.join(appRoot, "node_modules", "pdfjs-dist", "build")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "lab-lms" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/patient-reports", requireActiveSubscription, patientPortalRouter);
  app.use("/api/users", authRequired, requireActiveSubscription, userRouter);
  app.use("/api/doctors", authRequired, requireActiveSubscription, doctorRouter);
  app.use("/api/associates", authRequired, requireActiveSubscription, associateRouter);
  app.use("/api/tests", authRequired, requireActiveSubscription, testRouter);
  app.use("/api/visits", authRequired, requireActiveSubscription, visitRouter);
  app.use("/api/patients", authRequired, requireActiveSubscription, patientRouter);
  app.use("/api/accounts", authRequired, requireActiveSubscription, accountRouter);
  app.use("/api/salaries", authRequired, requireActiveSubscription, salaryRouter);
  app.use("/api/dashboard", authRequired, requireActiveSubscription, dashboardRouter);
  app.use("/api/backup", authRequired, requireActiveSubscription, backupRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
      message: err.message || "Unexpected server error",
    });
  });

  return app;
}

module.exports = { createApp };
