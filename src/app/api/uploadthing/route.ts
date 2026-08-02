import { createRouteHandler } from "uploadthing/next";
import { uploadRouter } from "./uploadthing";

export const { GET, POST } = createRouteHandler({
  router: uploadRouter,
});
