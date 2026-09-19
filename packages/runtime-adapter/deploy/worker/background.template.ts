// Community background worker entry template.
// Copy next to background.template.jsonc, point `main` at this file, and deploy.
import { createBackgroundWorker } from "@zilobase/runtime-adapter/worker";

const background = createBackgroundWorker();

export default {
  queue: background.queue,
  scheduled: background.scheduled,
};
