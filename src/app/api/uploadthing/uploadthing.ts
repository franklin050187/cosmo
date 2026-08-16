import { createUploadthing } from "uploadthing/next";
import { UTApi } from "uploadthing/server";
import { decodeShipFromUrl, decodeShipFromPixels } from "@/lib/server-decode";
import { calculateShipPrice } from "@/lib/price";
import { insertShip, updateShip, getShipForReplacement, isShipOwner } from "@/lib/db";
import { getUserFromRequest, type UserPayload } from "@/lib/auth";
import { computeShipSignature } from "@/lib/ship-signature";
import { verifyTurnstileToken } from "@/lib/turnstile";

const f = createUploadthing();

function commonMiddleware({ req }: { req: Request }) {
  const headers = req.headers;

  let user: UserPayload | null = null;
  try {
    user = getUserFromRequest(req);
  } catch (e) {
    console.error("Invalid session token in upload middleware:", e);
  }

  const description = headers.get("x-description") ?? "";
  const brand = headers.get("x-brand") ?? "gen";
  const authorOverride = headers.get("x-author") ?? "";

  let userTags: string[] = [];
  const tagsHeader = headers.get("x-tags");
  if (tagsHeader) {
    try {
      const parsed = JSON.parse(tagsHeader);
      if (Array.isArray(parsed)) {
        userTags = parsed.filter((t: unknown) => typeof t === "string");
      }
    } catch (e) { console.error("Failed to parse user tags:", e); }
  }

  return { user, description, brand, userTags, authorOverride };
}

export const uploadRouter = {
  pngUploader: f({
    "image/png": {
      maxFileSize: "8MB",
      maxFileCount: 10,
    },
  })
    .middleware(async ({ req }) => {
      const { user, description, brand, userTags, authorOverride } = commonMiddleware({ req });

      if (!user) {
        throw new Error(
          "You must be logged in to upload ships. Please log in and try again."
        );
      }

      if (process.env.NODE_ENV !== "development") {
        const headers = req.headers;
        const turnstileToken = headers.get("x-turnstile-token") || "";
        const ip = (headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "").replace(/^::ffff:/, "");
        const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
        if (!turnstileOk) {
          throw new Error("Turnstile verification failed. Please complete the captcha.");
        }
      }

      return {
        submittedBy: user.username,
        submittedById: user.id,
        description,
        brand,
        userTags,
        authorOverride,
      };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      try {
        const imageData = await decodeShipFromUrl(file.ufsUrl);
        const shipData = decodeShipFromPixels(imageData);
        const priceInfo = calculateShipPrice(
          shipData as Parameters<typeof calculateShipPrice>[0]
        );
        const shipName = (file.name ?? "unknown").replace(".ship.png", "");

        const signature = computeShipSignature(shipData);

        const allTags = [...new Set([...priceInfo.tags, ...metadata.userTags])];

        const result = await insertShip({
          name: file.name ?? "unknown",
          data: file.ufsUrl,
          submittedBy: metadata.submittedBy,
          submittedById: metadata.submittedById,
          description: metadata.description,
          shipName,
          author: metadata.authorOverride || priceInfo.author,
          price: priceInfo.price,
          brand: metadata.brand,
          crew: priceInfo.crew,
          tags: allTags,
          signature,
        });

        return { shipId: result.success ? parseInt(result.success, 10) : null };
      } catch (err) {
        console.error("Failed to process uploaded ship:", err);
        return { shipId: null };
      }
    }),

  shipReplacer: f({
    "image/png": {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const { user, description, brand, userTags } = commonMiddleware({ req });

      if (!user) {
        throw new Error("You must be logged in to replace ships.");
      }

      const shipIdHeader = req.headers.get("x-ship-id");
      if (!shipIdHeader) {
        throw new Error("Missing x-ship-id header");
      }
      const shipId = parseInt(shipIdHeader, 10);
      if (isNaN(shipId)) {
        throw new Error("Invalid x-ship-id header");
      }

      const ship = await getShipForReplacement(shipId);
      if (!ship) {
        throw new Error("Ship not found");
      }
      if (!ship || !isShipOwner(ship, { id: user.id, username: user.username })) {
        throw new Error("You do not own this ship");
      }

      return { submittedBy: user.username, submittedById: user.id, shipId, oldData: ship.data, description, brand, userTags };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      try {
        const imageData = await decodeShipFromUrl(file.ufsUrl);
        const shipData = decodeShipFromPixels(imageData);
        const priceInfo = calculateShipPrice(
          shipData as Parameters<typeof calculateShipPrice>[0]
        );
        const signature = computeShipSignature(shipData);

        const allTags = [...new Set([...priceInfo.tags, ...metadata.userTags])];

        await updateShip({
          id: metadata.shipId,
          name: file.name ?? "unknown",
          data: file.ufsUrl,
          submittedBy: metadata.submittedBy,
          submittedById: metadata.submittedById,
          description: metadata.description,
          shipName: (file.name ?? "unknown").replace(".ship.png", ""),
          author: priceInfo.author,
          price: priceInfo.price,
          brand: metadata.brand,
          crew: priceInfo.crew,
          tags: allTags,
          signature,
        });

        if (metadata.oldData) {
          try {
            const url = new URL(metadata.oldData);
            const fileKey = url.pathname.split("/").pop();
            if (fileKey) {
              const utapi = new UTApi();
              await utapi.deleteFiles(fileKey);
            }
          } catch (e) {
            console.error("Failed to delete old file from UploadThing:", e);
            // best-effort
          }
        }

        return { shipId: metadata.shipId };
      } catch (err) {
        console.error("Failed to process replacement ship:", err);
        throw new Error("Replacement processing failed");
      }
    }),
};
