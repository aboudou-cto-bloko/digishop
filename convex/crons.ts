import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Identifiants en ASCII (contrainte Convex)
const crons = cronJobs();
crons.interval("abandon-ventes-en-attente", { minutes: 30 }, internal.sales.abandonStale, {});
crons.interval("relance-paniers-abandonnes", { minutes: 30 }, internal.recovery.tick, {});
crons.daily("catalogue-moneroo-et-taux", { hourUTC: 5, minuteUTC: 0 }, internal.catalog.syncAll, {});
crons.daily("catalogue-saspay", { hourUTC: 5, minuteUTC: 10 }, internal.routing.syncSaspay, {});
crons.daily("purge-tracking-13-mois", { hourUTC: 3, minuteUTC: 30 }, internal.tracking.purge, {});
export default crons;
