import { startMarketingDashboardServer } from "./server.js";

const port = Number(process.env.PORT || 3000);

startMarketingDashboardServer({ port }).then(() => {
  process.stdout.write(`Referral marketing dashboard listening on http://localhost:${port}\n`);
});
