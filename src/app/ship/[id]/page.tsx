import type { Metadata } from "next";
import { getImageData } from "@/lib/db";
import ShipDetailView from "@/components/ship/ShipDetailView";

const cleanName = (raw: string) => raw.replace(/\.ship\.png$/i, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const shipId = parseInt(id, 10);
  if (isNaN(shipId)) {
    return { title: "Ship not found" };
  }
  const ship = await getImageData(shipId);
  if (!ship) {
    return { title: "Ship not found" };
  }
  const name = cleanName(ship.ship_name || "Ship");
  const description = ship.description || `A Cosmoteer ship design by ${ship.author || ship.submitted_by}.`;
  const images = ship.data ? [{ url: ship.data }] : [];
  return {
    title: name,
    description,
    alternates: { canonical: `/ship/${shipId}` },
    openGraph: {
      title: name,
      description,
      url: `/ship/${shipId}`,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images,
    },
  };
}

export default async function ShipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shipId = parseInt(id, 10);
  const ship = isNaN(shipId) ? null : await getImageData(shipId);
  return <ShipDetailView shipId={shipId} initialShip={ship} />;
}