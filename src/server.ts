import { app } from "./app.js";
import { env } from "./config/env.js";
import { startNotificationScheduler } from "./modules/notification/notification.scheduler.js";

startNotificationScheduler();

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
