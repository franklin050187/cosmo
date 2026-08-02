import ShipCard from "./ShipCard";
import { type ShipRow } from "@/lib/db";

export default function ShipGrid({ ships }: { ships: ShipRow[] }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {ships.map((ship, i) => (
        <ShipCard key={ship.id} ship={ship} priority={i < 4} />
      ))}
    </ul>
  );
}
