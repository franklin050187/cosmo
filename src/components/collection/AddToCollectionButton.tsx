"use client";

import Button from "@/components/ui/Button";
import CollectionPicker from "./CollectionPicker";

interface Props {
  shipId: number;
}

export default function AddToCollectionButton({ shipId }: Props) {
  return (
    <CollectionPicker
      shipId={shipId}
      className="inline-block"
    >
      <Button>Add to Collection</Button>
    </CollectionPicker>
  );
}
